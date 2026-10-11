import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_PORT=3000 reuses a dev server that is already running (Next allows only
// one `next dev` per project folder).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
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
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      // The gallery journey fills the shared gallery up to its limit, so it
      // runs once (desktop); skipping it per test would count as skipped in CI.
      testIgnore: /admin-gallery.spec.ts/,
    },
  ],
});
