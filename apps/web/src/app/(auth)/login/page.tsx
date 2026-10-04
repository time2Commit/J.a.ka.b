import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, isSignupOpen } from "@/lib/session";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const t = await getTranslations("Auth");
  const signupOpen = await isSignupOpen();
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm mode="login" />
        {signupOpen && (
          <Link
            href="/register"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("firstRunLink")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
