import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { createPrismaClient } from "@jakab/db";
import { NOTE_FIELD, noteDocumentName, ydocToJson } from "@jakab/editor";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import * as Y from "yjs";
import { createCollabServer } from "./server";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const ORIGIN = "http://localhost:3000";

let web: HttpServer;
let collab: ReturnType<typeof createCollabServer>;
let statusId: string;
let projectId: string;
const providers: HocuspocusProvider[] = [];
const sockets: HocuspocusProviderWebsocket[] = [];

/** Stand-in for the web app: "cookie: s=<name>" is a valid session for that user. */
function startFakeWeb() {
  return new Promise<HttpServer>((resolve) => {
    const server = createServer((req, res) => {
      const match = /s=(\w+)/.exec(req.headers.cookie ?? "");
      res.setHeader("content-type", "application/json");
      if (!match) return void res.end("null");
      res.end(
        JSON.stringify({ user: { id: `u-${match[1]}`, name: match[1], avatarColor: "#ef4444" } }),
      );
    });
    server.listen(0, () => resolve(server));
  });
}

function connect(opts: { cookie?: string; origin?: string; name?: string }) {
  const headers: Record<string, string> = { origin: opts.origin ?? ORIGIN };
  if (opts.cookie) headers.cookie = opts.cookie;
  // The browser sends cookies by itself; in Node the headers are added to the handshake.
  class WebSocketWithHeaders extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers });
    }
  }
  const doc = new Y.Doc();
  const websocketProvider = new HocuspocusProviderWebsocket({
    url: collab.webSocketURL,
    WebSocketPolyfill: WebSocketWithHeaders,
  });
  const provider = new HocuspocusProvider({
    websocketProvider,
    name: opts.name ?? noteDocumentName(projectId),
    document: doc,
    token: "session",
  });
  // With an explicit websocket provider the document must be attached to it by hand.
  provider.attach();
  providers.push(provider);
  sockets.push(websocketProvider);
  const outcome = new Promise<"synced" | "denied">((resolve) => {
    provider.on("synced", () => resolve("synced"));
    provider.on("authenticationFailed", () => resolve("denied"));
  });
  return { doc, provider, outcome };
}

const until = async (check: () => Promise<boolean> | boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout");
};

beforeAll(async () => {
  web = await startFakeWeb();
  collab = createCollabServer({
    db: prisma,
    port: 0,
    webUrl: `http://localhost:${(web.address() as AddressInfo).port}`,
    allowedOrigin: ORIGIN,
    storeDebounceMs: 100,
  });
  await collab.listen();
  statusId = (
    await prisma.status.create({ data: { name: `S ${run}`, color: "#111111", order: 95 } })
  ).id;
  const name = `Collab ${run}`;
  projectId = (
    await prisma.project.create({
      data: { name, nameNormalized: name.toLowerCase(), statusId, createdById: "u" },
    })
  ).id;
});

afterAll(async () => {
  providers.forEach((p) => p.destroy());
  sockets.forEach((s) => s.destroy());
  await collab.destroy();
  web.close();
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
});

const paragraph = (doc: Y.Doc, text: string) => {
  const fragment = doc.getXmlFragment(NOTE_FIELD);
  const node = new Y.XmlElement("paragraph");
  node.insert(0, [new Y.XmlText(text)]);
  fragment.push([node]);
};

describe("collab server", () => {
  it("rejects connections without a session, from another origin, or to unknown documents", async () => {
    expect(await connect({}).outcome).toBe("denied");
    expect(await connect({ cookie: "s=anna", origin: "http://evil.example.com" }).outcome).toBe(
      "denied",
    );
    expect(await connect({ cookie: "s=anna", name: noteDocumentName("missing") }).outcome).toBe(
      "denied",
    );
    expect(await connect({ cookie: "s=anna", name: "other:thing" }).outcome).toBe("denied");
  });

  it("syncs edits between two users and persists them in Postgres", async () => {
    const anna = connect({ cookie: "s=anna" });
    const luca = connect({ cookie: "s=luca" });
    expect(await anna.outcome).toBe("synced");
    expect(await luca.outcome).toBe("synced");

    paragraph(anna.doc, "Hello from Anna");
    await until(() => luca.doc.getXmlFragment(NOTE_FIELD).length === 1);
    expect(ydocToJson(luca.doc).content?.[0]?.content?.[0]?.text).toBe("Hello from Anna");

    await until(async () => {
      const note = await prisma.noteDocument.findUnique({ where: { projectId } });
      return Boolean(note?.yState && note.json);
    });
    const stored = await prisma.noteDocument.findUniqueOrThrow({ where: { projectId } });
    expect(stored.updatedBy).toMatch(/^u-(anna|luca)$/);
    expect(JSON.stringify(stored.json)).toContain("Hello from Anna");

    // Presence: both users are visible to each other through the awareness protocol.
    anna.provider.setAwarenessField("user", { name: "anna", color: "#ef4444" });
    await until(() =>
      [...(luca.provider.awareness?.getStates().values() ?? [])].some(
        (s) => (s as { user?: { name: string } }).user?.name === "anna",
      ),
    );
  });

  it("restores the persisted content for a user who connects later", async () => {
    const late = connect({ cookie: "s=marta" });
    expect(await late.outcome).toBe("synced");
    expect(ydocToJson(late.doc).content?.[0]?.content?.[0]?.text).toBe("Hello from Anna");
  });
});
