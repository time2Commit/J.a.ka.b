import { getTranslations } from "next-intl/server";
import { Board } from "@/features/calendar/board";

export async function generateMetadata() {
  const t = await getTranslations("Calendar");
  return { title: t("title") };
}

export default function CalendarPage() {
  return <Board />;
}
