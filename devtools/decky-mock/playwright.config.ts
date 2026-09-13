import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5183", browserName: "chromium", viewport: { width: 1280, height: 800 } },
  webServer: [
    { command: "python dev-server.py 8643", url: "http://127.0.0.1:8643/health", reuseExistingServer: !process.env.CI },
    { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5183", reuseExistingServer: !process.env.CI },
  ],
});
