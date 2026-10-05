import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, isHttps } from "./lib/csp";

const PUBLIC_PATHS = ["/login", "/register"];

/**
 * For every page: the Content-Security-Policy with a fresh nonce (passed to the app in request
 * headers so its own scripts carry it), HSTS when served over HTTPS, and an optimistic gate on
 * the session cookie (pages validate the session for real).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== "production", env: process.env });

  const { pathname } = request.nextUrl;
  const allowed = PUBLIC_PATHS.includes(pathname) || Boolean(getSessionCookie(request));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = allowed
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.redirect(new URL("/login", request.url));
  response.headers.set("Content-Security-Policy", csp);
  if (isHttps(process.env.APP_URL)) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
