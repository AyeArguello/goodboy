import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Runs against a real local Supabase stack (`pnpm supabase:start`, which
 * needs Docker). Not part of `pnpm test` — see `pnpm test:integration` and
 * the `db-and-e2e` CI job, which has Docker available even where local dev
 * environments might not.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["supabase/tests/**/*.integration.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
