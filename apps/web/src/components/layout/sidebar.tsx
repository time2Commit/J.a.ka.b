"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Further sections (projects, templates, settings) are added by later milestones.
const items = [{ href: "/", key: "calendar", icon: CalendarDays }] as const;

export function Sidebar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 md:flex-col">
      {items.map(({ href, key, icon: Icon }) => {
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
