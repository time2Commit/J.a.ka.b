import { getTranslations } from "next-intl/server";
import { TemplatesHome } from "@/features/templates/templates-home";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Templates");
  return { title: t("title") };
}

export default async function Templates() {
  await requireSession();
  return <TemplatesHome />;
}
