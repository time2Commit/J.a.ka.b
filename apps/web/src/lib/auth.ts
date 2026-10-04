import { prisma } from "@jakab/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

const secret = process.env.AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET is required in production");
}

/** Sign-up is open only for the very first account, unless ALLOW_SIGNUP=true. */
export const signupAllowedByEnv = process.env.ALLOW_SIGNUP === "true";

export const auth = betterAuth({
  appName: "J.a.ka.b",
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  secret: secret ?? "dev-only-insecure-secret-change-me",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "member", input: false },
      avatarColor: { type: "string", defaultValue: "#6366f1", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const isFirst = (await prisma.user.count()) === 0;
          if (!isFirst && !signupAllowedByEnv) {
            throw new APIError("FORBIDDEN", { message: "Sign-up is disabled" });
          }
          return { data: { ...user, role: isFirst ? "admin" : "member" } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
