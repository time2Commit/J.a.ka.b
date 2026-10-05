import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { badRequest, HttpError } from "./errors";
import { uploadRoot } from "./storage";

/** Uploaded archives wait here between the preview and the import (inside the upload volume). */
const dir = () => path.join(uploadRoot(), ".imports");

const ID = /^[0-9a-f-]{36}$/;

export const importMaxBytes = () => Number(process.env.IMPORT_MAX_MB ?? 4096) * 1024 * 1024;

export function importPath(id: string) {
  if (!ID.test(id)) throw badRequest("Invalid import id");
  return path.join(dir(), `${id}.zip`);
}

/** Streams the uploaded archive to disk, capped at `maxBytes`. */
export async function saveImportUpload(body: Readable, maxBytes: number) {
  const id = randomUUID();
  await mkdir(dir(), { recursive: true });
  const target = importPath(id);
  const partial = `${target}.part`;
  let size = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) return callback(new HttpError(413, "Archive too large"));
      callback(null, chunk);
    },
  });
  try {
    await pipeline(body, meter, createWriteStream(partial, { flags: "wx" }));
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  return { id, path: target, size };
}

export async function removeImport(id: string) {
  await rm(importPath(id), { force: true });
}

/** Deletes archives nobody finished importing. */
export async function cleanupStaleImports(maxAgeMs: number, now = Date.now()) {
  const names = await readdir(dir()).catch(() => [] as string[]);
  let removed = 0;
  for (const name of names) {
    const file = path.join(dir(), name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > maxAgeMs) {
      await rm(file, { force: true });
      removed++;
    }
  }
  return removed;
}
