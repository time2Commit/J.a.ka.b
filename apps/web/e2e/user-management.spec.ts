import { expect, test, type Browser, type Page } from "@playwright/test";
import { newProject, openNote, STORAGE_STATE } from "./helpers";

// The administrator of the suite; the people they manage sign in through the page.
test.use({ storageState: STORAGE_STATE });

// Each test waits several times for the sign-in allowance of the auth library.
test.setTimeout(120_000);

const PASSWORD = "password789";

/** Sign-in is rate limited by the auth library (a few attempts every ten seconds): start afresh. */
const signInAllowanceResets = (page: Page) => page.waitForTimeout(10_000);

async function signIn(page: Page, email: string, password: string) {
  await page.waitForLoadState("networkidle"); // let React hydrate before submitting
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A browser of somebody else, signed in on the board. */
async function signedIn(browser: Browser, email: string) {
  // Empty storage state: the context must not inherit the admin session from `test.use`.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await signInAllowanceResets(page);
  await signIn(page, email, PASSWORD);
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
  return { context, page };
}

/** Opens the menu of one account in Settings and picks an action; the dialog is left open. */
async function chooseAction(page: Page, name: string, item: string) {
  await page.goto("/settings");
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
  return page.getByRole("dialog");
}

test("a deactivated person is put out of the board and of an open note, and cannot come back", async ({
  browser,
  page,
  request,
}) => {
  const person = { name: "Paola Neri", email: "paola.managed@example.com" };
  const created = await request.post("/api/users", {
    data: { ...person, password: PASSWORD, role: "member" },
  });
  expect(created.status()).toBe(201);
  const projectUrl = await newProject(request, "Deactivation note");

  // Paola has the board open in one tab and a note in another.
  const paola = await signedIn(browser, person.email);
  const notePage = await paola.context.newPage();
  const editor = await openNote(notePage, projectUrl);
  await editor.pressSequentially("Written by Paola");
  await expect(notePage.getByTestId("note-status")).toHaveAttribute("data-status", "connected");

  // One's own account has no actions: it is changed from the account page.
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Actions for Mario Rossi" })).toHaveCount(0);

  const dialog = await chooseAction(page, person.name, "Deactivate…");
  await expect(dialog.getByRole("heading", { name: "Deactivate Paola Neri" })).toBeVisible();
  await dialog.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Paola Neri deactivated")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: person.email })).toContainText(
    "Deactivated",
  );

  // Both tabs end on the login page by themselves, without a reload.
  await expect(paola.page).toHaveURL(/\/login$/, { timeout: 20_000 });
  await expect(notePage).toHaveURL(/\/login$/, { timeout: 20_000 });

  // The right password no longer opens the account, and the page says why.
  await signInAllowanceResets(paola.page);
  await signIn(paola.page, person.email, PASSWORD);
  await expect(paola.page.getByText("This account has been deactivated.")).toBeVisible();
  await expect(paola.page).toHaveURL(/\/login$/);

  // What she wrote stays, and she is no longer offered for new assignments.
  await page.goto(projectUrl);
  await expect(page.getByText("Written by Paola")).toBeVisible();
  const meta = (await (await request.get("/api/meta")).json()) as {
    users: { email: string; deactivatedAt: string | null }[];
  };
  expect(meta.users.find((u) => u.email === person.email)?.deactivatedAt).toEqual(
    expect.any(String),
  );
  await page.goto("/");
  await expect(page.getByLabel("Member", { exact: true })).toContainText("Mario Rossi");
  await expect(page.getByLabel("Member", { exact: true })).not.toContainText(person.name);

  // Reactivated, she signs in again with the password she had.
  const again = await chooseAction(page, person.name, "Reactivate…");
  await again.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByText("Paola Neri reactivated")).toBeVisible();
  await signInAllowanceResets(paola.page);
  await signIn(paola.page, person.email, PASSWORD);
  await expect(paola.page.getByRole("button", { name: "New card" })).toBeVisible();

  await paola.context.close();
});

test("a reset password signs the person out and must be replaced at the next sign-in", async ({
  browser,
  page,
  request,
}) => {
  const person = { name: "Remo Gialli", email: "remo.managed@example.com" };
  const temporary = "temporary-pass-1";
  const chosen = "chosen-by-remo-1";
  const created = await request.post("/api/users", {
    data: { ...person, password: PASSWORD, role: "member" },
  });
  expect(created.status()).toBe(201);
  const remo = await signedIn(browser, person.email);

  const dialog = await chooseAction(page, person.name, "Reset password…");
  // Too short to be sent; a generated one is long enough.
  await dialog.getByLabel("Temporary password").fill("short");
  await expect(dialog.getByRole("button", { name: "Reset password" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(dialog.getByLabel("Temporary password")).toHaveValue(/^[a-zA-Z0-9]{14}$/);
  await dialog.getByLabel("Temporary password").fill(temporary);
  await dialog.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Password of Remo Gialli reset")).toBeVisible();

  // His open board ends on the login page; the old password is gone.
  await expect(remo.page).toHaveURL(/\/login$/, { timeout: 20_000 });
  await signInAllowanceResets(remo.page);
  await signIn(remo.page, person.email, PASSWORD);
  await expect(remo.page.getByText("Invalid email or password.")).toBeVisible();

  // The temporary one opens only the page where it is replaced.
  await signIn(remo.page, person.email, temporary);
  await expect(remo.page).toHaveURL(/\/account$/);
  await expect(remo.page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(remo.page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await remo.page.goto("/projects");
  await expect(remo.page).toHaveURL(/\/account$/);
  await remo.page.goto("/");
  await expect(remo.page).toHaveURL(/\/account$/);

  await remo.page.waitForLoadState("networkidle");
  await remo.page.getByLabel("Current password").fill(temporary);
  await remo.page.getByLabel("New password", { exact: true }).fill(chosen);
  await remo.page.getByLabel("Confirm new password").fill(chosen);
  await remo.page.getByRole("button", { name: "Change password" }).click();
  await expect(remo.page.getByRole("button", { name: "New card" })).toBeVisible();
  await remo.page.goto("/projects");
  await expect(remo.page).toHaveURL(/\/projects$/);

  // A member has no Settings; made an administrator, he has.
  await expect(remo.page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  const promote = await chooseAction(page, person.name, "Make administrator…");
  await promote.getByRole("button", { name: "Make administrator" }).click();
  await expect(page.getByText("Remo Gialli is now an administrator")).toBeVisible();
  await remo.page.reload();
  await expect(remo.page.getByRole("link", { name: "Settings" })).toBeVisible();

  // Back to a member, so the suite keeps a single administrator.
  const demote = await chooseAction(page, person.name, "Make member…");
  await demote.getByRole("button", { name: "Make member" }).click();
  await expect(page.getByText("Remo Gialli is now a member")).toBeVisible();

  await remo.context.close();
});
