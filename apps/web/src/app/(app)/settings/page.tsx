import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SettingsPage } from "@/features/settings/settings-page";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Settings");
  return { title: t("title") };
}

export default async function Settings() {
  const { user } = await requireSession();
  if ((user as { role?: string }).role !== "admin") redirect("/");
  return <SettingsPage />;
}
