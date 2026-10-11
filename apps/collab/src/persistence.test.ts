import { describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import * as Y from "yjs";
import { storeNote } from "./persistence";

describe("storeNote", () => {
  it("does not fail when the project was deleted while its note was open", async () => {
    const db = createPrismaClient();
    try {
      await expect(
        storeNote(db, `deleted-project-${Date.now().toString(36)}`, new Y.Doc(), null),
      ).resolves.toBeUndefined();
    } finally {
      await db.$disconnect();
    }
  });
});
