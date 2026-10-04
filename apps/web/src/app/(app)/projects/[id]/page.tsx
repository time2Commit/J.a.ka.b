import { prisma } from "@jakab/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NoteEditor } from "@/features/notes/note-editor";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  return { title: project?.name };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireSession();
  const project = await prisma.project.findUnique({ where: { id }, include: { status: true } });
  if (!project) notFound();
  const members = await prisma.user.findMany({
    select: { id: true, name: true, avatarColor: true },
    orderBy: { name: "asc" },
  });
  const t = await getTranslations("Projects");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <Badge color={project.status.color}>{project.status.name}</Badge>
        <span className="text-sm text-muted-foreground tabular-nums">{project.progress}%</span>
      </div>
      <NoteEditor
        projectId={project.id}
        user={{
          id: user.id,
          name: user.name,
          color: (user as { avatarColor?: string }).avatarColor ?? "#6366f1",
        }}
        users={members.map((m) => ({ id: m.id, name: m.name, color: m.avatarColor }))}
        // Read at request time (not build time) so the same image works behind any proxy.
        collabUrl={process.env.COLLAB_PUBLIC_URL ?? "ws://localhost:1234"}
      />
    </div>
  );
}
