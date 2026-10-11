-- AlterTable
ALTER TABLE "user" ADD COLUMN     "projectSort" TEXT;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "project_folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_folder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_folder_parentId_idx" ON "project_folder"("parentId");

-- CreateIndex
CREATE INDEX "project_folderId_idx" ON "project"("folderId");

-- AddForeignKey
ALTER TABLE "project_folder" ADD CONSTRAINT "project_folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "project_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "project_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
