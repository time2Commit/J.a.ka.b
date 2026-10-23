import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@jakab/db";
import { getWorkspace } from "./workspace";

const row = { id: "default", name: "J.a.ka.b" };
const fakeDb = (existing: object | null) => {
  const findUnique = vi.fn().mockResolvedValue(existing);
  const upsert = vi.fn().mockResolvedValue(row);
  return {
    db: { workspace: { findUnique, upsert } } as unknown as PrismaClient,
    findUnique,
    upsert,
  };
};

describe("getWorkspace", () => {
  it("only reads when the workspace already exists", async () => {
    const { db, findUnique, upsert } = fakeDb(row);
    expect(await getWorkspace(db)).toBe(row);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "default" } });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("creates the workspace the first time", async () => {
    const { db, upsert } = fakeDb(null);
    expect(await getWorkspace(db)).toBe(row);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
