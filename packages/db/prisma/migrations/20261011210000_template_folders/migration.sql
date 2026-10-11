-- AlterTable
ALTER TABLE "project_folder" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'project';

-- AlterTable
ALTER TABLE "template" ADD COLUMN     "folderId" TEXT;

-- CreateIndex
CREATE INDEX "template_folderId_idx" ON "template"("folderId");

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "project_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
