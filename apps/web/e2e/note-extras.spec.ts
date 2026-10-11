import { expect, test } from "@playwright/test";
import { newProject, openNote, PNG, signInAsMember, STORAGE_STATE } from "./helpers";

// Runs after note.spec.ts (single worker); it only needs the admin account.
test.use({ storageState: STORAGE_STATE });

test("blocks show who edited them, and 'Show authors' colors the text by author", async ({
  page,
  browser,
  request,
}) => {
  const url = await newProject(request, "Attribution note");
  const { context, page: annaPage } = await signInAsMember(browser, request);
  const mario = await openNote(page, url);
  await openNote(annaPage, url);

  await mario.click();
  await mario.pressSequentially("Written by Mario");
  // Mario ends his block with Enter: the empty block below is his too. Anna then writes in that
  // block directly instead of navigating with the keyboard, so a remote update arriving while she
  // positions the caret cannot move her into Mario's text.
  await page.keyboard.press("Enter");
  await expect(annaPage.locator(".jakab-note p")).toHaveCount(2);
  await expect(annaPage.locator(".jakab-note")).toContainText("Written by Mario");
  await annaPage.locator(".jakab-note p").last().click();
  await annaPage.keyboard.type("Written by Anna");
  await expect(page.locator(".jakab-note")).toContainText("Written by Anna");
  await expect(page.locator(".jakab-note p")).toHaveCount(2);

  // Hovering a block shows its last editor.
  await annaPage.locator(".jakab-note p", { hasText: "Written by Mario" }).hover();
  await expect(annaPage.getByTestId("edited-label")).toContainText("Edited by Mario Rossi");
  await page.locator(".jakab-note p", { hasText: "Written by Anna" }).hover();
  await expect(page.getByTestId("edited-label")).toContainText("Edited by Anna Neri");

  // Show authors: text is tinted per author and the note is read-only meanwhile.
  await page.getByRole("button", { name: "Show authors" }).click();
  await expect(page.locator(".jakab-author").first()).toBeVisible();
  const authors = await page
    .locator(".jakab-author")
    .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("data-author")))]);
  expect(authors).toHaveLength(2);
  await expect(page.locator(".jakab-note")).toHaveAttribute("contenteditable", "false");
  await expect(page.getByText("Showing authors")).toBeVisible();

  await page.getByRole("button", { name: "Show authors" }).click();
  await expect(page.locator(".jakab-author")).toHaveCount(0);
  await expect(page.locator(".jakab-note")).toHaveAttribute("contenteditable", "true");
  await context.close();
});

test("files can be attached, are shown where they were placed and are shared live", async ({
  page,
  browser,
  request,
}) => {
  const url = await newProject(request, "Files note");
  const { context, page: annaPage } = await signInAsMember(browser, request);
  const mario = await openNote(page, url);
  await openNote(annaPage, url);

  await mario.click();
  await mario.pressSequentially("Before the file");

  // Image from the toolbar button: shown inline, also for the other user.
  await page
    .getByTestId("file-input")
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  const image = page.locator(".jakab-note img[alt='pixel.png']");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expect(annaPage.locator(".jakab-note img[alt='pixel.png']")).toBeVisible();

  // Other files become a chip with a working download; they never run as a page.
  await page.getByTestId("file-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("plain notes"),
  });
  const chip = page.locator("[data-file-embed][data-attachment-id]", { hasText: "notes.txt" });
  await expect(chip).toBeVisible();
  const attachmentId = await chip.getAttribute("data-attachment-id");
  const download = page.waitForEvent("download");
  await chip.getByRole("link", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("notes.txt");
  const served = await page.request.get(`/api/attachments/${attachmentId}`);
  expect(served.headers()["content-type"]).toBe("application/octet-stream");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await served.text()).toBe("plain notes");

  // Pasting a file into the text works like the button.
  await mario.click();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(
      new File([new Uint8Array([1, 2, 3])], "pasted.bin", { type: "application/zip" }),
    );
    document
      .querySelector(".jakab-note")!
      .dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
  });
  await expect(page.locator("[data-file-embed]", { hasText: "pasted.bin" })).toBeVisible();

  // The embeds are part of the note: they are still there after everybody left.
  await context.close();
  await page.goto("/");
  await page.waitForTimeout(3500);
  await openNote(page, url);
  await expect(page.locator(".jakab-note img[alt='pixel.png']")).toBeVisible();
  await expect(page.locator("[data-file-embed]", { hasText: "notes.txt" })).toBeVisible();
});

test("files above the upload limit are refused", async ({ page, request }) => {
  const url = await newProject(request, "Limit note");
  await openNote(page, url);
  await page.getByTestId("file-input").setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(2 * 1024 * 1024, 7), // the E2E server allows 1 MB
  });
  await expect(page.getByText("huge.bin is too large")).toBeVisible();
  await expect(page.locator("[data-file-embed]")).toHaveCount(0);
});

test("a link can be added without selecting text, gets https:// and opens with Ctrl+click", async ({
  page,
  request,
}) => {
  const url = await newProject(request, "Links note");
  const editor = await openNote(page, url);
  await editor.click();

  // Nothing selected: the address itself becomes the linked text; "example.com" gets a scheme.
  page.once("dialog", (dialog) => void dialog.accept("example.com/docs"));
  await page.getByRole("button", { name: /^Link/ }).click();
  const link = page.locator(".jakab-note a");
  await expect(link).toHaveText("https://example.com/docs");
  await expect(link).toHaveAttribute("href", "https://example.com/docs");

  // Unsafe addresses are refused with a message, and nothing is added.
  await page.keyboard.press("End");
  page.once("dialog", (dialog) => void dialog.accept("javascript:alert(1)"));
  await page.getByRole("button", { name: /^Link/ }).click();
  await expect(page.getByText("This address is not valid")).toBeVisible();
  await expect(link).toHaveCount(1);

  // A plain click only places the cursor; Ctrl+click opens the link in a new tab.
  await page.evaluate(() => {
    const opened: string[] = [];
    (window as unknown as { opened: string[] }).opened = opened;
    window.open = (target) => {
      opened.push(String(target));
      return null;
    };
  });
  const openedLinks = () => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  await link.click();
  expect(await openedLinks()).toEqual([]);
  await link.click({ modifiers: ["Control"] });
  expect(await openedLinks()).toEqual(["https://example.com/docs"]);
});
