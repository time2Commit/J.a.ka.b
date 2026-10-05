"use client";

import { CalendarDays, FileStack, FileText, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", key: "calendar", icon: CalendarDays, adminOnly: false },
  { href: "/projects", key: "projects", icon: FileText, adminOnly: false },
  { href: "/templates", key: "templates", icon: FileStack, adminOnly: false },
  { href: "/settings", key: "settings", icon: Settings, adminOnly: true },
] as const;

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 md:flex-col">
      {items
        .filter((item) => isAdmin || !item.adminOnly)
        .map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                active && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="max-md:sr-only">{t(key)}</span>
            </Link>
          );
        })}
    </nav>
  );
}
