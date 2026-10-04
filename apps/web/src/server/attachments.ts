import type { PrismaClient } from "@jakab/db";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { notFound } from "./errors";
import type { StorageDriver } from "./storage";

export interface AttachmentDto {
  id: string;
  name: string;
  mime: string;
  size: number;
}

const MIME_PATTERN = /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/i;

/** Last path segment, no control characters, at most 255 characters. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "file").slice(0, 255);
}

export function sanitizeMime(raw: string | null | undefined): string {
  const mime = (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_PATTERN.test(mime) ? mime : "application/octet-stream";
}

/**
 * Stores an uploaded file for a project: bytes first (streamed, hashed, size-capped), then the
 * database row. If the row cannot be written the file is removed again.
 */
export async function saveAttachment(
  db: PrismaClient,
  storage: StorageDriver,
  input: {
    projectId: string;
    userId: string;
    name: string;
    mime: string | null;
    body: Readable;
    maxBytes: number;
  },
): Promise<AttachmentDto> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true },
  });
  if (!project) throw notFound("Project");

  const id = randomUUID();
  const storageKey = `${input.projectId}/${id}`;
  const name = sanitizeFileName(input.name);
  const mime = sanitizeMime(input.mime);

  const { size, sha256 } = await storage.put(storageKey, input.body, input.maxBytes);
  try {
    await db.$transaction([
      db.attachment.create({
        data: {
          id,
          projectId: input.projectId,
          originalName: name,
          mime,
          size,
          sha256,
          storageKey,
          uploadedBy: input.userId,
        },
      }),
      db.activity.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          type: "file.added",
          payload: { attachmentId: id, name, size },
        },
      }),
    ]);
  } catch (error) {
    await storage.remove(storageKey);
    throw error;
  }
  return { id, name, mime, size };
}

export async function getAttachment(db: PrismaClient, id: string) {
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) throw notFound("Attachment");
  return attachment;
}
