import { expect, test } from "@playwright/test";
import { newProject, openNote, signInAsMember, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("a project and the whole board can be downloaded as archives, the board only by an admin", async ({
  page,
  request,
  browser,
}) => {
  const url = await newProject(request, "Export me");
  const editor = await openNote(page, url);
  await editor.click();
  await editor.pressSequentially("Exported content");

  // The project menu offers the archive, with or without version history.
  await page.getByRole("button", { name: "Export" }).click();
  const link = page.getByRole("menuitem", { name: "Including version history" });
  await expect(link).toHaveAttribute("href", /\/export\?versions=1$/);
  await page.keyboard.press("Escape");

  const projectZip = await request.get(`/api${url}/export`);
  expect(projectZip.status()).toBe(200);
  expect(projectZip.headers()["content-type"]).toBe("application/zip");
  expect(projectZip.headers()["content-disposition"]).toContain("export-me.zip");
  const body = await projectZip.body();
  expect(body.subarray(0, 2).toString()).toBe("PK");
  expect(body.includes(Buffer.from("projects/export-me/note.md"))).toBe(true);

  // The board archive is an admin feature, offered in the settings.
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Download board archive" })).toHaveAttribute(
    "href",
    "/api/export?",
  );
  const boardZip = await request.get("/api/export");
  expect(boardZip.status()).toBe(200);
  expect((await boardZip.body()).includes(Buffer.from("board.json"))).toBe(true);

  const { context, page: memberPage } = await signInAsMember(browser, request);
  expect((await memberPage.request.get("/api/export")).status()).toBe(403);
  expect((await memberPage.request.get(`/api${url}/export`)).status()).toBe(200);
  await context.close();
});
