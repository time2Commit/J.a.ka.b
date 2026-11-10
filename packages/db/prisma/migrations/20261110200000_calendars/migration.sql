-- Calendars: named, colored containers of cards, shared by the whole workspace. Every card belongs
-- to one. Existing cards go to the default calendar, created here with a fixed id (keep in sync
-- with DEFAULT_CALENDAR in packages/db/src/defaults.ts).

-- AlterTable
ALTER TABLE "user" ADD COLUMN "hiddenCalendarIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "calendar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'local',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "calendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_name_key" ON "calendar"("name");

INSERT INTO "calendar" ("id", "name", "color", "kind", "isDefault", "order")
VALUES ('main', 'Main', '#3b82f6', 'local', true, 0);

-- AlterTable: add the column, fill it for the existing cards, then make it required.
ALTER TABLE "card" ADD COLUMN "calendarId" TEXT;
UPDATE "card" SET "calendarId" = 'main';
ALTER TABLE "card" ALTER COLUMN "calendarId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "card_calendarId_idx" ON "card"("calendarId");

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
