-- External sources: a provider connection that feeds one read-only calendar, and its cached events.
-- (Prisma also wants to drop the pg_trgm indexes it cannot model: they stay.)

-- CreateTable
CREATE TABLE "calendar_source" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secret" TEXT,
    "secretHint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "state" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastSyncErrorCode" TEXT,
    "nextSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_event" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "details" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_source_calendarId_key" ON "calendar_source"("calendarId");

-- CreateIndex
CREATE INDEX "calendar_source_nextSyncAt_idx" ON "calendar_source"("nextSyncAt");

-- CreateIndex
CREATE INDEX "external_event_calendarId_start_end_idx" ON "external_event"("calendarId", "start", "end");

-- CreateIndex
CREATE UNIQUE INDEX "external_event_calendarId_externalId_key" ON "external_event"("calendarId", "externalId");

-- AddForeignKey
ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
