import Link from "next/link";
import type { ReactNode } from "react";

/** The overview next to a tree: a short list of the latest items, or a line saying there are none. */
export function RecentList({
  heading,
  empty,
  isEmpty,
  listLabel,
  children,
}: {
  heading: string;
  /** Shown instead of the list when `isEmpty`. */
  empty: string;
  isEmpty: boolean;
  listLabel?: string;
  /** The rows: `RecentRow`s. */
  children: ReactNode;
}) {
  if (isEmpty) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <section aria-label={heading} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <ul className="flex flex-col divide-y rounded-xl border bg-card" aria-label={listLabel}>
        {children}
      </ul>
    </section>
  );
}

/** One row of a `RecentList`: icon, name with a line below it, and what goes on the right. */
export function RecentRow({
  href,
  icon,
  name,
  detail,
  children,
}: {
  href: string;
  icon: ReactNode;
  name: string;
  /** The small line under the name (the folder, and so on); left out when empty. */
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/50">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
        </span>
        {children}
      </Link>
    </li>
  );
}
