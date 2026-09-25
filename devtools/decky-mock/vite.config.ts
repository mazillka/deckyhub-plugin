import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      "@decky/api": path.resolve(__dirname, "api.ts"),
      "@decky/ui": path.resolve(__dirname, "ui.tsx"),
    },
  },
  // .dev-data holds the bridge's settings and fake installed plugins; watching
  // it keeps Windows handles open and makes tests' folder cleanup fail (EPERM).
  server: { port: 5183, watch: { ignored: ["**/.dev-data/**"] } },
});
