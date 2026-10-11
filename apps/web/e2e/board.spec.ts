import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE, todayInRome } from "./helpers";

// Depends on auth.spec.ts having created the admin account (runs after it, single worker).
test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
});

async function fillTimes(page: Page, start: string, end: string, date = todayInRome()) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date", { exact: true }).fill(date);
  await dialog.getByLabel("From", { exact: true }).fill(start);
  await dialog.getByLabel("To", { exact: true }).fill(end);
}

/** Types in the project combobox and picks the "Create project" entry. */
async function chooseNewProject(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill(name);
  await dialog.getByRole("option", { name: `Create project “${name.trim()}”` }).click();
}

async function createCard(
  page: Page,
  project: string,
  start: string,
  end: string,
  date = todayInRome(),
) {
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog");
  await chooseNewProject(page, project);
  await fillTimes(page, start, end, date);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Card created")).toBeVisible();
}

function yesterdayInRome() {
  const d = new Date(`${todayInRome()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

test("suggests existing projects (also with a typo) and links a new card to the chosen one", async ({
  page,
}) => {
  await createCard(page, "Shared", "08:00", "09:00");
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog");

  // Exact name (any case/spacing): only the existing project is offered, no "Create" entry.
  await dialog.getByLabel("Project name").fill("  shared ");
  await expect(dialog.getByRole("option", { name: /^Shared/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /Create project/ })).toHaveCount(0);

  // A typo still finds it through trigram similarity.
  await dialog.getByLabel("Project name").fill("Sharde");
  await expect(dialog.getByRole("option", { name: /^Shared/ })).toBeVisible();
  await dialog.getByRole("option", { name: /^Shared/ }).click();
  await expect(dialog.getByText("Existing project")).toBeVisible();

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

test("a project without upcoming cards can be dragged from 'To schedule' onto the calendar", async ({
  page,
}) => {
  await createCard(page, "Backlog item", "10:00", "11:00", yesterdayInRome());
  const item = page.locator("[data-project-name='Backlog item']");
  await expect(item).toBeVisible();

  // The all-day cell of today: the card ends tomorrow, so it is always "upcoming".
  const today = page.locator(".fc-daygrid-day.fc-day-today").first();
  await today.scrollIntoViewIfNeeded();
  const target = (await today.boundingBox())!;
  const from = (await item.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();

  await expect(page.getByText("Card scheduled")).toBeVisible();
  await expect(page.locator(".fc-daygrid-event", { hasText: "Backlog item" })).toBeVisible();
  // It now has an upcoming (or running) card: it leaves the backlog.
  await expect(page.locator("[data-project-name='Backlog item']")).toHaveCount(0);
});

test("quick search (Ctrl+K) jumps to a project's card and opens it", async ({ page }) => {
  await createCard(page, "Searchable project", "20:00", "21:00");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await palette.getByLabel("Quick search").fill("searchable");
  await palette.getByRole("option", { name: /Searchable project/ }).click();
  await expect(page.getByRole("dialog").getByText("Card details")).toBeVisible();
});

test("the last day follows the start and the times until it is chosen, also late in the evening", async ({
  page,
}) => {
  // 22:30 in Rome: the default one-hour draft starts at 23:00 and ends after midnight.
  await page.clock.setFixedTime(new Date("2026-10-04T20:30:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "New card" }).click();
  const dialog = page.getByRole("dialog");
  const date = dialog.getByLabel("Date", { exact: true });
  const lastDay = dialog.getByLabel("Last day");
  await expect(date).toHaveValue("2026-10-04");
  await expect(lastDay).toHaveValue("2026-10-05"); // 23:00 -> 00:00 crosses midnight

  // Moving the date keeps the span; fixing the times makes it a same-day card again.
  await date.fill("2026-10-10");
  await expect(lastDay).toHaveValue("2026-10-11");
  await dialog.getByLabel("From", { exact: true }).fill("06:00");
  await dialog.getByLabel("To", { exact: true }).fill("07:00");
  await expect(lastDay).toHaveValue("2026-10-10");

  // Once the last day is chosen by hand it is left alone.
  await lastDay.fill("2026-10-12");
  await dialog.getByLabel("To", { exact: true }).fill("08:00");
  await date.fill("2026-10-11");
  await expect(lastDay).toHaveValue("2026-10-12");
});

test("a card lists its labels above the name, then the status, then the members", async ({
  page,
  request,
}) => {
  const day = todayInRome();
  const label = await (
    await request.post("/api/labels", { data: { name: "Urgent layout", color: "#ef4444" } })
  ).json();
  const users = (await (await request.get("/api/users")).json()) as { id: string; name: string }[];
  const res = await request.post("/api/cards", {
    data: {
      projectName: "Layout project",
      start: `${day}T05:00:00Z`,
      end: `${day}T06:30:00Z`,
      labelIds: [label.id],
      memberIds: [users[0]!.id],
    },
  });
  expect(res.ok()).toBe(true);
  await page.reload();

  const card = page.locator(".fc-event", { hasText: "Layout project" });
  await expect(card).toBeVisible();
  const top = async (text: string | RegExp) =>
    (await card.getByText(text).first().boundingBox())!.y;
  const labelY = await top("Urgent layout");
  const nameY = await top("Layout project");
  const statusY = await top("To do");
  const memberY = (await card.locator(`[title='${users[0]!.name}']`).boundingBox())!.y;
  expect(labelY).toBeLessThan(nameY);
  expect(nameY).toBeLessThan(statusY);
  expect(statusY).toBeLessThan(memberY);
});

test("the calendar view picked by hand is the default the next time, on any device", async ({
  page,
  browser,
}) => {
  await page.getByRole("button", { name: "Month" }).click();
  await expect(page.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => {
      const meta = await page.request.get("/api/meta");
      return ((await meta.json()) as { preferences: { calendarView: string | null } }).preferences
        .calendarView;
    })
    .toBe("dayGridMonth");

  // A brand new browser session of the same account opens on the month view.
  const other = await browser.newContext({ storageState: STORAGE_STATE });
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByRole("button", { name: "Month" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await other.close();

  // Leave the shared account the way the other tests expect it.
  await page.getByRole("button", { name: "Week" }).click();
  await expect
    .poll(async () => {
      const meta = await page.request.get("/api/meta");
      return ((await meta.json()) as { preferences: { calendarView: string | null } }).preferences
        .calendarView;
    })
    .toBe("timeGridWeek");
});

test("renaming a status in use changes every card; deleting one moves its cards to another", async ({
  page,
  request,
}) => {
  const day = todayInRome();
  const created = await (
    await request.post("/api/statuses", { data: { name: "Temporary", color: "#8b5cf6" } })
  ).json();
  const res = await request.post("/api/cards", {
    data: {
      projectName: "Status moves",
      start: `${day}T03:00:00Z`,
      end: `${day}T04:00:00Z`,
      statusId: created.id,
    },
  });
  expect(res.ok()).toBe(true);
  await page.reload();
  const card = page.locator(".fc-event", { hasText: "Status moves" });
  await expect(card).toContainText("Temporary");

  // Rename it in Settings, then go back to the calendar: the card shows the new name.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForLoadState("networkidle");
  const nameInput = page.locator('input[value="Temporary"]');
  await nameInput.fill("Renamed in use");
  await nameInput.blur();
  await expect(page.locator('input[value="Renamed in use"]')).toBeVisible();
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(card).toContainText("Renamed in use");

  // Delete it while in use: choose where the card goes.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForLoadState("networkidle");
  const row = page.locator("li", { has: page.locator('input[value="Renamed in use"]') });
  await row.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Move them to").selectOption({ label: "Done" });
  await dialog.getByRole("button", { name: "Delete status" }).click();
  await expect(page.getByText("Status deleted")).toBeVisible();
  await expect(page.locator('input[value="Renamed in use"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(card).toContainText("Done");
});
