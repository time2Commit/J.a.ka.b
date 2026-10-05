import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // On CI: annotate failures in the PR and keep an HTML report to upload as an artifact.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "en-US",
    // Far from the workspace time zone on purpose: the board must show workspace time.
    timezoneId: "Asia/Tokyo",
    // Cloud sessions ship a preinstalled Chromium: set PW_CHROMIUM_PATH to use it.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  webServer: [
    {
      command: "pnpm build && pnpm start:standalone",
      url: "http://localhost:3000/login",
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        PORT: "3000",
        HOSTNAME: "localhost",
        // Small limit so the "too large" path can be tested with a 2 MB file.
        UPLOAD_MAX_MB: "1",
        UPLOAD_DIR: "./data/e2e-uploads",
        BACKUP_DIR: "./data/e2e-backups",
      },
    },
    {
      // Real-time notes: the collab server validates sessions against the web app above.
      command: "pnpm --filter @jakab/collab start",
      url: "http://localhost:1234",
      reuseExistingServer: true,
      timeout: 60_000,
      env: { COLLAB_PORT: "1234", WEB_INTERNAL_URL: "http://localhost:3000" },
    },
  ],
});
