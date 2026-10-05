import { expect, test } from "@playwright/test";
import { newProject, openNote, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("save a named version, compare it with the current note, restore it and undo the restore", async ({
  page,
  request,
}) => {
  const url = await newProject(request, "Versioned note");
  const editor = await openNote(page, url);

  await editor.click();
  await editor.pressSequentially("First paragraph");
  await page.getByRole("button", { name: "Save version" }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save a version" });
  await saveDialog.getByLabel("Label (optional)").fill("Draft one");
  await saveDialog.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText("Version saved")).toBeVisible();

  await editor.press("Enter");
  await editor.pressSequentially("Second paragraph");
  await expect(editor).toContainText("Second paragraph");

  await page.getByRole("button", { name: "Version history" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  const list = history.getByTestId("version-list");
  await list.getByRole("button", { name: /Draft one/ }).click();

  // Preview shows the saved content only.
  const preview = history.getByTestId("version-preview");
  await expect(preview).toContainText("First paragraph");
  await expect(preview).not.toContainText("Second paragraph");

  // Changes: the paragraph added since then is marked.
  await history.getByRole("button", { name: "Changes since then" }).click();
  await expect(preview.locator('[data-change="added"]')).toContainText("Second paragraph");
  await expect(history.getByRole("status")).toContainText("Green blocks were added");

  // Restore is confirmed first and does not lose the current content.
  await history.getByRole("button", { name: "Restore this version" }).click();
  await history.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Version restored")).toBeVisible();
  await expect(editor).not.toContainText("Second paragraph");
  await expect(editor).toContainText("First paragraph");

  // The content before the restore is available as a version, and can be brought back.
  await page.getByRole("button", { name: "Version history" }).click();
  const again = page.getByRole("dialog", { name: "Version history" });
  await again
    .getByTestId("version-list")
    .getByRole("button", { name: /Before restore/ })
    .click();
  await expect(again.getByTestId("version-preview")).toContainText("Second paragraph");
  await again.getByRole("button", { name: "Restore this version" }).click();
  await again.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(editor).toContainText("Second paragraph");
});
