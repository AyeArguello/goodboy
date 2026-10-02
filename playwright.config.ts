import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Next dev's cross-origin protection blocks HMR websocket requests from
// 127.0.0.1 by default (only localhost is allowed out of the box), which
// silently breaks client hydration for anything loaded through it — every
// interactive component then fails to respond to the first real click.
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // next dev compiles routes and Server Actions on first use, which is slow on CI.
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "next dev -p " + PORT,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
  ],
});
