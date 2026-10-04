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
  const anna = await openNote(annaPage, url);

  await mario.click();
  await mario.pressSequentially("Written by Mario");
  await expect(annaPage.locator(".jakab-note")).toContainText("Written by Mario");
  await anna.click();
  await annaPage.keyboard.press("Control+End");
  await annaPage.keyboard.press("Enter");
  await anna.pressSequentially("Written by Anna");
  await expect(page.locator(".jakab-note")).toContainText("Written by Anna");

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
