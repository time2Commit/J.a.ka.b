import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { newProject as newNoteProject, openNote, STORAGE_STATE, todayInRome } from "./helpers";

// Runs after the other specs (single worker); it only needs the admin account.
test.use({ storageState: STORAGE_STATE });

async function newProject(request: APIRequestContext, name: string) {
  const day = todayInRome();
  const res = await request.post("/api/cards", {
    data: { projectName: name, start: `${day}T11:00:00Z`, end: `${day}T12:00:00Z` },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { card: { projectId: string } }).card.projectId;
}

async function createFolder(page: Page, name: string, parent?: string) {
  if (parent) {
    await page.getByRole("button", { name: `Actions for ${parent}` }).click();
    await page.getByRole("menuitem", { name: "New subfolder" }).click();
  } else {
    await page.getByRole("button", { name: "New folder" }).click();
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Folder name").fill(name);
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toBeHidden();
}

const tree = (page: Page) => page.getByRole("tree", { name: "Projects and folders" });

test("projects live in a tree of folders: create, move (menu and drag), search, delete", async ({
  page,
  request,
}) => {
  const alphaId = await newProject(request, "Tree alpha");
  await newProject(request, "Tree beta");
  await page.goto("/projects");

  // New projects are simply uncategorized.
  await expect(tree(page).getByRole("link", { name: /Tree alpha/ })).toBeVisible();
  await expect(tree(page).getByRole("link", { name: /Tree beta/ })).toBeVisible();

  // Folders and a subfolder.
  await createFolder(page, "Clients");
  await createFolder(page, "2026", "Clients");
  await expect(tree(page).getByText("2026")).toBeVisible();
  // The same name again at the same level is refused, and the dialog stays open.
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("dialog").getByLabel("Folder name").fill("clients");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("A folder with this name already exists here")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // Move a project with the menu ("Move to…").
  await page.getByRole("button", { name: "Actions for Tree alpha" }).click();
  await page.getByRole("menuitem", { name: "Move to…" }).click();
  const move = page.getByRole("dialog");
  await move.getByRole("radio", { name: "2026" }).click();
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(move).toBeHidden();
  await expect(tree(page).getByRole("link", { name: /Tree alpha/ })).toBeVisible();
  await expect
    .poll(async () => {
      const list = await (await request.get("/api/projects")).json();
      return (list as { id: string; folderId: string | null }[]).find((p) => p.id === alphaId)
        ?.folderId;
    })
    .not.toBeNull();

  // Move another one by dragging it onto a folder (the drag events are sent directly, so the
  // result does not depend on where the rows happen to be on screen).
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const source = tree(page).getByRole("link", { name: /Tree beta/ });
  const target = tree(page)
    .getByRole("button", { name: /^Clients/ })
    .first();
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
  await expect
    .poll(async () => {
      const list = (await (await request.get("/api/projects")).json()) as {
        name: string;
        folderId: string | null;
      }[];
      return list.find((p) => p.name === "Tree beta")?.folderId ?? null;
    })
    .not.toBeNull();

  // The header search finds a project by name and shows where it is.
  await page.getByRole("combobox", { name: "Find projects and notes" }).fill("tree alp");
  const result = page.getByRole("option", { name: /Tree alpha/ });
  await expect(result).toContainText("Clients / 2026");
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${alphaId}$`));

  // Deleting a folder keeps its contents: they move up one level.
  await page.goto("/projects");
  await page.getByRole("button", { name: "Actions for 2026" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  await expect(tree(page).getByText("2026", { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const [list, folders] = await Promise.all([
        (await request.get("/api/projects")).json() as Promise<
          { id: string; folderId: string | null }[]
        >,
        (await request.get("/api/folders")).json() as Promise<{ id: string; name: string }[]>,
      ]);
      const clients = folders.find((f) => f.name === "Clients");
      return list.find((p) => p.id === alphaId)?.folderId === clients?.id;
    })
    .toBe(true);
});

test("the order of the tree is saved per person", async ({ page }) => {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle"); // let React hydrate before using the select
  const order = page.getByLabel("Order by");
  await order.selectOption({ label: "Last modified" });
  await expect
    .poll(async () => {
      const meta = (await (await page.request.get("/api/meta")).json()) as {
        preferences: { projectSort: string | null };
      };
      return meta.preferences.projectSort;
    })
    .toBe("modified");
  await page.reload();
  await expect(page.getByLabel("Order by")).toHaveValue("modified");
  await page.getByLabel("Order by").selectOption({ label: "Name (A–Z)" });
  await expect
    .poll(async () => {
      const meta = (await (await page.request.get("/api/meta")).json()) as {
        preferences: { projectSort: string | null };
      };
      return meta.preferences.projectSort;
    })
    .toBe("name");
});

test("the header search also finds what is written inside a note, with an excerpt", async ({
  page,
  request,
}) => {
  const url = await newNoteProject(request, "Research notebook");
  const editor = await openNote(page, url);
  await editor.click();
  await editor.pressSequentially("The Quarterly review mentions zebraxyz as the main supplier.");

  // The note is stored a moment after typing: search until it shows up.
  await expect
    .poll(
      async () => {
        const res = await request.get("/api/search?q=ZEBRAXYZ");
        const found = (await res.json()) as { notes: { name: string }[] };
        return found.notes.map((n) => n.name);
      },
      { timeout: 20_000 },
    )
    .toContain("Research notebook");

  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Find projects and notes" }).fill("zebraxyz supplier");
  const hit = page.getByRole("option", { name: /Research notebook/ });
  await expect(hit).toContainText("mentions");
  await expect(hit.locator("mark")).toHaveText("zebraxyz");
  await hit.click();
  await expect(page).toHaveURL(new RegExp(`${url}$`));
});

test("a project can be created on its own, and the right-click menus manage folders and projects", async ({
  page,
  request,
}) => {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");

  // "New project" (no card needed): the note opens, and the project waits under "To schedule".
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Project name").fill("Standalone idea");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Standalone idea" })).toBeVisible();
  const unscheduled = (await (await request.get("/api/projects/unscheduled")).json()) as {
    name: string;
  }[];
  expect(unscheduled.map((p) => p.name)).toContain("Standalone idea");

  // Right-click on the empty space: a new folder at the top level.
  await page.getByText("Uncategorized", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await page.getByRole("dialog").getByLabel("Folder name").fill("Context top");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await expect(tree(page).getByRole("button", { name: /^Context top/ })).toBeVisible();

  // Right-click on a folder: a subfolder, then a project inside it.
  await tree(page)
    .getByRole("button", { name: /^Context top/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "New subfolder" }).click();
  await page.getByRole("dialog").getByLabel("Folder name").fill("Context sub");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await expect(tree(page).getByRole("button", { name: /^Context sub/ })).toBeVisible();

  await tree(page)
    .getByRole("button", { name: /^Context sub/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "New project here" }).click();
  const inFolder = page.getByRole("dialog", { name: "New project" });
  await expect(inFolder.getByLabel("Folder")).toHaveText(/Context sub/);
  await inFolder.getByLabel("Project name").fill("Filed project");
  await inFolder.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(tree(page).getByRole("link", { name: /Filed project/ })).toBeVisible();

  // Right-click on a project: delete it (with a confirmation).
  page.once("dialog", (confirmation) => void confirmation.accept());
  await tree(page)
    .getByRole("link", { name: /Filed project/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete project" }).click();
  await expect(page.getByText("Project deleted")).toBeVisible();
  await expect(tree(page).getByRole("link", { name: /Filed project/ })).toHaveCount(0);
  const left = (await (await request.get("/api/projects")).json()) as { name: string }[];
  expect(left.map((p) => p.name)).not.toContain("Filed project");
  await expect(page).toHaveURL(/\/projects$/);
});

test("templates have their own tree and the header search finds them", async ({
  page,
  request,
}) => {
  await page.goto("/templates");
  await page.waitForLoadState("networkidle");
  const templateTree = page.getByRole("tree", { name: "Templates and folders" });

  // A folder, then a template created inside it from the folder's right-click menu.
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("dialog").getByLabel("Folder name").fill("Meetings");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await templateTree.getByRole("button", { name: /^Meetings/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New template here" }).click();
  const dialog = page.getByRole("dialog", { name: "New template" });
  await expect(dialog.getByLabel("Folder")).toHaveText(/Meetings/);
  await dialog.getByLabel("Template name").fill("Standup notes");
  await dialog.getByRole("button", { name: "Create template" }).click();
  await expect(page).toHaveURL(/\/templates\/[^/]+$/);
  await expect(templateTree.getByRole("link", { name: /Standup notes/ })).toBeVisible();

  // The folders of templates and of projects are separate.
  const projectFolders = (await (await request.get("/api/folders?kind=project")).json()) as {
    name: string;
  }[];
  expect(projectFolders.map((f) => f.name)).not.toContain("Meetings");

  // The header search finds the template and shows its folder.
  await page.getByRole("combobox", { name: "Find projects and notes" }).fill("standup");
  const hit = page.getByRole("option", { name: /Standup notes/ });
  await expect(hit).toContainText("Meetings");
  await hit.click();
  await expect(page).toHaveURL(/\/templates\/[^/]+$/);

  // Delete it from its menu.
  page.once("dialog", (confirmation) => void confirmation.accept());
  await templateTree.getByRole("link", { name: /Standup notes/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete template" }).click();
  await expect(page.getByText("Template deleted")).toBeVisible();
  await expect(templateTree.getByRole("link", { name: /Standup notes/ })).toHaveCount(0);
});
