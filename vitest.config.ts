import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dir, "client", "src"),
      "@assets": path.resolve(dir, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./client/src/test/setup.ts"],
    include: ["client/src/**/*.test.{ts,tsx}"],
    css: false,
    pool: "forks",
    poolOptions: {
      // Node ≥25 enables Web Storage by default; its native localStorage global
      // shadows jsdom's (populateGlobal skips keys already on globalThis).
      // Turning it off restores real jsdom Storage, sessionStorage included.
      forks: { execArgv: ["--no-experimental-webstorage"] },
    },
  },
});
