import { getTranslations } from "next-intl/server";
import { ProjectsHome } from "@/features/projects/projects-home";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

export default async function ProjectsPage() {
  await requireSession();
  return <ProjectsHome />;
}
