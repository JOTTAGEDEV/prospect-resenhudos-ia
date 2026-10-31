import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx tsx tests/e2e-server.ts",
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: false,
    env: { APP_ORIGIN: "http://127.0.0.1:3101" },
    timeout: 30000,
  },
  reporter: "list",
});
