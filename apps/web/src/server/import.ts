import type { Prisma, PrismaClient } from "@jakab/db";
import {
  archiveBoardSchema,
  archiveManifestSchema,
  archiveProjectSchema,
  archiveVersionsSchema,
  normalizeProjectName,
  type ArchiveBoard,
  type ArchiveManifest,
  type ArchiveProject,
} from "@jakab/shared";
import { randomBytes, randomUUID } from "node:crypto";
import { badRequest, HttpError } from "./errors";
import { mapNoteIds } from "./note-json";
import { notifyBoardChanged } from "./notify";
import type { StorageDriver } from "./storage";
import { createUser } from "./users";
import type { ZipArchive } from "./zip-reader";

const MB = 1024 * 1024;
const MAX_MANIFEST_BYTES = MB;
const MAX_JSON_BYTES = 50 * MB;
const MAX_VERSIONS_BYTES = 500 * MB;

export type ConflictChoice = "skip" | "rename" | "replace";

export interface ImportOptions {
  /** What to do with a project whose name already exists here. */
  conflict: ConflictChoice;
  /** Create accounts (with a temporary password) for people the archive mentions but this instance lacks. */
  createMissingUsers: boolean;
  /** Board archives: take over the workspace settings (time zone, work hours, first day). */
  applyWorkspace: boolean;
  /** Import only these projects (folder names from the preview); all when omitted. */
  slugs?: string[];
}

export interface ParsedProject {
  slug: string;
  data: ArchiveProject;
  hasVersions: boolean;
}

export interface ParsedArchive {
  manifest: ArchiveManifest;
  board: ArchiveBoard | null;
  projects: ParsedProject[];
}

async function readJson<T>(
  zip: ZipArchive,
  name: string,
  maxBytes: number,
  parse: (value: unknown) => T,
): Promise<T> {
  const raw = await zip.readBuffer(name, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw badRequest(`${name} is not valid JSON`);
  }
  try {
    return parse(value);
  } catch {
    throw badRequest(`${name} is not a valid backup file`);
  }
}

/** Reads and validates everything except the attachment bytes. Throws 400 for anything unexpected. */
export async function parseArchive(zip: ZipArchive): Promise<ParsedArchive> {
  if (!zip.has("manifest.json")) throw badRequest("Not a J.a.ka.b archive");
  const manifest = await readJson(zip, "manifest.json", MAX_MANIFEST_BYTES, (v) =>
    archiveManifestSchema.parse(v),
  );
  const board =
    manifest.kind === "board"
      ? await readJson(zip, "board.json", MAX_JSON_BYTES, (v) => archiveBoardSchema.parse(v))
      : null;

  const projects: ParsedProject[] = [];
  for (const { slug } of manifest.projects) {
    const dir = `projects/${slug}`;
    const data = await readJson(zip, `${dir}/project.json`, MAX_JSON_BYTES, (v) =>
      archiveProjectSchema.parse(v),
    );
    for (const attachment of data.attachments) {
      if (!zip.has(`${dir}/${attachment.file}`)) {
        throw badRequest(`Attachment file missing in ${slug}: ${attachment.file}`);
      }
    }
    projects.push({ slug, data, hasVersions: zip.has(`${dir}/versions.json`) });
  }
  return { manifest, board, projects };
}

export interface ImportPreview {
  kind: "project" | "board";
  exportedAt: string;
  hasWorkspace: boolean;
  projects: {
    slug: string;
    name: string;
    /** A project with this name already exists here. */
    exists: boolean;
    cards: number;
    attachments: number;
    hasVersions: boolean;
  }[];
  newStatuses: string[];
  newLabels: string[];
  people: { email: string; name: string | null; exists: boolean }[];
}

const emailKey = (email: string) => email.trim().toLowerCase();

/** People the archive refers to: board members plus anybody on a project or card. */
function referencedPeople(parsed: ParsedArchive) {
  const people = new Map<
    string,
    { email: string; name: string | null; role: "admin" | "member" }
  >();
  for (const u of parsed.board?.users ?? []) {
    people.set(emailKey(u.email), { email: emailKey(u.email), name: u.name, role: u.role });
  }
  for (const { data } of parsed.projects) {
    for (const email of [...data.members, ...data.cards.flatMap((c) => c.members)]) {
      if (!people.has(emailKey(email))) {
        people.set(emailKey(email), { email: emailKey(email), name: null, role: "member" });
      }
    }
  }
  return people;
}

