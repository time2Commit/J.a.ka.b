"use client";

import { usePathname } from "next/navigation";
import { useBoardEvents } from "@/features/calendar/use-board-events";
import { cn } from "@/lib/utils";

/**
 * A section with a tree: the tree on the left, the page (a note, an editor or the overview) on
 * the right. On narrow screens they take turns: the tree on the overview, the page on an item.
 */
export function TreeShell({
  title,
  basePath,
  tree,
  children,
}: {
  title: string;
  basePath: string;
  tree: React.ReactNode;
  children: React.ReactNode;
}) {
  useBoardEvents();
  const overview = usePathname() === basePath;
  return (
    <div className="grid items-start gap-6 md:grid-cols-[17rem_minmax(0,1fr)]">
      <nav
        aria-label={title}
        className={cn(
          "md:sticky md:top-4 md:max-h-[calc(100svh-6rem)] md:overflow-y-auto md:pr-1",
          overview ? "block" : "hidden md:block",
        )}
      >
        <h1 className="mb-3 px-1 text-lg font-semibold tracking-tight">{title}</h1>
        {tree}
      </nav>
      <div className={cn("min-w-0", overview ? "hidden md:block" : "block")}>{children}</div>
    </div>
  );
}
