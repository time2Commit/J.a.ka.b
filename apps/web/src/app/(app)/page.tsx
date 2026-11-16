import { getTranslations } from "next-intl/server";
import { Board } from "@/features/calendar/board";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Calendar");
  return { title: t("title") };
}

export default async function CalendarPage() {
  await requireSession();
  return <Board />;
}
