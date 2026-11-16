import { getTranslations } from "next-intl/server";
import { AccountPage } from "@/features/account/account-page";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Account");
  return { title: t("title") };
}

/** Everyone's own page: their name and their password. Settings stay with the administrators. */
export default async function Account() {
  const { user } = await requireSession();
  return <AccountPage name={user.name} email={user.email} />;
}
