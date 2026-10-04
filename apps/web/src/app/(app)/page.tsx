import { getTranslations } from "next-intl/server";

export default async function CalendarPage() {
  const t = await getTranslations("Calendar");
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("placeholder")}</p>
    </section>
  );
}
