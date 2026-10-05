import type { PrismaClient } from "@jakab/db";
// Subpath import: the Markdown serializer does not need the whole editor (Tiptap, Yjs).
import { jsonToMarkdown } from "@jakab/editor/markdown";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  type ArchiveBoard,
  type ArchiveManifest,
  type ArchiveProject,
  type ArchiveVersions,
} from "@jakab/shared";
import type { Readable } from "node:stream";
import yazl from "yazl";
import { HttpError, notFound } from "./errors";
import { sanitizeFileName } from "./attachments";
import { mapNoteIds } from "./note-json";
import type { StorageDriver } from "./storage";
import { parseDefaults } from "./templates";

export interface ExportOptions {
  /** Include the version history of every note. */
  includeVersions: boolean;
  /** Board archives only: also export archived projects. */
  includeArchived?: boolean;
}

/** Folder-safe name: lowercase letters, digits and dashes. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "project";
}

/** Gives every project a distinct folder name within one archive. */
function uniqueSlugs(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

interface ProjectBundle {
  data: ArchiveProject;
  versions: ArchiveVersions | null;
  /** Archive path (inside the project folder) → storage key of the bytes. */
  files: { file: string; storageKey: string; size: number }[];
}

/** Mentions carry the person's e-mail instead of a database id, so another instance can match them. */
function portableNote(json: unknown, emailById: Map<string, string>): ArchiveProject["note"] {
  if (!json) return null;
  return mapNoteIds(json, { mention: (id) => emailById.get(id) ?? id }) as ArchiveProject["note"];
}

async function loadBundle(
  db: PrismaClient,
  storage: StorageDriver,
  projectId: string,
  emailById: Map<string, string>,
  includeVersions: boolean,
): Promise<ProjectBundle> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      status: true,
      labels: { include: { label: true } },
      members: true,
      cards: {
        orderBy: { start: "asc" },
        include: { members: true, labels: { include: { label: true } }, statusOverride: true },
      },
      attachments: { orderBy: { createdAt: "asc" } },
      note: { select: { json: true } },
    },
  });
  if (!project) throw notFound("Project");

  const emails = (userIds: string[]) => userIds.flatMap((id) => emailById.get(id) ?? []).sort();

  const files: ProjectBundle["files"] = [];
  const attachments: ArchiveProject["attachments"] = [];
  for (const a of project.attachments) {
    // A row whose bytes are gone cannot be exported; leave it out instead of breaking the archive.
    const opened = await storage.open(a.storageKey).catch(() => null);
    if (!opened) {
      console.warn(`export: file missing for attachment ${a.id}`);
      continue;
    }
    opened.stream.destroy();
    const file = `attachments/${a.id}-${sanitizeFileName(a.originalName)}`;
    attachments.push({
      id: a.id,
      name: a.originalName,
      mime: a.mime,
      size: a.size,
      sha256: a.sha256,
      file,
    });
    files.push({ file, storageKey: a.storageKey, size: a.size });
  }

  const data: ArchiveProject = {
    name: project.name,
    status: {
      name: project.status.name,
      color: project.status.color,
      order: project.status.order,
      isDone: project.status.isDone,
    },
    progress: project.progress,
    color: project.color,
    archived: project.archivedAt !== null,
    createdAt: project.createdAt.toISOString(),
    labels: project.labels.map((l) => ({ name: l.label.name, color: l.label.color })),
    members: emails(project.members.map((m) => m.userId)),
    cards: project.cards.map((c) => ({
      title: c.title,
      start: c.start.toISOString(),
      end: c.end.toISOString(),
      allDay: c.allDay,
      statusOverride: c.statusOverride?.name ?? null,
      progressOverride: c.progressOverride,
      shortNotes: c.shortNotes,
      members: emails(c.members.map((m) => m.userId)),
      labels: c.labels.map((l) => l.label.name),
    })),
    attachments,
    note: portableNote(project.note?.json, emailById),
  };

  let versions: ArchiveVersions | null = null;
  if (includeVersions) {
    const rows = await db.noteVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { reason: true, label: true, createdAt: true, authors: true, json: true },
    });
    versions = {
      versions: rows.map((v) => ({
        reason: v.reason,
        label: v.label,
        createdAt: v.createdAt.toISOString(),
        authors: emails(v.authors),
        json: portableNote(v.json, emailById) as ArchiveVersions["versions"][number]["json"],
      })),
    };
  }
  return { data, versions, files };
}

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function addProject(
  zip: yazl.ZipFile,
  storage: StorageDriver,
  slug: string,
  bundle: ProjectBundle,
) {
  const dir = `projects/${slug}`;
  const byAttachment = new Map(bundle.data.attachments.map((a) => [a.id, a.file]));
  zip.addBuffer(json(bundle.data), `${dir}/project.json`);
  zip.addBuffer(
    Buffer.from(
      noteMarkdown(bundle.data, (embed) => byAttachment.get(embed.attachmentId) ?? null),
      "utf8",
    ),
    `${dir}/note.md`,
  );
  if (bundle.versions) zip.addBuffer(json(bundle.versions), `${dir}/versions.json`);
  for (const { file, storageKey, size } of bundle.files) {
    zip.addReadStreamLazy(`${dir}/${file}`, { size }, (cb) => {
      storage.open(storageKey).then(
        (opened) => cb(null, opened.stream),
        (error: Error) => cb(error, undefined as never),
      );
    });
  }
}

