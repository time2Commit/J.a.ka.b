import { expect, type Page } from "@playwright/test";

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
