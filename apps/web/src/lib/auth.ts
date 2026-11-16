import { prisma } from "@jakab/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { ACCOUNT_DEACTIVATED, PASSWORD_UNCHANGED } from "./auth-codes";
import { resolveAuthSecret } from "./auth-secret";
import {
  BOOTSTRAP_TOKEN_HEADER,
  bootstrapTokenAccepted,
  configuredBootstrapToken,
} from "./bootstrap-token";
import { parseTrustedProxies } from "./trusted-proxies";

const secret = resolveAuthSecret(process.env);
const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXIES);

/** Sign-up is open only for the very first account, unless ALLOW_SIGNUP=true. */
export const signupAllowedByEnv = process.env.ALLOW_SIGNUP === "true";

export const auth = betterAuth({
  appName: "J.a.ka.b",
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  secret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  // The sign-in rate limit counts attempts per client address. Behind another reverse proxy the
  // address is only known by skipping that proxy's hop (TRUSTED_PROXIES, same list as in Caddy).
  ...(trustedProxies.length > 0 && { advanced: { ipAddress: { trustedProxies } } }),
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "member", input: false },
      avatarColor: { type: "string", defaultValue: "#6366f1", input: false },
      // Read with every session, never set through the auth routes (see `server/users.ts`).
      deactivatedAt: { type: "date", required: false, input: false },
      mustChangePassword: { type: "boolean", defaultValue: false, input: false },
    },
  },
  hooks: {
    // "Changing" a password to itself would end the forced change after a reset without replacing
    // the temporary password. (Somebody set on keeping it can still change it twice: this stops
    // the shortcut, not a deliberate choice about one's own password.)
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password") return;
      const body = ctx.body as { currentPassword?: unknown; newPassword?: unknown } | undefined;
      if (typeof body?.newPassword === "string" && body.newPassword === body.currentPassword) {
        throw new APIError("BAD_REQUEST", {
          message: "The new password must differ from the current one",
          code: PASSWORD_UNCHANGED,
        });
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // A deactivated account cannot sign in. The check runs after the password was verified,
        // so the message tells nothing to somebody who does not know the password.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { deactivatedAt: true },
          });
          if (user?.deactivatedAt) {
            throw new APIError("FORBIDDEN", {
              message: "This account is deactivated",
              code: ACCOUNT_DEACTIVATED,
            });
          }
        },
      },
    },
    account: {
      update: {
        // The only thing the auth routes update on a credential account is its password, and
        // only for the person themselves: a temporary password set by an administrator (written
        // directly, not through these hooks) has been replaced.
        after: async (account) => {
          if (account.providerId !== "credential") return;
          await prisma.user.updateMany({
            where: { id: account.userId, mustChangePassword: true },
            data: { mustChangePassword: false },
          });
        },
      },
    },
    user: {
      create: {
        before: async (user, context) => {
          const isFirst = (await prisma.user.count()) === 0;
          if (!isFirst && !signupAllowedByEnv) {
            throw new APIError("FORBIDDEN", { message: "Sign-up is disabled" });
          }
          // A new public instance is claimed by whoever registers first: with BOOTSTRAP_TOKEN set,
          // that has to be somebody who knows it.
          const provided = (context?.headers ?? context?.request?.headers)?.get(
            BOOTSTRAP_TOKEN_HEADER,
          );
          if (isFirst && !bootstrapTokenAccepted(configuredBootstrapToken(), provided ?? null)) {
            throw new APIError("FORBIDDEN", { message: "Setup token required" });
          }
          return { data: { ...user, role: isFirst ? "admin" : "member" } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
