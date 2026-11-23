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

/**
 * The face nearly every word on first paint is set in: Figtree's Latin subset.
 * The CSS names it, so without a hint its download only starts once the
 * stylesheet has arrived and been parsed; preloaded, it overlaps the stylesheet.
 */
const PRELOAD_FONT = /^assets\/figtree-latin-wght-normal-[^/]*\.woff2$/;

/**
 * `<link rel="preload" as="font">` for PRELOAD_FONT, with the hashed name this
 * build gave it. Build only: the dev server serves fonts unhashed from
 * node_modules. `crossorigin` is required even same-origin, or the browser
 * fetches the font a second time for the @font-face that uses it.
 */
function fontPreloadPlugin(): Plugin {
  return {
    name: "font-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const font = Object.keys(ctx.bundle ?? {}).find((name) => PRELOAD_FONT.test(name));
        if (!font) {
          console.warn("font-preload: no figtree-latin-wght-normal woff2 in the bundle; nothing preloaded");
          return [];
        }
        return [
          {
            tag: "link",
            attrs: { rel: "preload", as: "font", type: "font/woff2", crossorigin: true, href: `/${font}` },
            injectTo: "head",
          },
        ];
      },
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), fontPreloadPlugin(), spaFallbackPlugin(), serviceWorkerPlugin()],
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
      // GitHub's public API, as nginx proxies it in staging and production
      // (services/github): the page asks our origin, never api.github.com.
      "/github": {
        target: "https://api.github.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/github/, ""),
        headers: { "User-Agent": "Brainstorm-UI-dev" },
      },
      // Open Library, the same way (services/openLibrary): a book's page asks
      // our origin for the edition, the work and its ratings.
      "/openlibrary": {
        target: "https://openlibrary.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openlibrary/, ""),
        // The ISBN path answers with a redirect to the edition; follow it here, so the
        // browser never contacts openlibrary.org itself.
        followRedirects: true,
        headers: { "User-Agent": "Brainstorm-UI-dev" },
      },
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
