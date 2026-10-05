import { expect, test } from "@playwright/test";
import { newProject, openNote, STORAGE_STATE } from "./helpers";

test.use({ storageState: STORAGE_STATE });

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

// The smallest valid PDF: enough for the browser to start its viewer in an <object>.
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test("pages carry a fresh nonce-based policy and security headers", async ({ request }) => {
  const first = await request.get("/login");
  const second = await request.get("/login");
  await second.body(); // read every body: an abandoned page stream logs a server error
  const csp = first.headers()["content-security-policy"]!;
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("connect-src 'self' ws://localhost:1234");
  expect(nonceOf(csp)).toBeTruthy();
  expect(nonceOf(csp)).not.toBe(nonceOf(second.headers()["content-security-policy"]!));

  // The nonce reaches the scripts of the page, so the policy lets them run.
  const html = await first.text();
  expect(html).toContain(`nonce="${nonceOf(csp)}"`);

  for (const path of ["/login", "/api/meta"]) {
    const response = await request.get(path);
    await response.body();
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  }
});

test("nothing the app does is blocked by the policy", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/content security policy|refused to (load|execute|connect|frame|apply)/i.test(text)) {
      violations.push(text);
    }
  });
  page.on("pageerror", (error) => violations.push(`pageerror: ${error.message}`));

  const url = await newProject(request, "Policy check");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New card" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New card" }).click();
  await expect(page.getByRole("dialog", { name: "New card" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Theme switching uses an inline script and class changes.
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("menuitem", { name: /dark/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  const editor = await openNote(page, url);
  await editor.click();
  await editor.pressSequentially("Typing under the policy");
  await page.getByTestId("file-input").setInputFiles({
    name: "doc.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await expect(page.locator("object[type='application/pdf']")).toBeAttached();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
  await page.keyboard.press("Escape");

  for (const path of ["/projects", "/templates", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    // Let the page finish streaming before leaving it, or the server logs an aborted response.
    await page.waitForLoadState("networkidle");
  }
  // Give late violations (reported asynchronously) a moment to surface.
  await page.waitForTimeout(500);
  expect(violations).toEqual([]);
});
