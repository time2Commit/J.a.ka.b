import * as React from "react";
import { cn } from "@/lib/utils";

/** Colored pill; `color` is a #rrggbb value coming from the database. */
function Badge({
  color,
  className,
  style,
  ...props
}: React.ComponentProps<"span"> & { color: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 20%, transparent)`,
        color: `color-mix(in oklab, ${color} 70%, var(--foreground))`,
        ...style,
      }}
      {...props}
    />
  );
}

export { Badge };
