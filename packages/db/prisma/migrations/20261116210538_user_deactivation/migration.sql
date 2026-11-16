-- Accounts can be deactivated (never deleted) and can be made to choose a new password.
-- (Prisma also wants to drop the pg_trgm indexes it cannot model: they stay.)

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
