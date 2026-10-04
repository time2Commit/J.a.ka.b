import { existsSync } from "node:fs";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const ADMIN = {
  name: "Mario Rossi",
  email: "mario.rossi@example.com",
  password: "password123",
};

export const STORAGE_STATE = "e2e/.auth/admin.json";

export async function signIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // let React hydrate before submitting
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
}

/** Today's date (yyyy-MM-dd) in the workspace time zone. */
export function todayInRome() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

export const MEMBER = {
  name: "Anna Neri",
  email: "anna.extras@example.com",
  password: "password456",
};
// A valid 1x1 PNG.
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function newProject(request: APIRequestContext, name: string) {
  const day = todayInRome();
  const res = await request.post("/api/cards", {
    data: { projectName: name, start: `${day}T08:00:00Z`, end: `${day}T09:00:00Z` },
  });
  const { card } = (await res.json()) as { card: { projectId: string } };
  return `/projects/${card.projectId}`;
}

export async function openNote(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId("note-status")).toHaveAttribute("data-status", "connected");
  const editor = page.getByRole("textbox", { name: "Write the project note…" });
  await expect(editor).toBeVisible();
  return editor;
}

export const MEMBER_STORAGE_STATE = "e2e/.auth/member.json";

/**
 * A browser context signed in as the member. The first call signs in through the UI and keeps the
 * session for the next ones: sign-in is rate limited by the auth library.
 */
export async function signInAsMember(browser: Browser, request: APIRequestContext) {
  await request.post("/api/users", { data: { ...MEMBER, role: "member" } }); // 409 when it exists
  if (existsSync(MEMBER_STORAGE_STATE)) {
    const context = await browser.newContext({ storageState: MEMBER_STORAGE_STATE });
    return { context, page: await context.newPage() };
  }
  // Empty storage state: the context must not inherit the admin session from `test.use`.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(MEMBER.email);
  await page.getByLabel("Password").fill(MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
  await context.storageState({ path: MEMBER_STORAGE_STATE });
  return { context, page };
}
