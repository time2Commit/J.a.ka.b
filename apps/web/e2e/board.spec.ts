import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE, todayInRome } from "./helpers";

// Depends on auth.spec.ts having created the admin account (runs after it, single worker).
test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
});

async function fillTimes(page: Page, start: string, end: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date", { exact: true }).fill(todayInRome());
  await dialog.getByLabel("From", { exact: true }).fill(start);
  await dialog.getByLabel("To", { exact: true }).fill(end);
}

async function createCard(page: Page, project: string, start: string, end: string) {
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill(project);
  await fillTimes(page, start, end);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Card created")).toBeVisible();
}

test("creates a card with a new project and shows status and progress on it", async ({ page }) => {
  await createCard(page, "Client X", "10:00", "11:00");
  const card = page.locator(".fc-event", { hasText: "Client X" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("To do");
  await expect(card).toContainText("0%");
  // 10:00 in the workspace time zone even though the browser runs in Tokyo.
  await expect(
    page.locator(".fc-timegrid-slot-label", { hasText: /^10(:00| ?AM)/i }).first(),
  ).toBeVisible();
});

test("a duplicate project name is rejected and cards can link an existing project", async ({
  page,
}) => {
  await createCard(page, "Shared", "08:00", "09:00");
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("  shared ");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/already exists/i)).toBeVisible();

  await dialog.getByRole("radio", { name: "Existing project" }).check();
  await dialog
    .getByRole("combobox", { name: "Existing project" })
    .selectOption({ label: "Shared" });
  await fillTimes(page, "14:00", "15:00");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.locator(".fc-event", { hasText: "Shared" })).toHaveCount(2);
});

test("dragging a card moves it and persists the new time", async ({ page }) => {
  await createCard(page, "Draggable", "12:00", "13:00");
  const card = page.locator(".fc-event", { hasText: "Draggable" });
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 10 + 60, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText("Card moved")).toBeVisible();

  const from = new Date(Date.now() - 7 * 864e5).toISOString();
  const to = new Date(Date.now() + 7 * 864e5).toISOString();
  const res = await page.request.get(`/api/cards?from=${from}&to=${to}`);
  const cards = (await res.json()) as { projectName: string; start: string }[];
  const moved = cards.find((c) => c.projectName === "Draggable")!;
  const originalStart = new Date(`${todayInRome()}T12:00:00+02:00`).getTime();
  expect(new Date(moved.start).getTime()).toBeGreaterThan(originalStart);
});

test("filters hide cards that do not match", async ({ page }) => {
  await createCard(page, "Alpha work", "16:00", "17:00");
  await page.getByPlaceholder("Search projects…").fill("zzz-no-match");
  await expect(page.locator(".fc-event", { hasText: "Alpha work" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".fc-event", { hasText: "Alpha work" })).toBeVisible();
});

test("admin manages statuses, labels and users", async ({ page }) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Name").first().fill("Review");
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.locator('input[value="Review"]')).toBeVisible();

  await page.getByLabel("Name", { exact: true }).last().fill("Anna Bianchi");
  await page.getByLabel("Email").fill("anna.bianchi@example.com");
  await page.getByLabel("Password").fill("password456");
  await page.getByRole("button", { name: "New user" }).click();
  await expect(page.getByText("User created")).toBeVisible();
  await expect(page.getByText("anna.bianchi@example.com")).toBeVisible();
});

test("a card created in one browser shows up live in another (SSE)", async ({ page, browser }) => {
  const other = await browser.newContext({ storageState: STORAGE_STATE, timezoneId: "Asia/Tokyo" });
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByRole("button", { name: "New card" })).toBeVisible();
  await otherPage.waitForLoadState("networkidle");

  await createCard(page, "Live sync", "18:00", "19:00");
  await expect(otherPage.locator(".fc-event", { hasText: "Live sync" })).toBeVisible();
  await other.close();
});

test("project status and progress edited in the panel show on every card of the project", async ({
  page,
}) => {
  await createCard(page, "Panel project", "06:00", "07:00");
  await page.locator(".fc-event", { hasText: "Panel project" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Status", { exact: true }).first().selectOption({ label: "In progress" });
  await panel.getByLabel(/^Progress:/).fill("60");
  await panel.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.keyboard.press("Escape");
  const card = page.locator(".fc-event", { hasText: "Panel project" });
  await expect(card).toContainText("In progress");
  await expect(card).toContainText("60%");
});
