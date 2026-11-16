import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_PAGES = join(import.meta.dirname, "../app/(app)");

function pagesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pagesUnder(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

describe("pages of the signed-in area", () => {
  // The layout cannot know which page it wraps, so each page asks for the session itself: that
  // is what sends a person with a temporary password to the account page, whatever they open.
  it("each call requireSession, and only the account page accepts a temporary password", () => {
    const pages = pagesUnder(APP_PAGES);
    expect(pages.length).toBeGreaterThan(5);
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source, page).toMatch(/await requireSession\(/);
      expect(source.includes("allowTemporaryPassword"), page).toBe(
        page.endsWith(join("account", "page.tsx")),
      );
    }
  });
});
