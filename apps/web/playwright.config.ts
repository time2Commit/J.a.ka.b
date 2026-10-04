import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    locale: "en-US",
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
