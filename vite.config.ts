import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

function spaFallbackPlugin() {
  return {
    name: "spa-fallback",
    closeBundle() {
      const dist = path.resolve(import.meta.dirname, "dist");
      const index = path.join(dist, "index.html");
      const fallback = path.join(dist, "200.html");
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, fallback);
      }
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), spaFallbackPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