export async function previewArchive(
  db: PrismaClient,
  parsed: ParsedArchive,
): Promise<ImportPreview> {
  const [statuses, labels, users, existing] = await Promise.all([
    db.status.findMany({ select: { name: true } }),
    db.label.findMany({ select: { name: true } }),
    db.user.findMany({ select: { email: true } }),
    db.project.findMany({
      where: {
        nameNormalized: { in: parsed.projects.map((p) => normalizeProjectName(p.data.name)) },
      },
      select: { nameNormalized: true },
    }),
  ]);
  const haveStatus = new Set(statuses.map((s) => s.name));
  const haveLabel = new Set(labels.map((l) => l.name));
  const haveUser = new Set(users.map((u) => emailKey(u.email)));
  const haveProject = new Set(existing.map((p) => p.nameNormalized));

  const wantedStatuses = [
    ...(parsed.board?.statuses ?? []),
    ...parsed.projects.flatMap((p) => [p.data.status]),
  ].map((s) => s.name);
  const wantedLabels = [
    ...(parsed.board?.labels ?? []),
    ...parsed.projects.flatMap((p) => p.data.labels),
  ].map((l) => l.name);

  return {
    kind: parsed.manifest.kind,
    exportedAt: parsed.manifest.exportedAt,
    hasWorkspace: parsed.board !== null,
    projects: parsed.projects.map((p) => ({
      slug: p.slug,
      name: p.data.name,
      exists: haveProject.has(normalizeProjectName(p.data.name)),
      cards: p.data.cards.length,
      attachments: p.data.attachments.length,
      hasVersions: p.hasVersions,
    })),
    newStatuses: [...new Set(wantedStatuses)].filter((n) => !haveStatus.has(n)),
    newLabels: [...new Set(wantedLabels)].filter((n) => !haveLabel.has(n)),
    people: [...referencedPeople(parsed).values()].map((p) => ({
      email: p.email,
      name: p.name,
      exists: haveUser.has(p.email),
    })),
  };
}

export interface ImportResult {
  imported: { slug: string; name: string; projectId: string; renamedFrom?: string }[];
  skipped: { slug: string; name: string }[];
  failed: { slug: string; name: string; message: string }[];
  /** Temporary passwords of accounts created by the import. Shown once, never stored in clear. */
  createdUsers: { email: string; name: string; password: string }[];
}

interface Context {
  db: PrismaClient;
  storage: StorageDriver;
  zip: ZipArchive;
  actorId: string;
  maxFileBytes: number;
  statusIds: Map<string, string>;
  labelIds: Map<string, string>;
  userIds: Map<string, string>;
  options: ImportOptions;
}

