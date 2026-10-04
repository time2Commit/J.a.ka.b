import { expect, test } from "@playwright/test";

// Requires an empty `user` table: the first account is the admin.
test("first user registers as admin, signs out and signs in again", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: /create the admin account/i }).click();
  await page.waitForLoadState("networkidle"); // let React hydrate before submitting
  await page.getByLabel("Name").fill("Mario Rossi");
  await page.getByLabel("Email").fill("mario.rossi@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

  await page.getByRole("button", { name: "Mario Rossi" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email").fill("mario.rossi@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
});
