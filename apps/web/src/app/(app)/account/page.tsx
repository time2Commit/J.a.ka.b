import { getTranslations } from "next-intl/server";
import { AccountPage } from "@/features/account/account-page";
import { requireSession } from "@/lib/session";
import { mustChangePassword } from "@/lib/session-user";

export async function generateMetadata() {
  const t = await getTranslations("Account");
  return { title: t("title") };
}

/** Everyone's own page: their name and their password. Settings stay with the administrators. */
export default async function Account() {
  const session = await requireSession({ allowTemporaryPassword: true });
  return (
    <AccountPage
      name={session.user.name}
      email={session.user.email}
      temporaryPassword={mustChangePassword(session)}
    />
  );
}
