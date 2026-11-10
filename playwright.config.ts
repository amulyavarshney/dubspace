import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3200";
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E suite runs against the seeded development database (`pnpm db:seed`) using the
 * production build (`pnpm build` first). It starts `next start` on a dedicated port so a
 * running `pnpm dev` is unaffected (Next.js allows only one dev server per project).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `APP_BASE_URL=${baseURL} INLINE_WORKER=true AUTH_RATE_LIMIT_DISABLED=true pnpm next start -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
