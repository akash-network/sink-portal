import { defineConfig, devices } from "@playwright/test";
import { testEnvConfig } from "./e2e/fixture/test-env.config";

// Reports, traces and screenshots contain private network data; keep them in
// the ignored .cache directory and never upload them anywhere public.
export default defineConfig({
  testDir: "./e2e",
  outputDir: ".cache/e2e/test-results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  // The page reads balances and receipts from the testnet through its proxy.
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: ".cache/e2e/report", open: "never" }],
  ],
  use: {
    baseURL: testEnvConfig.BASE_URL,
    // The portal reads and shows amounts in the browser locale's decimal mark.
    // Pin it so results don't depend on the machine; specs override it.
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
