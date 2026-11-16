import { expect, test, type Page } from "@playwright/test";
import { STORAGE_STATE } from "./helpers";

// The admin session only creates the account; the person signs in through the page.
test.use({ storageState: STORAGE_STATE });

const PERSON = {
  name: "Luca Verdi",
  email: "luca.account@example.com",
  password: "password789",
};
const NEW_PASSWORD = "a-brand-new-password";
const PERSON_STORAGE_STATE = "e2e/.auth/account-person.json";

async function signIn(page: Page, password: string) {
  await page.waitForLoadState("networkidle"); // let React hydrate before submitting
  await page.getByLabel("Email").fill(PERSON.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Sign-in is rate limited by the auth library (a few attempts every ten seconds): start afresh. */
const signInAllowanceResets = (page: Page) => page.waitForTimeout(10_000);

async function fillPasswords(page: Page, current: string, next: string, confirm = next) {
  await page.getByLabel("Current password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(confirm);
  await page.getByRole("button", { name: "Change password" }).click();
}

test("a person renames themselves and changes their own password", async ({ browser, request }) => {
  const created = await request.post("/api/users", { data: { ...PERSON, role: "member" } });
  expect(created.status()).toBe(201);

  // Empty storage state: the context must not inherit the admin session from `test.use`.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await signIn(page, PERSON.password);
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();

  // The account page is reached from the profile menu, by a member too.
  await page.getByRole("button", { name: PERSON.name }).click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(PERSON.email);
  await expect(page.getByLabel("Email")).not.toBeEditable();
  await page.waitForLoadState("networkidle");

  // Name: saved, and shown in the header without signing in again.
  await page.getByLabel("Name").fill("Luca Bianchi");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Luca Bianchi" })).toBeVisible();

  // Mistakes are named on their field, before anything is sent.
  await fillPasswords(page, PERSON.password, "short", "other");
  await expect(page.getByText("The new password needs at least 8 characters.")).toBeVisible();
  await expect(page.getByText("The two passwords do not match.")).toBeVisible();

  // A wrong current password is refused by the server and changes nothing.
  await fillPasswords(page, "not-my-password", NEW_PASSWORD);
  await expect(page.getByText("The current password is not correct.")).toBeVisible();

  await fillPasswords(page, PERSON.password, NEW_PASSWORD);
  await expect(page.getByText("Password changed")).toBeVisible();
  await expect(page.getByLabel("Current password")).toHaveValue("");

  // This device stays signed in after the change.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Luca Bianchi" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The old password no longer opens the account; the new one does.
  await signInAllowanceResets(page);
  await signIn(page, PERSON.password);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, NEW_PASSWORD);
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();

  await context.storageState({ path: PERSON_STORAGE_STATE });
  await context.close();
});

test("changing the password signs the person out of their other devices", async ({ browser }) => {
  // One device keeps the session the test above ended with; a second one signs in now.
  const first = await browser.newContext({ storageState: PERSON_STORAGE_STATE });
  const second = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pageOne = await first.newPage();
  const pageTwo = await second.newPage();
  await pageTwo.goto("/login");
  await signInAllowanceResets(pageTwo);
  await signIn(pageTwo, NEW_PASSWORD);
  await expect(pageTwo.getByRole("button", { name: "New card" })).toBeVisible();

  await pageOne.goto("/account");
  await pageOne.waitForLoadState("networkidle");
  await fillPasswords(pageOne, NEW_PASSWORD, "yet-another-password");
  await expect(pageOne.getByText("Password changed")).toBeVisible();

  await pageTwo.goto("/account");
  await expect(pageTwo).toHaveURL(/\/login$/);
  await pageOne.reload();
  await expect(pageOne.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();

  await first.close();
  await second.close();
});
