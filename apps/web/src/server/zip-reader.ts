import type { Readable } from "node:stream";
import yauzl from "yauzl";
import { badRequest } from "./errors";

export interface ZipArchive {
  names: string[];
  has(name: string): boolean;
  /** Whole entry in memory; refuses entries larger than `maxBytes` (guards against zip bombs). */
  readBuffer(name: string, maxBytes: number): Promise<Buffer>;
  openStream(name: string): Promise<Readable>;
  close(): void;
}

const MAX_ENTRIES = 100_000;

function wrap(zip: yauzl.ZipFile): Promise<ZipArchive> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    zip.on("error", reject);
    zip.on("entry", (entry: yauzl.Entry) => {
      if (entries.size >= MAX_ENTRIES) return reject(badRequest("Archive has too many files"));
      if (!entry.fileName.endsWith("/")) entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.on("end", () => {
      const get = (name: string) => {
        const entry = entries.get(name);
        if (!entry) throw badRequest(`Archive entry missing: ${name}`);
        return entry;
      };
      const open = (name: string) =>
        new Promise<Readable>((res, rej) => {
          zip.openReadStream(get(name), (error, stream) => (error ? rej(error) : res(stream)));
        });
      resolve({
        names: [...entries.keys()],
        has: (name) => entries.has(name),
        openStream: open,
        async readBuffer(name, maxBytes) {
          if (get(name).uncompressedSize > maxBytes)
            throw badRequest(`Archive entry too large: ${name}`);
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of await open(name)) {
            size += (chunk as Buffer).length;
            if (size > maxBytes) throw badRequest(`Archive entry too large: ${name}`);
            chunks.push(chunk as Buffer);
          }
          return Buffer.concat(chunks);
        },
        close: () => zip.close(),
      });
    });
    zip.readEntry();
  });
}

const options = { lazyEntries: true, strictFileNames: true, validateEntrySizes: true } as const;

export function openZipFile(path: string): Promise<ZipArchive> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, options, (error, zip) => {
      if (error) return reject(badRequest("Not a valid archive"));
      wrap(zip).then(resolve, reject);
    });
  });
}

export function openZipBuffer(buffer: Buffer): Promise<ZipArchive> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, options, (error, zip) => {
      if (error) return reject(badRequest("Not a valid archive"));
      wrap(zip).then(resolve, reject);
    });
  });
}
