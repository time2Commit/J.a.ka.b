import { prisma } from "@jakab/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

export default async function ProjectsPage() {
  await requireSession();
  const t = await getTranslations("Projects");
  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: { status: true, _count: { select: { cards: true } } },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <Badge color={p.status.color}>{p.status.name}</Badge>
                <span className="text-sm text-muted-foreground tabular-nums">{p.progress}%</span>
                <span className="text-sm text-muted-foreground">
                  {t("cards", { count: p._count.cards })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
