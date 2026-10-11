import { getTranslations } from "next-intl/server";
import { TreeShell } from "@/features/folders/tree-shell";
import { ProjectsTree } from "@/features/projects/projects-tree";

export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Projects");
  return (
    <TreeShell title={t("title")} basePath="/projects" tree={<ProjectsTree />}>
      {children}
    </TreeShell>
  );
}
