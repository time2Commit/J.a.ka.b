import { getTranslations } from "next-intl/server";
import { TreeShell } from "@/features/folders/tree-shell";
import { TemplatesTree } from "@/features/templates/templates-tree";

export default async function TemplatesLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Templates");
  return (
    <TreeShell title={t("title")} basePath="/templates" tree={<TemplatesTree />}>
      {children}
    </TreeShell>
  );
}
