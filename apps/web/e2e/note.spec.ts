import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE, todayInRome } from "./helpers";

// Depends on auth.spec.ts having created the admin account (runs after it, single worker).
test.use({ storageState: STORAGE_STATE });

const MEMBER = { name: "Anna Bianchi", email: "anna.note@example.com", password: "password456" };

async function openNote(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId("note-status")).toHaveAttribute("data-status", "connected");
  const editor = page.getByRole("textbox", { name: "Write the project note…" });
  await expect(editor).toBeVisible();
  return editor;
}

test("two people edit the same note at the same time and the content persists", async ({
  page,
  browser,
  request,
}) => {
  // A project with one card, and a second user, created through the API.
  const day = todayInRome();
  const card = await request.post("/api/cards", {
    data: { projectName: "Shared note", start: `${day}T08:00:00Z`, end: `${day}T09:00:00Z` },
  });
  const { card: created } = (await card.json()) as { card: { projectId: string } };
  const noteUrl = `/projects/${created.projectId}`;
  const user = await request.post("/api/users", { data: { ...MEMBER, role: "member" } });
  expect(user.ok()).toBe(true);

  // Anna signs in with her own browser context.
  // Empty storage state: the context must not inherit the admin session from `test.use`.
  const annaContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const annaPage = await annaContext.newPage();
  await annaPage.goto("/login");
  await annaPage.waitForLoadState("networkidle");
  await annaPage.getByLabel("Email").fill(MEMBER.email);
  await annaPage.getByLabel("Password").fill(MEMBER.password);
  await annaPage.getByRole("button", { name: "Sign in" }).click();
  await expect(annaPage.getByRole("button", { name: "New card" })).toBeVisible();

  const mario = await openNote(page, noteUrl);
  const anna = await openNote(annaPage, noteUrl);

  // Presence: each sees two people in the note.
  await expect(page.getByText("2 people here")).toBeVisible();
  await expect(annaPage.getByText("2 people here")).toBeVisible();

  // Simultaneous typing, one in a heading created from the toolbar.
  await mario.click();
  await page.getByRole("button", { name: "Heading 2" }).click();
  await Promise.all([
    mario.pressSequentially("Plan from Mario", { delay: 20 }),
    anna.click().then(() => anna.pressSequentially("Notes from Anna", { delay: 20 })),
  ]);
  await expect(page.locator(".jakab-note h2", { hasText: "Plan from Mario" })).toBeVisible();
  await expect(annaPage.locator(".jakab-note h2", { hasText: "Plan from Mario" })).toBeVisible();
  await expect(page.locator(".jakab-note")).toContainText("Notes from Anna");
  await expect(annaPage.locator(".jakab-note")).toContainText("Notes from Anna");

  // Everybody leaves; after the store debounce the note is loaded back from Postgres.
  await annaContext.close();
  await page.goto("/");
  await page.waitForTimeout(3500);
  const reopened = await openNote(page, noteUrl);
  await expect(reopened).toContainText("Plan from Mario");
  await expect(reopened).toContainText("Notes from Anna");
  await expect(page.locator(".jakab-note h2", { hasText: "Plan from Mario" })).toBeVisible();
});

test("the project list links to the note", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("link", { name: /Shared note/ }).click();
  await expect(page.getByRole("heading", { name: "Shared note" })).toBeVisible();
  await expect(page.getByTestId("note-status")).toHaveAttribute("data-status", "connected");
});
