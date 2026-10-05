import { expect, test } from "@playwright/test";
import { newProject, openNote, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("an exported project is previewed and imported again, and its note opens with the content", async ({
  page,
  request,
}) => {
  const url = await newProject(request, "Move me");
  const projectId = url.split("/").pop()!;
  const editor = await openNote(page, url);
  await editor.click();
  await editor.pressSequentially("Content that travels");
  // The first save of a note with content creates its first version: proof that it is stored.
  await expect
    .poll(
      async () => (await (await request.get(`/api/projects/${projectId}/versions`)).json()).length,
    )
    .toBeGreaterThan(0);

  const archive = await (await request.get(`/api/projects/${projectId}/export`)).body();

  await page.goto("/settings");
  await page.getByTestId("import-file").setInputFiles({
    name: "move-me.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("this is not an archive"),
  });
  await expect(page.getByText("This file is not a valid J.a.ka.b archive")).toBeVisible();

  await page.getByTestId("import-file").setInputFiles({
    name: "move-me.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  const preview = page.getByTestId("import-preview");
  await expect(preview).toContainText("Project archive exported on");
  await expect(preview.getByText("Already exists", { exact: true })).toBeVisible();

  await preview.getByLabel("Import them under a new name").check();
  await preview.getByRole("button", { name: "Import 1 project" }).click();
  const result = page.getByTestId("import-result");
  await expect(result).toContainText("Imported 1, skipped 0, failed 0.");

  const projects = (await (await request.get("/api/projects")).json()) as {
    id: string;
    name: string;
  }[];
  const copy = projects.find((p) => p.name === "Move me (imported)");
  expect(copy).toBeTruthy();

  // The collab server builds the live document from the imported JSON.
  const imported = await openNote(page, `/projects/${copy!.id}`);
  await expect(imported).toContainText("Content that travels");
});
