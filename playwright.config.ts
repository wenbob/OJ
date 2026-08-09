import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: "test-results/e2e",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.platform === "win32" ? { channel: "chrome" } : {}),
      },
    },
  ],
  reporter: [["list"]],
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/start-e2e-server.mjs",
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 120_000,
    url: `${baseURL}/api/health`,
  },
  workers: 1,
});
