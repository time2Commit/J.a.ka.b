import { FileText } from "lucide-react";
import type { CardDto, Member } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Rendered inside each calendar event: labels, project, status badge, members, progress bar. */
export function CardContent({
  card,
  users,
  compact,
}: {
  card: CardDto;
  users: Member[];
  compact: boolean;
}) {
  const members = card.memberIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is Member => Boolean(u));
  const memberBadges = members.length > 0 && (
    <div className="flex -space-x-1">
      {members.slice(0, 3).map((m) => (
        <span
          key={m.id}
          title={m.name}
          className="flex size-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-background"
          style={{ backgroundColor: m.avatarColor }}
        >
          {m.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </div>
  );
  return (
    <div className="flex min-w-0 flex-col gap-1 overflow-hidden px-1.5 py-1 text-xs leading-tight">
      {card.labels.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-0.5">
          {card.labels.map((l) => (
            <span
              key={l.id}
              title={l.name}
              className={cn(
                "max-w-full truncate text-white",
                compact
                  ? "h-1.5 w-4 rounded-full"
                  : "rounded-sm px-1 py-px text-[9px] leading-none font-medium",
              )}
              style={{ backgroundColor: l.color }}
            >
              {compact ? <span className="sr-only">{l.name}</span> : l.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex min-w-0 items-center gap-1">
        <FileText className="size-3 shrink-0 opacity-60" aria-hidden />
        <span className="truncate font-semibold">{card.projectName}</span>
      </div>
      {card.title && !compact && <div className="truncate opacity-80">{card.title}</div>}
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="truncate rounded-full px-1.5 py-px text-[10px] font-medium text-white"
          style={{ backgroundColor: card.status.color }}
        >
          {card.status.name}
        </span>
        <span className="tabular-nums opacity-70">{card.progress}%</span>
        {compact && memberBadges}
      </div>
      {!compact && (
        <>
          {memberBadges}
          <div
            className="h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
            role="progressbar"
            aria-valuenow={card.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${card.progress}%`, backgroundColor: card.status.color }}
            />
          </div>
        </>
      )}
    </div>
  );
}
