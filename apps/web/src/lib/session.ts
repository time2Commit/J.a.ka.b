import { prisma } from "@jakab/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signupAllowedByEnv } from "./auth";
import { configuredBootstrapToken } from "./bootstrap-token";

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

/** True when the first account needs the setup token (`BOOTSTRAP_TOKEN`) and none exists yet. */
export async function needsBootstrapToken() {
  return configuredBootstrapToken() !== null && (await prisma.user.count()) === 0;
}
