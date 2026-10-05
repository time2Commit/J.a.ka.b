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
const leftovers: string[] = [];

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
    maxPayloadBytes: 1024 * 1024,
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
  await prisma.project.deleteMany({ where: { id: { in: [projectId, ...leftovers] } } });
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
  it("closes a connection that sends a message above the size limit", async () => {
    const socket = new WebSocket(collab.webSocketURL, { headers: { origin: ORIGIN } });
    const code = await new Promise<number>((resolve, reject) => {
      socket.on("open", () => socket.send(Buffer.alloc(2 * 1024 * 1024)));
      socket.on("close", (c) => resolve(c));
      socket.on("error", reject);
    });
    expect(code).toBe(1009);
  });

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

  it("builds the live document from the stored JSON when a note was created from content", async () => {
    const name = `Collab imported ${run}`;
    const imported = await prisma.project.create({
      data: { name, nameNormalized: name.toLowerCase(), statusId, createdById: "u" },
    });
    try {
      await prisma.noteDocument.create({
        data: {
          projectId: imported.id,
          json: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "From an archive" }] }],
          },
        },
      });
      const reader = connect({ cookie: "s=anna", name: noteDocumentName(imported.id) });
      expect(await reader.outcome).toBe("synced");
      expect(JSON.stringify(ydocToJson(reader.doc))).toContain("From an archive");
    } finally {
      // Removed after the server is gone: it still holds the document and would write it back.
      leftovers.push(imported.id);
    }
  });

  describe("versions", () => {
    const url = (path: string) => `http://localhost:${collab.address.port}${path}`;
    const post = (path: string, cookie?: string, body: unknown = {}) =>
      fetch(url(path), {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });

    it("refuses version requests without a valid session", async () => {
      expect((await post(`/internal/projects/${projectId}/versions`)).status).toBe(401);
      expect((await post(`/internal/projects/missing/versions`, "s=anna")).status).toBe(401);
    });

    it("saves a manual version, restores it non-destructively and updates connected editors", async () => {
      const anna = connect({ cookie: "s=anna" });
      expect(await anna.outcome).toBe("synced");

      const saved = await post(`/internal/projects/${projectId}/versions`, "s=anna", {
        label: "First draft",
      });
      expect(saved.status).toBe(201);
      const { id: versionId } = (await saved.json()) as { id: string };
      const stored = await prisma.noteVersion.findUniqueOrThrow({ where: { id: versionId } });
      expect(stored).toMatchObject({ reason: "manual", label: "First draft" });
      expect(JSON.stringify(stored.json)).toContain("Hello from Anna");

      paragraph(anna.doc, "Added later");
      await until(async () =>
        JSON.stringify(
          (await prisma.noteDocument.findUnique({ where: { projectId } }))?.json ?? null,
        ).includes("Added later"),
      );

      const restored = await post(
        `/internal/projects/${projectId}/versions/${versionId}/restore`,
        "s=luca",
      );
      expect(restored.status).toBe(200);
      const { preRestoreVersionId } = (await restored.json()) as { preRestoreVersionId: string };

      // The content that was live before the restore is kept as a version.
      const safety = await prisma.noteVersion.findUniqueOrThrow({
        where: { id: preRestoreVersionId },
      });
      expect(safety.reason).toBe("pre_restore");
      expect(JSON.stringify(safety.json)).toContain("Added later");

      // The connected editor sees the restored content, and so does the database.
      await until(() => !JSON.stringify(ydocToJson(anna.doc)).includes("Added later"));
      expect(JSON.stringify(ydocToJson(anna.doc))).toContain("Hello from Anna");
      await until(
        async () =>
          !JSON.stringify(
            (await prisma.noteDocument.findUnique({ where: { projectId } }))?.json ?? null,
          ).includes("Added later"),
      );
      expect(await prisma.activity.count({ where: { projectId, type: "version.restored" } })).toBe(
        1,
      );

      expect(
        (await post(`/internal/projects/${projectId}/versions/nope/restore`, "s=anna")).status,
      ).toBe(404);
    });

    it("takes an automatic version when the last editor leaves", async () => {
      // A project nobody else is connected to, so this client really is the last one.
      const name = `Collab solo ${run}`;
      const solo = await prisma.project.create({
        data: { name, nameNormalized: name.toLowerCase(), statusId, createdById: "u" },
      });
      try {
        const marta = connect({ cookie: "s=marta", name: noteDocumentName(solo.id) });
        expect(await marta.outcome).toBe("synced");
        const stored = async (text: string) => {
          const note = await prisma.noteDocument.findUnique({ where: { projectId: solo.id } });
          return JSON.stringify(note?.json ?? null).includes(text);
        };
        const versions = () =>
          prisma.noteVersion.findMany({
            where: { projectId: solo.id },
            orderBy: { createdAt: "asc" },
          });

        // The first save of a note with content is its baseline version.
        paragraph(marta.doc, "Baseline");
        await until(async () => (await versions()).length === 1);

        // Within the interval nothing new is taken, until the last editor leaves.
        paragraph(marta.doc, "Written before leaving");
        await until(() => stored("Written before leaving"));
        expect(await versions()).toHaveLength(1);

        marta.provider.destroy();
        await until(async () => (await versions()).length === 2);
        const last = (await versions())[1]!;
        expect(last.reason).toBe("auto");
        expect(last.authors).toEqual(["u-marta"]);
        expect(JSON.stringify(last.json)).toContain("Written before leaving");
      } finally {
        await prisma.project.delete({ where: { id: solo.id } });
      }
    });
  });
});
