import { createPrismaClient } from "@jakab/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listUnscheduled } from "./suggest";

vi.mock("../lib/session", () => ({
  getSession: async () => ({ user: { id: "partial-update-user", role: "admin" } }),
}));

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const NOTE = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Agenda" }] }],
};
const DEFAULTS = {
  statusId: null,
  labelIds: [],
  memberIds: [],
  durationMin: 90,
  checklist: ["Invite everyone"],
};

let userId: string;
let folderId: string;
let templateId: string;
let statusId: string;
let projectId: string;

const patch = async (
  handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
  body: unknown,
) => {
  const res = await handler(
    new Request(`http://localhost/api/x/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(res.status).toBe(200);
  return res.json();
};

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: { id: `u-patch-${run}`, name: "Patch User", email: `patch.${run}@example.com` },
    })
  ).id;
  folderId = (
    await prisma.projectFolder.create({ data: { kind: "template", name: `Folder ${run}` } })
  ).id;
  templateId = (
    await prisma.template.create({
      data: { name: `Partial ${run}`, defaults: DEFAULTS, noteJson: NOTE, createdBy: userId },
    })
  ).id;
  statusId = (
    await prisma.status.create({
      data: { name: `Done ${run}`, color: "#111111", order: 95, isDone: true },
    })
  ).id;
  const name = `Finished ${run}`;
  projectId = (
    await prisma.project.create({
      data: { name, nameNormalized: name.toLowerCase(), statusId, createdById: userId },
    })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.template.deleteMany({ where: { id: templateId } });
  await prisma.projectFolder.deleteMany({ where: { id: folderId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("PATCH /api/templates/:id changes only what is sent", () => {
  const stored = () => prisma.template.findUniqueOrThrow({ where: { id: templateId } });

  it("moving a template into a folder keeps its note and its defaults", async () => {
    const { PATCH } = await import("../app/api/templates/[id]/route");
    const moved = await patch(PATCH, templateId, { folderId });
    expect(moved).toMatchObject({ folderId, defaults: DEFAULTS, note: NOTE, hasNote: true });
    expect(await stored()).toMatchObject({ folderId, defaults: DEFAULTS, noteJson: NOTE });
  });

  it("renaming a template keeps its folder, its note and its defaults", async () => {
    const { PATCH } = await import("../app/api/templates/[id]/route");
    await patch(PATCH, templateId, { name: `Renamed ${run}` });
    expect(await stored()).toMatchObject({
      name: `Renamed ${run}`,
      folderId,
      defaults: DEFAULTS,
      noteJson: NOTE,
    });
  });

  it("saving from the editor (name, defaults, note) keeps the template in its folder", async () => {
    const { PATCH } = await import("../app/api/templates/[id]/route");
    const defaults = { ...DEFAULTS, durationMin: 30 };
    await patch(PATCH, templateId, { name: `Renamed ${run}`, defaults, note: NOTE });
    expect(await stored()).toMatchObject({ folderId, defaults, noteJson: NOTE });
  });

  it("still moves a template out of its folder when asked to", async () => {
    const { PATCH } = await import("../app/api/templates/[id]/route");
    await patch(PATCH, templateId, { folderId: null });
    expect(await stored()).toMatchObject({ folderId: null, noteJson: NOTE });
  });
});

describe("PATCH /api/statuses/:id changes only what is sent", () => {
  const stored = () => prisma.status.findUniqueOrThrow({ where: { id: statusId } });
  const unscheduledIds = async () => (await listUnscheduled(prisma)).map((p) => p.id);

  it("renaming or recoloring a done status keeps it done", async () => {
    const { PATCH } = await import("../app/api/statuses/[id]/route");
    await patch(PATCH, statusId, { name: `Shipped ${run}` });
    expect(await stored()).toMatchObject({ name: `Shipped ${run}`, isDone: true });
    await patch(PATCH, statusId, { color: "#222222" });
    expect(await stored()).toMatchObject({ color: "#222222", isDone: true });
    // Its projects stay out of the list of projects still to schedule.
    expect(await unscheduledIds()).not.toContain(projectId);
  });

  it("still clears the done flag when asked to", async () => {
    const { PATCH } = await import("../app/api/statuses/[id]/route");
    await patch(PATCH, statusId, { isDone: false });
    expect(await stored()).toMatchObject({ name: `Shipped ${run}`, isDone: false });
    expect(await unscheduledIds()).toContain(projectId);
  });
});
