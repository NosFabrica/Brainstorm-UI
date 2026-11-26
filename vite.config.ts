import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import zlib from "zlib";
import { precacheLists, type BuiltFile } from "./client/src/sw/precache";
import { bundleReport, type BudgetFile } from "./client/src/buildChecks/bundleBudget";

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
 * What the first page downloads, printed with every build, and the build
 * fails when the entry outgrows its budget or the chunks it loads import each
 * other in a circle (client/src/buildChecks/bundleBudget). Gzipped at level 9, as
 * the image serves them (Dockerfile).
 */
function bundleBudgetPlugin(): Plugin {
  return {
    name: "bundle-budget",
    apply: "build",
    // After Vite's own generateBundle, which still rewrites the chunks' preload lists.
    enforce: "post",
    generateBundle(_options, bundle) {
      const gzip = (code: string) => zlib.gzipSync(code, { level: 9 }).length;
      const report = bundleReport(bundle as unknown as Record<string, BudgetFile>, gzip);
      const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
      console.log(
        `bundle: entry ${report.entry} ${kb(report.entryGz)} gz; first page ${report.firstLoad.length} chunks, ${kb(report.firstLoadGz)} gz`,
      );
      if (report.problems.length) this.error(report.problems.join("\n"));
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

/**
 * Libraries that change far less often than the app, each in a chunk of its
 * own: an app release then re-hashes only the app's chunk, and a returning
 * visitor's cached copy of these still holds. The browser fetches them side
 * by side with the entry (modulepreload), so the first visit is no heavier.
 */
const VENDOR_CHUNKS: [name: string, packages: RegExp][] = [
  ["react", /\/node_modules\/(react|react-dom|scheduler)\//],
  ["nostr", /\/node_modules\/(applesauce-[^/]+|nostr-tools|@noble\/[^/]+|@scure\/[^/]+|rxjs)\//],
  ["ui", /\/node_modules\/(@radix-ui\/[^/]+|@floating-ui\/[^/]+|lucide-react|tailwind-merge)\//],
];

/**
 * lucide-react's icons, one module each, and the barrel that re-exports them.
 * The entry reaches every icon through that barrel, and which of them a page
 * really uses is only known once the bundle is tree-shaken, after chunks are
 * assigned; Rollup also moves a manual chunk's unassigned imports in with it.
 * In the vendor chunk, every lazy page's icons would ship on the first visit,
 * so they stay with the code that draws them; lucide's shared core goes in `ui`.
 */
const LUCIDE_ICONS = /\/node_modules\/lucide-react\/dist\/esm\/(icons\/|lucide-react\.js$)/;

type ModuleInfo = { isEntry: boolean; importedIds: readonly string[] } | null;
interface ChunkMeta {
  getModuleIds: () => IterableIterator<string>;
  getModuleInfo: (id: string) => ModuleInfo;
}

/**
 * A vendor chunk holds only what the first page already runs: the modules the
 * entry reaches through static imports. A lazy page's own icon or Radix
 * widget stays in that page's chunk, where it was, rather than coming along
 * with the vendor chunk on every visit.
 */
function vendorChunks() {
  let eager: Set<string> | null = null;
  const reach = (meta: ChunkMeta): Set<string> => {
    const seen = new Set<string>();
    const queue = [...meta.getModuleIds()].filter((id) => meta.getModuleInfo(id)?.isEntry);
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of meta.getModuleInfo(id)?.importedIds ?? []) queue.push(next);
    }
    return seen;
  };
  return (id: string, meta: ChunkMeta): string | undefined => {
    // Rollup's CommonJS interop, which React's CJS build needs first. Left
    // unassigned it joins whichever vendor chunk reached it first (`nostr`),
    // and `react` then imports `nostr`, which imports `react`: a chunk cycle,
    // which runs React's module before the helper it calls exists.
    if (id.includes("commonjsHelpers")) return "react";
    const vendor = VENDOR_CHUNKS.find(([, packages]) => packages.test(id));
    if (!vendor || LUCIDE_ICONS.test(id)) return undefined;
    eager ??= reach(meta);
    return eager.has(id) ? vendor[0] : undefined;
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), fontPreloadPlugin(), spaFallbackPlugin(), serviceWorkerPlugin(), bundleBudgetPlugin()],
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
    rollupOptions: { output: { manualChunks: vendorChunks() } },
  },
  server: {
    port: 5000,
    host: "0.0.0.0",
    // No `allowedHosts: true`: that turns off the dev server's Host check, and
    // any site could then read it through DNS rebinding. Vite always allows
    // localhost, *.localhost and IP addresses, which is everything
    // docs/agents/run-ui.md and the e2e stack open (a phone on the LAN by IP).
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
