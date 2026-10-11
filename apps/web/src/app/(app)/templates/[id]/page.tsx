import { prisma } from "@jakab/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TemplateEditor } from "@/features/templates/template-editor";
import { requireSession } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id }, select: { name: true } });
  return { title: template?.name };
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();
  const t = await getTranslations("Templates");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/templates"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
      >
        <ArrowLeft className="size-4" /> {t("allTemplates")}
      </Link>
      <TemplateEditor templateId={id} />
    </div>
  );
}
