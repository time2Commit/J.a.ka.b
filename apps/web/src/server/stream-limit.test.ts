import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { sizeLimiter } from "./stream-limit";

const sink = async (limiter: ReturnType<typeof sizeLimiter>, chunks: Buffer[]) => {
  const out: Buffer[] = [];
  await pipeline(Readable.from(chunks), limiter.stream, async function (source) {
    for await (const chunk of source) out.push(chunk as Buffer);
  });
  return Buffer.concat(out);
};

describe("sizeLimiter", () => {
  it("passes data through, counting it and showing every chunk to onChunk", async () => {
    const seen: number[] = [];
    const limiter = sizeLimiter(
      10,
      () => new Error("too large"),
      (c) => seen.push(c.length),
    );
    const out = await sink(limiter, [Buffer.from("abcd"), Buffer.from("efg")]);
    expect(out.toString()).toBe("abcdefg");
    expect(limiter.size()).toBe(7);
    expect(seen).toEqual([4, 3]);
  });

  it("accepts exactly the limit and refuses one byte more", async () => {
    await expect(
      sink(
        sizeLimiter(5, () => new Error("x")),
        [Buffer.alloc(5)],
      ),
    ).resolves.toBeTruthy();
    await expect(
      sink(
        sizeLimiter(5, () => new Error("too large")),
        [Buffer.alloc(3), Buffer.alloc(3)],
      ),
    ).rejects.toThrow("too large");
  });
});
