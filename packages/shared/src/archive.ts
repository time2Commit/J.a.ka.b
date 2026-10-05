import { z } from "zod";

/**
 * Structured archive format shared by export and import (a zip):
 *
 *   manifest.json
 *   board.json                          (board archives only)
 *   projects/<slug>/project.json
 *   projects/<slug>/note.md             (readable copy; import uses the JSON)
 *   projects/<slug>/versions.json       (optional)
 *   projects/<slug>/attachments/<id>-<name>
 *
 * Bump `ARCHIVE_VERSION` for any change an older importer could not read.
 */
export const ARCHIVE_FORMAT = "jakab-backup";
export const ARCHIVE_VERSION = 1;

/** Folder name of a project inside the archive; never a path. */
const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const isoDate = z.string().datetime({ offset: true });
/** A document in the editor's JSON shape; the editor package validates it when it is loaded. */
const noteJson = z.object({ type: z.literal("doc") }).passthrough();

export const archiveStatusSchema = z.object({
  name: z.string().min(1).max(40),
  color,
  order: z.number().int().optional(),
  isDone: z.boolean().default(false),
});
export const archiveLabelSchema = z.object({ name: z.string().min(1).max(40), color });

export const archiveManifestSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  version: z.number().int().min(1).max(ARCHIVE_VERSION),
  kind: z.enum(["project", "board"]),
  exportedAt: isoDate,
  projects: z.array(z.object({ slug: slugSchema, name: z.string().min(1) })),
});

export const archiveTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  defaults: z.object({
    /** Catalog entries by name and people by e-mail, so another instance can match them. */
    status: z.string().nullable(),
    labels: z.array(z.string()),
    members: z.array(z.string()),
    durationMin: z
      .number()
      .int()
      .min(5)
      .max(7 * 24 * 60),
    checklist: z.array(z.string().max(200)).max(50),
  }),
  note: noteJson.nullable(),
});

export const archiveBoardSchema = z.object({
  workspace: z.object({
    name: z.string(),
    timeZone: z.string(),
    workDayStart: z.string(),
    workDayEnd: z.string(),
    firstDayOfWeek: z.number().int().min(0).max(6),
  }),
  statuses: z.array(archiveStatusSchema),
  labels: z.array(archiveLabelSchema),
  templates: z.array(archiveTemplateSchema).default([]),
  /** People, never credentials: accounts are re-created by an admin on the new instance. */
  users: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      avatarColor: z.string(),
      role: z.enum(["admin", "member"]),
    }),
  ),
});

export const archiveCardSchema = z.object({
  title: z.string().nullable(),
  start: isoDate,
  end: isoDate,
  allDay: z.boolean(),
  statusOverride: z.string().nullable(),
  progressOverride: z.number().int().min(0).max(100).nullable(),
  shortNotes: z.string().nullable(),
  members: z.array(z.string()),
  labels: z.array(z.string()),
});

export const archiveAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mime: z.string(),
  size: z.number().int().min(0),
  sha256: z.string(),
  /** Path of the bytes inside the project's folder, e.g. `attachments/<id>-<name>`. */
  file: z.string().regex(/^attachments\/[^/\\]+$/),
});

export const archiveProjectSchema = z.object({
  name: z.string().min(1).max(120),
  status: archiveStatusSchema,
  progress: z.number().int().min(0).max(100),
  color: color.nullable(),
  archived: z.boolean(),
  createdAt: isoDate,
  labels: z.array(archiveLabelSchema),
  /** Members by e-mail: accounts are matched on the target instance, never invented. */
  members: z.array(z.string()),
  cards: z.array(archiveCardSchema),
  attachments: z.array(archiveAttachmentSchema),
  note: noteJson.nullable(),
});

export const archiveVersionsSchema = z.object({
  versions: z.array(
    z.object({
      reason: z.enum(["auto", "manual", "pre_restore"]),
      label: z.string().nullable(),
      createdAt: isoDate,
      authors: z.array(z.string()),
      json: noteJson,
    }),
  ),
});

export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;
export type ArchiveBoard = z.infer<typeof archiveBoardSchema>;
export type ArchiveTemplate = z.infer<typeof archiveTemplateSchema>;
export type ArchiveProject = z.infer<typeof archiveProjectSchema>;
export type ArchiveVersions = z.infer<typeof archiveVersionsSchema>;

/** Choices made in the import preview. */
export const importOptionsSchema = z.object({
  conflict: z.enum(["skip", "rename", "replace"]).default("skip"),
  createMissingUsers: z.boolean().default(false),
  applyWorkspace: z.boolean().default(false),
  slugs: z.array(slugSchema).optional(),
});
export type ImportOptionsInput = z.infer<typeof importOptionsSchema>;
