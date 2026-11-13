import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The web app's `@/` imports (route handlers import through them).
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "apps/web/src") } },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**", "**/dist/**"],
  },
});
