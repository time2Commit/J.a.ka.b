import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** One block of the settings page: a title, an optional help line and the content. */
export function SectionCard({
  title,
  help,
  contentClassName,
  children,
}: {
  title: string;
  help?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {help && <p className="text-sm text-muted-foreground">{help}</p>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
