import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { precacheLists, type BuiltFile } from "./client/src/sw/precache";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Byte-for-byte the body nginx's @preview_down returns. Keep the two in step. */
export const PREVIEW_DOWN = '{"code":503,"message":"link preview unavailable","data":null}';

function spaFallbackPlugin() {
  return {
    name: "spa-fallback",
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      const index = path.join(dist, "index.html");
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.join(dist, "200.html"));
        fs.copyFileSync(index, path.join(dist, "404.html"));
      }
    },
  };
}

/**
 * This build's id, in the page (`__BUILD_ID__`) and in its service worker: the
 * page asks a waiting worker for its id, and reloads for it only when the two
 * differ (lib/serviceWorker).
 */
const BUILD_ID = process.env.BUILD_ID || Date.now().toString(36);

/**
 * /sw.js: client/src/sw/sw.ts transpiled on its own — a worker is one classic
 * script — with this build's id and file lists stamped in (sw/precache).
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: "service-worker",
    apply: "build",
    async generateBundle(_options, bundle) {
      const { entry, shell, routes, missing } = precacheLists(bundle as unknown as Record<string, BuiltFile>);
      if (missing.length) this.warn(`sw: no chunk for ${missing.join(", ")} — rename in sw/precache APP_SCREENS`);
      const source = fs.readFileSync(path.resolve(__dirname, "client", "src", "sw", "sw.ts"), "utf8");
      const { code } = await transformWithEsbuild(source, "sw.ts", {
        loader: "ts",
        format: "iife",
        target: "es2020",
        minify: true,
        define: {
          __SW_BUILD_ID__: JSON.stringify(BUILD_ID),
          __SW_PRECACHE__: JSON.stringify(shell),
          __SW_ENTRY__: JSON.stringify(`/${entry}`),
          __SW_ROUTES__: JSON.stringify(routes),
        },
      });
      this.emitFile({ type: "asset", fileName: "sw.js", source: code });
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), spaFallbackPlugin(), serviceWorkerPlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    host: "0.0.0.0",
    allowedHosts: true,
    // Same-origin in development too: the service reads Sec-Fetch-Site to pick
    // a rate-limit tier, and a cross-origin dev setup lands the SPA in the
    // tight one.
    proxy: {
      "/link-preview": {
        target: `http://${process.env.OG_UPSTREAM ?? "127.0.0.1:8080"}`,
        // One hop, so a local service wanting real per-client keys needs
        // TRUSTED_PROXY_HOPS=1; at its default of 2 it falls back to the peer.
        xfwd: true,
        // Vite's own answer here is a plain-text 500; nginx sends the envelope.
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (!("writeHead" in res) || res.headersSent) return;
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(PREVIEW_DOWN);
          });
        },
      },
    },
  },
});
