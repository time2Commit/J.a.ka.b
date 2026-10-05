import { expect, test } from "@playwright/test";
import { newProject, openNote, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("a template pre-fills a new project, a project can be copied, and a project saved as template", async ({
  page,
  request,
}) => {
  // 1. Create a template in the UI.
  await page.goto("/templates");
  await page.getByRole("button", { name: "New template" }).click();
  const dialog = page.getByRole("dialog", { name: "New template" });
  await dialog.getByLabel("Name").fill("Weekly review");
  await dialog.getByLabel("First card length (minutes)").fill("90");
  await dialog.getByRole("textbox", { name: "Checklist" }).fill("Collect updates\nPlan next week");
  await dialog.getByTestId("template-note").click();
  await dialog.getByTestId("template-note").pressSequentially("Agenda from the template");
  await dialog.getByRole("button", { name: "Save" }).click();
  const list = page.getByRole("list", { name: "Templates" });
  await expect(list).toContainText("Weekly review");
  await expect(list).toContainText("90 min");
  await expect(list).toContainText("2 checklist items");

  // 2. A new card with a new project, started from that template.
  await page.goto("/");
  await page.getByRole("button", { name: "New card" }).click();
  const card = page.getByRole("dialog", { name: "New card" });
  await card.getByLabel("Project name").fill("Review project");
  await card.getByRole("option", { name: "Create project “Review project”" }).click();
  await card.getByLabel("From", { exact: true }).fill("09:00");
  await card.getByLabel("Start from").selectOption({ label: "Weekly review" });
  await expect(card.getByLabel("To", { exact: true })).toHaveValue("10:30");
  await card.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Card created")).toBeVisible();

  const projects = (await (await request.get("/api/projects")).json()) as {
    id: string;
    name: string;
  }[];
  const made = projects.find((p) => p.name === "Review project")!;
  const note = await openNote(page, `/projects/${made.id}`);
  await expect(note).toContainText("Agenda from the template");
  await expect(note).toContainText("Collect updates");
  await expect(note).toContainText("Plan next week");

  // 3. Copy of an existing project, with its note.
  const sourceUrl = await newProject(request, "Copy source");
  const source = await openNote(page, sourceUrl);
  await source.click();
  await source.pressSequentially("Text worth copying");
  await expect
    .poll(async () => (await (await request.get(`/api${sourceUrl}/versions`)).json()).length)
    .toBeGreaterThan(0);

  await page.goto("/");
  await page.getByRole("button", { name: "New card" }).click();
  const second = page.getByRole("dialog", { name: "New card" });
  await second.getByLabel("Project name").fill("Copy target");
  await second.getByRole("option", { name: "Create project “Copy target”" }).click();
  await second.getByLabel("Start from").selectOption({ label: "Copy source" });
  await expect(second.getByLabel("Copy the note and its files too")).toBeChecked();
  await second.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Card created")).toBeVisible();
  const after = (await (await request.get("/api/projects")).json()) as {
    id: string;
    name: string;
  }[];
  const copy = after.find((p) => p.name === "Copy target")!;
  await expect(await openNote(page, `/projects/${copy.id}`)).toContainText("Text worth copying");

  // 4. Save the source project as a template.
  await page.goto(sourceUrl);
  await page.getByRole("button", { name: "Save as template" }).click();
  const save = page.getByRole("dialog", { name: "Save as template" });
  await save.getByLabel("Template name").fill("From copy source");
  await save.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Template saved")).toBeVisible();
  await page.goto("/templates");
  await expect(page.getByRole("list", { name: "Templates" })).toContainText("From copy source");
});
