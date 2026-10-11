"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ProjectsTree } from "./projects-tree";

/**
 * The projects section: the tree on the left, the page (a note, or the overview) on the right.
 * On narrow screens they take turns: the tree on the overview, the note on a project.
 */
export function ProjectsShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Projects");
  const overview = usePathname() === "/projects";
  return (
    <div className="grid items-start gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
      <nav
        aria-label={t("title")}
        className={cn(
          "md:sticky md:top-4 md:max-h-[calc(100svh-6rem)] md:overflow-y-auto md:pr-1",
          overview ? "block" : "hidden md:block",
        )}
      >
        <h1 className="mb-3 px-1 text-lg font-semibold tracking-tight">{t("title")}</h1>
        <ProjectsTree />
      </nav>
      <div className={cn("min-w-0", overview ? "hidden md:block" : "block")}>{children}</div>
    </div>
  );
}
