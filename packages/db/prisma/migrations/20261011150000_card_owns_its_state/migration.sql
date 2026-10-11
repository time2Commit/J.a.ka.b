-- Status, progress, labels and members move onto the card.
-- Existing cards keep exactly what they showed: their own override, else the project's value.

-- AlterTable
ALTER TABLE "card" ADD COLUMN "statusId" TEXT,
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;

UPDATE "card" c
SET "statusId" = COALESCE(c."statusOverrideId", p."statusId"),
    "progress" = COALESCE(c."progressOverride", p."progress")
FROM "project" p
WHERE p."id" = c."projectId";

-- Cards without labels or members of their own showed the project's: make that explicit.
INSERT INTO "card_label" ("cardId", "labelId")
SELECT c."id", pl."labelId"
FROM "card" c
JOIN "project_label" pl ON pl."projectId" = c."projectId"
WHERE NOT EXISTS (SELECT 1 FROM "card_label" cl WHERE cl."cardId" = c."id");

INSERT INTO "card_member" ("cardId", "userId")
SELECT c."id", pm."userId"
FROM "card" c
JOIN "project_member" pm ON pm."projectId" = c."projectId"
WHERE NOT EXISTS (SELECT 1 FROM "card_member" cm WHERE cm."cardId" = c."id");

ALTER TABLE "card" ALTER COLUMN "statusId" SET NOT NULL;

ALTER TABLE "card" DROP CONSTRAINT "card_statusOverrideId_fkey";
ALTER TABLE "card" DROP COLUMN "statusOverrideId",
DROP COLUMN "progressOverride";

-- CreateIndex
CREATE INDEX "card_statusId_idx" ON "card"("statusId");

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
