import { prisma } from "@jakab/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth, signupAllowedByEnv } from "./auth";
import { configuredBootstrapToken } from "./bootstrap-token";
import { isDeactivated, mustChangePassword } from "./session-user";

/** Read once per request: the layout and the page it wraps both ask for it. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The session of a request whose headers are at hand (a stream that outlives the request scope). */
export const sessionFromHeaders = (requestHeaders: Headers) =>
  auth.api.getSession({ headers: requestHeaders });

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * The session of a page, or a redirect: to the login page without one, and to the account page
 * while a temporary password has to be replaced. Only the account page itself and the layout
 * around it pass `allowTemporaryPassword`.
 */
export async function requireSession({ allowTemporaryPassword = false } = {}): Promise<Session> {
  const session = await getSession();
  if (!session || isDeactivated(session)) redirect("/login");
  if (!allowTemporaryPassword && mustChangePassword(session)) redirect("/account");
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
