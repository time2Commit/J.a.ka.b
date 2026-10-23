-- Before every search the notes whose searchable text is out of date are looked up
-- ("searchIndexedAt" differs from "updatedAt"). This index holds only those rows, so the lookup
-- stays cheap however many notes are up to date. Prisma cannot express a partial index in the
-- schema: like the trigram indexes, it exists only here.
CREATE INDEX IF NOT EXISTS "note_document_unindexed_idx" ON "note_document" ("projectId") WHERE "searchIndexedAt" IS DISTINCT FROM "updatedAt";
