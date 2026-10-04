import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSignupOpen } from "@/lib/session";

export default async function RegisterPage() {
  if (!(await isSignupOpen())) redirect("/login");
  const t = await getTranslations("Auth");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("registerTitle")}</CardTitle>
        <CardDescription>{t("registerDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm mode="register" />
        <Link
          href="/login"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("haveAccount")}
        </Link>
      </CardContent>
    </Card>
  );
}