const yamlString = (value: string) => JSON.stringify(value);

/** Readable Markdown: front matter with the project's data, then the note. */
function noteMarkdown(
  project: ArchiveProject,
  attachmentPath: (embed: { attachmentId: string; name: string }) => string | null,
) {
  const lines = [
    "---",
    `name: ${yamlString(project.name)}`,
    `status: ${yamlString(project.status.name)}`,
    `progress: ${project.progress}`,
    `archived: ${project.archived}`,
    `labels: [${project.labels.map((l) => yamlString(l.name)).join(", ")}]`,
    `members: [${project.members.map(yamlString).join(", ")}]`,
    "cards:",
    ...project.cards.flatMap((c) => [
      `  - start: ${c.start}`,
      `    end: ${c.end}`,
      `    allDay: ${c.allDay}`,
      ...(c.title ? [`    title: ${yamlString(c.title)}`] : []),
    ]),
    "---",
    "",
  ];
  if (project.cards.length === 0) lines.splice(lines.indexOf("cards:"), 1, "cards: []");
  return `${lines.join("\n")}\n# ${project.name.replace(/\n/g, " ")}\n\n${jsonToMarkdown(project.note, { attachmentPath })}`;
}

function finish(zip: yazl.ZipFile): Readable {
  zip.end();
  return zip.outputStream as Readable;
}

async function emailMap(db: PrismaClient) {
  const users = await db.user.findMany({ select: { id: true, email: true } });
  return new Map(users.map((u) => [u.id, u.email]));
}

/** Zip of one project: manifest, `project.json`, `note.md`, attachments and optionally versions. */
export async function exportProject(
  db: PrismaClient,
  storage: StorageDriver,
  projectId: string,
  options: ExportOptions,
): Promise<{ stream: Readable; fileName: string }> {
  const bundle = await loadBundle(
    db,
    storage,
    projectId,
    await emailMap(db),
    options.includeVersions,
  );
  const [slug] = uniqueSlugs([bundle.data.name]) as [string];
  const zip = new yazl.ZipFile();
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    kind: "project",
    exportedAt: new Date().toISOString(),
    projects: [{ slug, name: bundle.data.name }],
  };
  zip.addBuffer(json(manifest), "manifest.json");
  addProject(zip, storage, slug, bundle);
  return { stream: finish(zip), fileName: `${slug}.zip` };
}

/** Zip of the whole board: settings, statuses, labels, people and every project. */
export async function exportBoard(
  db: PrismaClient,
  storage: StorageDriver,
  options: ExportOptions,
): Promise<{ stream: Readable; fileName: string }> {
  const [workspace, statuses, labels, users, projects, templates] = await Promise.all([
    db.workspace.findUnique({ where: { id: "default" } }),
    db.status.findMany({ orderBy: { order: "asc" } }),
    db.label.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.project.findMany({
      where: options.includeArchived ? {} : { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.template.findMany({ orderBy: { name: "asc" } }),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  // A project deleted while the export runs is simply left out.
  const bundles: ProjectBundle[] = [];
  for (const project of projects) {
    try {
      bundles.push(await loadBundle(db, storage, project.id, emailById, options.includeVersions));
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
  }
  const slugs = uniqueSlugs(bundles.map((b) => b.data.name));

  const board: ArchiveBoard = {
    workspace: {
      name: workspace?.name ?? "J.a.ka.b",
      timeZone: workspace?.timeZone ?? "Europe/Rome",
      workDayStart: workspace?.workDayStart ?? "08:00",
      workDayEnd: workspace?.workDayEnd ?? "19:00",
      firstDayOfWeek: workspace?.firstDayOfWeek ?? 1,
    },
    statuses: statuses.map((s) => ({
      name: s.name,
      color: s.color,
      order: s.order,
      isDone: s.isDone,
    })),
    labels: labels.map((l) => ({ name: l.name, color: l.color })),
    templates: templates.map((t) => {
      const defaults = parseDefaults(t.defaults);
      return {
        name: t.name,
        defaults: {
          status: statuses.find((s) => s.id === defaults.statusId)?.name ?? null,
          labels: defaults.labelIds.flatMap((id) => labels.find((l) => l.id === id)?.name ?? []),
          members: defaults.memberIds.flatMap((id) => emailById.get(id) ?? []),
          durationMin: defaults.durationMin,
          checklist: defaults.checklist,
        },
        note: portableNote(t.noteJson, emailById),
      };
    }),
    users: users.map((u) => ({
      name: u.name,
      email: u.email,
      avatarColor: u.avatarColor,
      role: u.role,
    })),
  };
  const exportedAt = new Date();
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    kind: "board",
    exportedAt: exportedAt.toISOString(),
    projects: bundles.map((b, i) => ({ slug: slugs[i]!, name: b.data.name })),
  };

  const zip = new yazl.ZipFile();
  zip.addBuffer(json(manifest), "manifest.json");
  zip.addBuffer(json(board), "board.json");
  for (const [i, bundle] of bundles.entries()) addProject(zip, storage, slugs[i]!, bundle);
  return {
    stream: finish(zip),
    fileName: `jakab-board-${exportedAt.toISOString().slice(0, 10)}.zip`,
  };
}
