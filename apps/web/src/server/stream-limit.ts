import { Transform } from "node:stream";

/**
 * A pass-through stream that counts the bytes going through it and fails with `tooLarge()` as
 * soon as they exceed `maxBytes`. `onChunk` sees every chunk that is let through (for hashing).
 */
export function sizeLimiter(
  maxBytes: number,
  tooLarge: () => Error,
  onChunk?: (chunk: Buffer) => void,
) {
  let size = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) return callback(tooLarge());
      onChunk?.(chunk);
      callback(null, chunk);
    },
  });
  return { stream, size: () => size };
}
