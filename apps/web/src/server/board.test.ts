import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { createCard, deleteCard, listCards, updateCard } from "./cards";
import { createStatus, deleteStatus } from "./catalog";
import { updateProject } from "./projects";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const userId = `user-${run}`;
let statusId: string;
let doneStatusId: string;
const projectIds: string[] = [];
const statusIds: string[] = [];

const start = new Date("2026-10-05T09:00:00Z");
const end = new Date("2026-10-05T12:00:00Z");

beforeAll(async () => {
  const todo = await createStatus(prisma, { name: `Todo ${run}`, color: "#111111", isDone: false });
  const done = await createStatus(prisma, { name: `Done ${run}`, color: "#222222", isDone: true });
  statusId = todo.id;
  doneStatusId = done.id;
  statusIds.push(todo.id, done.id);
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.status.deleteMany({ where: { id: { in: statusIds } } });
  await prisma.$disconnect();
});

describe("cards", () => {
  it("creates a project, its note, an activity and the card in one go", async () => {
    const { card, createdProject } = await createCard(
      prisma,
      {
        projectName: `Client X ${run}`,
        start,
        end,
        allDay: false,
        labelIds: [],
        memberIds: [],
        statusId,
      },
      userId,
    );
    projectIds.push(card.projectId);
    expect(createdProject).toBe(true);
    expect(card.status.id).toBe(statusId);
    expect(card.progress).toBe(0);
    expect(await prisma.noteDocument.count({ where: { projectId: card.projectId } })).toBe(1);
    expect(await prisma.activity.count({ where: { projectId: card.projectId } })).toBe(2);
  });

  it("links several cards to the same project and rejects duplicate names", async () => {
    const first = await createCard(
      prisma,
      {
        projectName: `Shared ${run}`,
        start,
        end,
        allDay: false,
        labelIds: [],
        memberIds: [],
        statusId,
      },
      userId,
    );
    projectIds.push(first.card.projectId);
    const second = await createCard(
      prisma,
      { projectId: first.card.projectId, start, end, allDay: false, labelIds: [], memberIds: [] },
      userId,
    );
    expect(second.createdProject).toBe(false);
    expect(second.card.projectId).toBe(first.card.projectId);

    await expect(
      createCard(
        prisma,
        { projectName: `  SHARED ${run} `, start, end, allDay: false, labelIds: [], memberIds: [] },
        userId,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("shows project status/progress on every card and honors per-card overrides", async () => {
    const a = await createCard(
      prisma,
      {
        projectName: `Progress ${run}`,
        start,
        end,
        allDay: false,
        labelIds: [],
        memberIds: [],
        statusId,
      },
      userId,
    );
    const projectId = a.card.projectId;
    projectIds.push(projectId);
    const b = await createCard(
      prisma,
      { projectId, start, end, allDay: false, labelIds: [], memberIds: [] },
      userId,
    );

    await updateProject(prisma, projectId, { statusId: doneStatusId, progress: 60 }, userId);
    const cards = (await listCards(prisma, new Date("2026-10-01"), new Date("2026-10-10"))).filter(
      (c) => c.projectId === projectId,
    );
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.status.id === doneStatusId && c.progress === 60)).toBe(true);

    const overridden = await updateCard(
      prisma,
      b.card.id,
      { statusOverrideId: statusId, progressOverride: 10 },
      userId,
    );
    expect(overridden.status.id).toBe(statusId);
    expect(overridden.progress).toBe(10);
    expect(overridden.statusOverridden && overridden.progressOverridden).toBe(true);

    const cleared = await updateCard(
      prisma,
      b.card.id,
      { statusOverrideId: null, progressOverride: null },
      userId,
    );
    expect(cleared.status.id).toBe(doneStatusId);
    expect(cleared.progress).toBe(60);
  });

  it("moves a card and only lists cards overlapping the requested range", async () => {
    const { card } = await createCard(
      prisma,
      {
        projectName: `Range ${run}`,
        start,
        end,
        allDay: false,
        labelIds: [],
        memberIds: [],
        statusId,
      },
      userId,
    );
    projectIds.push(card.projectId);
    const moved = await updateCard(
      prisma,
      card.id,
      { start: new Date("2026-12-01T09:00:00Z"), end: new Date("2026-12-01T10:00:00Z") },
      userId,
    );
    expect(moved.start).toBe("2026-12-01T09:00:00.000Z");
    const inOctober = await listCards(prisma, new Date("2026-10-01"), new Date("2026-11-01"));
    expect(inOctober.some((c) => c.id === card.id)).toBe(false);
    await expect(
      updateCard(prisma, card.id, { end: new Date("2026-11-01T00:00:00Z") }, userId),
    ).rejects.toMatchObject({ status: 409 });
    await deleteCard(prisma, card.id, userId);
    expect(await prisma.card.count({ where: { id: card.id } })).toBe(0);
  });
});

describe("statuses", () => {
  it("refuses to delete a status that is in use", async () => {
    await expect(deleteStatus(prisma, statusId)).rejects.toMatchObject({ status: 409 });
  });
});
