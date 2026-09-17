import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8790",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "bun run build && wrangler d1 migrations apply DB --local --persist-to .wrangler/browser-state && wrangler dev --ip 127.0.0.1 --port 8790 --persist-to .wrangler/browser-state",
    url: "http://127.0.0.1:8790/api/session",
    reuseExistingServer: false,
    timeout: 30000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
