import { expect, test } from "@playwright/test";
import { ADMIN, STORAGE_STATE } from "./helpers";

// Runs first (the global setup empties the `user` table): the first account is the admin.
test("first user registers as admin, signs out and signs in again", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: /create the admin account/i }).click();
  await page.waitForLoadState("networkidle"); // let React hydrate before submitting
  await page.getByLabel("Name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();

  await page.getByRole("button", { name: ADMIN.name }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();

  // Other specs reuse this session: sign-in is rate limited by the auth library.
  await page.context().storageState({ path: STORAGE_STATE });
});
