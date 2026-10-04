import { prisma } from "@jakab/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signupAllowedByEnv } from "./auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** True when the register page may be used (first run, or sign-up enabled by env). */
export async function isSignupOpen() {
  return signupAllowedByEnv || (await prisma.user.count()) === 0;
}
