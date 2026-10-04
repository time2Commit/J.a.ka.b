import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    locale: "en-US",
    // Far from the workspace time zone on purpose: the board must show workspace time.
    timezoneId: "Asia/Tokyo",
    // Cloud sessions ship a preinstalled Chromium: set PW_CHROMIUM_PATH to use it.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: "pnpm build && pnpm start:standalone",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { PORT: "3000", HOSTNAME: "localhost" },
  },
});
