import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // CI splits the tests over parallel jobs (--shard in e2e.yml), so they're spread one by
  // one, not per file. Still one worker per run: the tests share the bridge's settings.json
  // and .dev-data/plugins, so two at once would trip over each other.
  fullyParallel: true,
  workers: 1,
  // Reduced motion, so layout checks measure settled positions; one test turns motion back on.
  use: { baseURL: "http://127.0.0.1:5183", browserName: "chromium", viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" },
  webServer: [
    { command: "python dev-server.py 8643", url: "http://127.0.0.1:8643/health", reuseExistingServer: !process.env.CI },
    { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5183", reuseExistingServer: !process.env.CI },
  ],
});
