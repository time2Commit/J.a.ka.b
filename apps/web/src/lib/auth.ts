import { prisma } from "@jakab/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
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
    },
  },
  databaseHooks: {
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
