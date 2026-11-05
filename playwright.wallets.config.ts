import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "wallets-local.spec.ts",
  outputDir: ".cache/wallet-mobile/browser",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4178", trace: "retain-on-failure" },
  webServer: {
    command: "npx tsx e2e/fixture/wallet-preview-server.ts",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "iphone-layout",
      grepInvert: /\[desktop\]/,
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
