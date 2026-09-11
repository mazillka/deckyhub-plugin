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
  server: { port: 5183 },
});