async function freeName(db: PrismaClient, name: string) {
  for (let n = 1; ; n++) {
    const candidate = `${name} (imported${n > 1 ? ` ${n}` : ""})`.slice(0, 120);
    const taken = await db.project.findUnique({
      where: { nameNormalized: normalizeProjectName(candidate) },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
}

async function importProject(ctx: Context, { slug, data }: ParsedProject) {
  const { db, storage, zip, options } = ctx;
  const existing = await db.project.findUnique({
    where: { nameNormalized: normalizeProjectName(data.name) },
    select: { id: true, attachments: { select: { storageKey: true } } },
  });
  if (existing && options.conflict === "skip") return null;
  const replacing = existing && options.conflict === "replace" ? existing : null;
  const name =
    existing && options.conflict === "rename" ? await freeName(db, data.name) : data.name;

  const projectId = randomUUID();
  const attachmentIds = new Map(data.attachments.map((a) => [a.id, randomUUID()]));

  // Bytes first. Whatever fails afterwards, the files stored so far are removed again.
  const stored: string[] = [];
  try {
    for (const a of data.attachments) {
      const key = `${projectId}/${attachmentIds.get(a.id)}`;
      const body = await zip.openStream(`projects/${slug}/${a.file}`);
      const { size, sha256 } = await storage.put(key, body, ctx.maxFileBytes);
      stored.push(key);
      if (sha256 !== a.sha256) throw badRequest(`Checksum mismatch for ${a.name}`);
      if (size !== a.size) throw badRequest(`Size mismatch for ${a.name}`);
    }

    const rewrite = (json: object) =>
      mapNoteIds(json, {
        attachment: (id) => attachmentIds.get(id) ?? id,
        mention: (id) => ctx.userIds.get(emailKey(id)) ?? id,
      }) as Prisma.InputJsonValue;
    const userIdsOf = (emails: string[]) =>
      emails.flatMap((e) => ctx.userIds.get(emailKey(e)) ?? []);
    const versions = ctx.zip.has(`projects/${slug}/versions.json`)
      ? await readJson(zip, `projects/${slug}/versions.json`, MAX_VERSIONS_BYTES, (v) =>
          archiveVersionsSchema.parse(v),
        )
      : { versions: [] };

    await db.$transaction(
      async (tx) => {
        if (replacing) await tx.project.delete({ where: { id: replacing.id } });
        await tx.project.create({
          data: {
            id: projectId,
            name,
            nameNormalized: normalizeProjectName(name),
            statusId: ctx.statusIds.get(data.status.name)!,
            progress: data.progress,
            color: data.color,
            archivedAt: data.archived ? new Date() : null,
            createdById: ctx.actorId,
            createdAt: new Date(data.createdAt),
            labels: {
              create: data.labels
                .flatMap((l) => ctx.labelIds.get(l.name) ?? [])
                .map((labelId) => ({ labelId })),
            },
            members: {
              create: [...new Set(userIdsOf(data.members))].map((userId) => ({ userId })),
            },
            cards: {
              create: data.cards.map((c) => ({
                title: c.title,
                start: new Date(c.start),
                end: new Date(c.end),
                allDay: c.allDay,
                statusOverrideId: c.statusOverride
                  ? (ctx.statusIds.get(c.statusOverride) ?? null)
                  : null,
                progressOverride: c.progressOverride,
                shortNotes: c.shortNotes,
                createdById: ctx.actorId,
                members: {
                  create: [...new Set(userIdsOf(c.members))].map((userId) => ({ userId })),
                },
                labels: {
                  create: c.labels
                    .flatMap((l) => ctx.labelIds.get(l) ?? [])
                    .map((labelId) => ({ labelId })),
                },
              })),
            },
            attachments: {
              create: data.attachments.map((a) => ({
                id: attachmentIds.get(a.id)!,
                originalName: a.name,
                mime: a.mime,
                size: a.size,
                sha256: a.sha256,
                storageKey: `${projectId}/${attachmentIds.get(a.id)}`,
                uploadedBy: ctx.actorId,
              })),
            },
            // No Yjs state: the collab server builds it from the JSON the first time the note opens.
            note: data.note
              ? { create: { json: rewrite(data.note), updatedBy: ctx.actorId } }
              : undefined,
            versions: {
              create: versions.versions.map((v) => ({
                // Versions are restored from their JSON, so an empty Yjs state is enough.
                yState: Buffer.alloc(0),
                json: rewrite(v.json),
                authors: userIdsOf(v.authors),
                reason: v.reason,
                label: v.label,
                createdAt: new Date(v.createdAt),
              })),
            },
          },
        });
        await tx.activity.create({
          data: {
            projectId,
            userId: ctx.actorId,
            type: "project.imported",
            payload: { name: data.name, replaced: Boolean(replacing) },
          },
        });
        await notifyBoardChanged(tx, "project", projectId);
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    await Promise.all(stored.map((key) => storage.remove(key).catch(() => undefined)));
    throw error;
  }

  // The replaced project's files are no longer referenced by anything.
  if (replacing) {
    await Promise.all(
      replacing.attachments.map((a) => storage.remove(a.storageKey).catch(() => undefined)),
    );
  }
  return { projectId, name, renamed: name !== data.name };
}

/** Finds or creates statuses and labels by name; returns name → id. */
async function ensureCatalog(
  db: PrismaClient,
  parsed: ParsedArchive,
): Promise<{ statusIds: Map<string, string>; labelIds: Map<string, string> }> {
  const statusIds = new Map((await db.status.findMany()).map((s) => [s.name, s.id]));
  let order = ((await db.status.aggregate({ _max: { order: true } }))._max.order ?? -1) + 1;
  const wantedStatuses = [
    ...(parsed.board?.statuses ?? []),
    ...parsed.projects.map((p) => p.data.status),
  ];
  for (const s of wantedStatuses) {
    if (statusIds.has(s.name)) continue;
    const created = await db.status.create({
      data: { name: s.name, color: s.color, isDone: s.isDone, order: order++ },
    });
    statusIds.set(s.name, created.id);
  }

  const labelIds = new Map((await db.label.findMany()).map((l) => [l.name, l.id]));
  const wantedLabels = [
    ...(parsed.board?.labels ?? []),
    ...parsed.projects.flatMap((p) => p.data.labels),
  ];
  for (const l of wantedLabels) {
    if (labelIds.has(l.name)) continue;
    const created = await db.label.create({ data: { name: l.name, color: l.color } });
    labelIds.set(l.name, created.id);
  }
  return { statusIds, labelIds };
}

/** Maps e-mail → user id, creating the missing accounts when asked. */
async function ensureUsers(
  db: PrismaClient,
  parsed: ParsedArchive,
  options: ImportOptions,
  hashPassword: (password: string) => Promise<string>,
) {
  const userIds = new Map(
    (await db.user.findMany({ select: { id: true, email: true } })).map((u) => [
      emailKey(u.email),
      u.id,
    ]),
  );
  const createdUsers: ImportResult["createdUsers"] = [];
  if (!options.createMissingUsers) return { userIds, createdUsers };

  for (const person of referencedPeople(parsed).values()) {
    if (userIds.has(person.email)) continue;
    const password = randomBytes(12).toString("base64url");
    const name = person.name ?? person.email.split("@")[0]!;
    const user = await createUser(
      db,
      { name, email: person.email, password, role: person.role },
      hashPassword,
    ).catch((error: unknown) => {
      // A malformed address in a hand-edited archive must not abort the whole import.
      if (error instanceof HttpError) return null;
      throw error;
    });
    if (!user) continue;
    userIds.set(person.email, user.id);
    createdUsers.push({ email: person.email, name, password });
  }
  return { userIds, createdUsers };
}

export async function applyArchive(
  db: PrismaClient,
  storage: StorageDriver,
  zip: ZipArchive,
  parsed: ParsedArchive,
  options: ImportOptions,
  env: {
    actorId: string;
    maxFileBytes: number;
    hashPassword: (password: string) => Promise<string>;
  },
): Promise<ImportResult> {
  if (options.applyWorkspace && parsed.board) {
    const { name, timeZone, workDayStart, workDayEnd, firstDayOfWeek } = parsed.board.workspace;
    await db.workspace.upsert({
      where: { id: "default" },
      create: { id: "default", name, timeZone, workDayStart, workDayEnd, firstDayOfWeek },
      update: { name, timeZone, workDayStart, workDayEnd, firstDayOfWeek },
    });
  }
  const { statusIds, labelIds } = await ensureCatalog(db, parsed);
  const { userIds, createdUsers } = await ensureUsers(db, parsed, options, env.hashPassword);
  const ctx: Context = {
    db,
    storage,
    zip,
    actorId: env.actorId,
    maxFileBytes: env.maxFileBytes,
    statusIds,
    labelIds,
    userIds,
    options,
  };

  const result: ImportResult = { imported: [], skipped: [], failed: [], createdUsers };
  const wanted = options.slugs ? new Set(options.slugs) : null;
  for (const project of parsed.projects) {
    if (wanted && !wanted.has(project.slug)) continue;
    const { slug } = project;
    const name = project.data.name;
    try {
      const done = await importProject(ctx, project);
      if (!done) result.skipped.push({ slug, name });
      else {
        result.imported.push({
          slug,
          name: done.name,
          projectId: done.projectId,
          ...(done.renamed && { renamedFrom: name }),
        });
      }
    } catch (error) {
      console.error(`import: ${slug} failed`, error);
      result.failed.push({
        slug,
        name,
        message: error instanceof HttpError ? error.message : "Could not import this project",
      });
    }
  }
  return result;
}
