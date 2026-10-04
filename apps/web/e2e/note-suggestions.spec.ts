import { expect, test } from "@playwright/test";
import { newProject, openNote, signInAsMember, STORAGE_STATE } from "./helpers";

// Runs after the other note specs (single worker); it only needs the admin account.
test.use({ storageState: STORAGE_STATE });

test("@ lists the team and inserts a mention that everybody sees", async ({
  page,
  browser,
  request,
}) => {
  const url = await newProject(request, "Mentions note");
  const { context, page: annaPage } = await signInAsMember(browser, request);
  const mario = await openNote(page, url);
  await openNote(annaPage, url);

  await mario.click();
  await mario.pressSequentially("Hello @neri");
  const list = page.getByRole("listbox", { name: "People" });
  await expect(list.getByRole("option", { name: "Anna Neri" })).toBeVisible();
  await expect(list.getByRole("option", { name: "Mario Rossi" })).toHaveCount(0);
  await page.keyboard.press("Enter");

  const mention = page.locator('.jakab-note span[data-type="mention"]');
  await expect(mention).toHaveText("@Anna Neri");
  await expect(annaPage.locator('.jakab-note span[data-type="mention"]')).toHaveText("@Anna Neri");
  await expect(list).toHaveCount(0);

  // No match: no popup at all. An "@" inside a word (an e-mail address) is left alone.
  await mario.pressSequentially(" @zzzz");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await mario.pressSequentially(" me@example.com");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await context.close();
});

test("/ inserts blocks from the keyboard, with arrows, Enter and Escape", async ({
  page,
  request,
}) => {
  const url = await newProject(request, "Slash note");
  const editor = await openNote(page, url);
  const note = page.locator(".jakab-note");
  const menu = page.getByRole("listbox", { name: "Insert block" });

  await editor.click();
  await editor.pressSequentially("/head");
  await expect(menu.getByRole("option")).toHaveCount(3); // Heading 1, 2, 3
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(note.locator("h2")).toBeVisible();
  await expect(note).not.toContainText("/head");

  await page.keyboard.press("Enter");
  await editor.pressSequentially("/check");
  await expect(menu.getByRole("option", { name: "Checklist" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(note.locator('ul[data-type="taskList"]')).toBeVisible();

  // Italian keywords work too, Escape closes the menu and keeps the typed text.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await editor.pressSequentially("/tab");
  await expect(menu.getByRole("option", { name: "Insert table" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(note).toContainText("/tab");

  // "and/or" is plain text.
  await editor.pressSequentially(" and/or");
  await expect(menu).toHaveCount(0);
});

test("the text color picker colors the selection for everybody and can be reset", async ({
  page,
  browser,
  request,
}) => {
  const url = await newProject(request, "Color note");
  const { context, page: annaPage } = await signInAsMember(browser, request);
  const mario = await openNote(page, url);
  await openNote(annaPage, url);

  await mario.click();
  await mario.pressSequentially("colored words");
  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: "Text color" }).click();
  await page.getByRole("menuitem", { name: "Red" }).click();

  const mine = page.locator('.jakab-note span[style^="color"]', { hasText: "colored words" });
  await expect(mine).toHaveCSS("color", "rgb(220, 38, 38)");
  await expect(
    annaPage.locator('.jakab-note span[style^="color"]', { hasText: "colored words" }),
  ).toHaveCSS("color", "rgb(220, 38, 38)");

  await page.getByRole("button", { name: "Text color" }).click();
  await page.getByRole("menuitem", { name: "Default" }).click();
  await expect(
    page.locator('.jakab-note span[style^="color"]', { hasText: "colored words" }),
  ).toHaveCount(0);
  await context.close();
});
