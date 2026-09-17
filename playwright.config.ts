import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["browser.spec.ts", "login.spec.ts"],
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8790",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun scripts/browser-server.ts --development",
      url: "http://127.0.0.1:8790/api/session",
      reuseExistingServer: false,
      timeout: 30000,
      env: { WRANGLER_SEND_METRICS: "false" },
    },
    {
      command: "bun scripts/browser-server.ts",
      url: "https://127.0.0.1:8791/",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
