import { expect, test } from "@playwright/test";
import { signInAsMember, STORAGE_STATE } from "./helpers";

// Depends on auth.spec.ts having created the admin account (runs after it, single worker).
test.use({ storageState: STORAGE_STATE });

// The web server of this suite registers a fixture source (JAKAB_TEST_SOURCES in the Playwright
// config): it needs no key and reports one all-day event today, without touching the network.
test("connects a source, shows its read-only event, hides its calendar and disconnects it", async ({
  page,
  request,
}) => {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");

  // Connect: check the source, then name the calendar.
  const entry = page.getByTestId("source-catalog-entry").filter({ hasText: "Test fixture" });
  await entry.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await dialog.getByLabel("Calendar name").fill("Fixture arrivals");
  await dialog.getByRole("button", { name: "Create calendar" }).click();
  await expect(page.getByText("Source connected")).toBeVisible();

  const row = page.getByTestId("source-row").filter({ hasText: "Fixture arrivals" });
  await expect(row.getByTestId("source-status")).toHaveText("Active");
  await expect(row).toContainText("Last updated");
  // No secret is ever in what the server sends about a source.
  const listed = await (await request.get("/api/sources")).text();
  expect(listed).not.toMatch(/"secret"|apiKey/);

  // Its calendar is listed with the others, and cannot be deleted from there.
  const calendars = page
    .locator("li")
    .filter({ has: page.locator('input[value="Fixture arrivals"]') });
  await expect(calendars.getByRole("button", { name: "Delete" })).toBeDisabled();

  // On the board: the event sits next to the cards, in the calendar's color, and cannot be moved.
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
  const event = page.locator(".fc-event", { hasText: "Fixture arrival" });
  await expect(event).toBeVisible();
  await expect(event).not.toHaveClass(/fc-event-draggable/);
  await expect(event).not.toHaveClass(/fc-event-resizable/);
  await expect(event).toContainText("Fixture arrival");
  await expect(event).not.toContainText("%");

  // Its popup: plain text details, a safe link and the provider's credit; never an edit form.
  await event.click();
  const popup = page.getByRole("dialog");
  await expect(popup.getByRole("heading", { name: "Fixture arrival" })).toBeVisible();
  await expect(popup.getByText("Calendar: Fixture arrivals")).toBeVisible();
  const link = popup.getByRole("link", { name: /Open on the service/ });
  await expect(link).toHaveAttribute("href", "https://example.com/title");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(popup.getByRole("link", { name: /Data provided by Test fixture/ })).toBeVisible();
  await expect(popup.getByText(/Read-only/)).toBeVisible();
  await expect(popup.getByLabel("Status")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // No card can be placed in it, whatever the API is asked.
  const calendarsMeta = (await (await request.get("/api/meta")).json()) as {
    calendars: { id: string; name: string }[];
  };
  const sourceCalendar = calendarsMeta.calendars.find((c) => c.name === "Fixture arrivals")!;
  const refused = await request.post("/api/cards", {
    data: {
      projectName: "Never created",
      start: "2026-11-14T09:00:00Z",
      end: "2026-11-14T10:00:00Z",
      calendarId: sourceCalendar.id,
    },
  });
  expect(refused.status()).toBe(409);
  expect((await request.delete(`/api/calendars/${sourceCalendar.id}`, { data: {} })).status()).toBe(
    409,
  );

  // Hide the calendar from the list: the event leaves the board and comes back when shown again.
  const list = page.getByRole("region", { name: "Calendars" });
  await list.getByLabel("Fixture arrivals").click();
  await expect(list.getByLabel("Fixture arrivals")).not.toBeChecked();
  await expect(event).toHaveCount(0);
  await list.getByLabel("Fixture arrivals").click();
  await expect(event).toBeVisible();

  // Disconnecting deletes the calendar and its events, after a confirmation.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForLoadState("networkidle");
  await page
    .getByTestId("source-row")
    .filter({ hasText: "Fixture arrivals" })
    .getByRole("button", { name: "Disconnect" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("Source disconnected")).toBeVisible();
  await expect(page.getByTestId("source-row")).toHaveCount(0);
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
  await expect(event).toHaveCount(0);
});

test("a member cannot reach the sources", async ({ browser, request }) => {
  const { context, page } = await signInAsMember(browser, request);
  const res = await page.request.get("/api/sources");
  expect(res.status()).toBe(403);
  const verify = await page.request.post("/api/sources/verify", { data: { kind: "test-fixture" } });
  expect(verify.status()).toBe(403);
  await page.goto("/settings");
  await expect(page).not.toHaveURL(/settings/);
  await context.close();
});
