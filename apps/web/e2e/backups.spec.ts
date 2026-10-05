import { expect, test } from "@playwright/test";
import { signInAsMember, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("an admin backs up now, sees and downloads the backup; members and odd names are refused", async ({
  page,
  request,
  browser,
}) => {
  await page.goto("/settings");
  await expect(page.getByText("No schedule is set")).toBeVisible();

  await page.getByRole("button", { name: "Back up now" }).click();
  // The dump needs pg_dump on the machine; the archive is always made. On a busy CI machine the
  // archive plus the dump can take a while.
  await expect(page.getByText(/Backup completed|Archive saved, but/)).toBeVisible({
    timeout: 30_000,
  });

  const archive = page
    .getByTestId("backup-list")
    .getByRole("link", { name: /jakab-board-\d{8}-\d{6}\.zip/ })
    .first();
  await expect(archive).toBeVisible();
  const href = (await archive.getAttribute("href"))!;

  const download = await request.get(href);
  expect(download.status()).toBe(200);
  expect((await download.body()).subarray(0, 2).toString()).toBe("PK");

  // Only names the backup job creates can be asked for.
  expect((await request.get("/api/admin/backups/..%2F..%2Fetc%2Fpasswd")).status()).toBe(400);
  expect((await request.get("/api/admin/backups/jakab-db-20990101-000000.dump")).status()).toBe(
    404,
  );

  const { context, page: member } = await signInAsMember(browser, request);
  expect((await member.request.get("/api/admin/backups")).status()).toBe(403);
  expect((await member.request.post("/api/admin/backups")).status()).toBe(403);
  expect((await member.request.get(href)).status()).toBe(403);
  await context.close();
});
