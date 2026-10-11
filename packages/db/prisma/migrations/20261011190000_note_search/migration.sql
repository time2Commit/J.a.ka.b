-- AlterTable
ALTER TABLE "note_document" ADD COLUMN     "searchFolded" TEXT,
ADD COLUMN     "searchIndexedAt" TIMESTAMP(3),
ADD COLUMN     "searchText" TEXT;

-- Fast "contains" searches inside notes (pg_trgm is already enabled by the first migration).
CREATE INDEX "note_document_searchFolded_trgm_idx" ON "note_document" USING GIN ("searchFolded" gin_trgm_ops);
