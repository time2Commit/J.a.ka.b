import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileSystemStorage } from "./storage";

let root: string;
let storage: FileSystemStorage;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-storage-"));
  storage = new FileSystemStorage(root);
});
afterAll(() => rm(root, { recursive: true, force: true }));

const streamOf = (data: Buffer, chunk = 64) =>
  Readable.from(
    (function* () {
      for (let i = 0; i < data.length; i += chunk) yield data.subarray(i, i + chunk);
    })(),
  );

describe("FileSystemStorage", () => {
  it("streams a file to disk and reports size and sha256", async () => {
    const data = Buffer.from("hello attachments ".repeat(100));
    const result = await storage.put("p1/a1", streamOf(data), 10_000);
    expect(result.size).toBe(data.length);
    expect(result.sha256).toBe(createHash("sha256").update(data).digest("hex"));
    expect(await readFile(path.join(root, "p1/a1"))).toEqual(data);

    const { stream, size } = await storage.open("p1/a1");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(data);
    expect(size).toBe(data.length);
  });

  it("rejects a file above the limit with 413 and leaves no partial file", async () => {
    await expect(
      storage.put("p2/big", streamOf(Buffer.alloc(5000, 1)), 1000),
    ).rejects.toMatchObject({ status: 413 });
    expect(await readdir(path.join(root, "p2"))).toEqual([]);
  });

  it("refuses keys that could escape the storage root", async () => {
    for (const key of ["../outside", "a/../../b", "/abs", "a//b", "a b"]) {
      await expect(storage.put(key, streamOf(Buffer.from("x")), 10)).rejects.toThrow(
        /Invalid storage key/,
      );
    }
  });

  it("removes files", async () => {
    await storage.put("p3/gone", streamOf(Buffer.from("x")), 10);
    await storage.remove("p3/gone");
    await expect(storage.open("p3/gone")).rejects.toThrow();
  });
});
