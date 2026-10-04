import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const t = await getTranslations("App");
  const color = (user as { avatarColor?: string }).avatarColor ?? "#6366f1";
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex items-center justify-between gap-4 border-b p-3 md:w-56 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:p-4">
        <div className="px-3 text-lg font-bold tracking-tight">{t("name")}</div>
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-1 border-b px-4 py-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} color={color} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
