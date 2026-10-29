import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `npm run build:lists`: client/src/lib/listTools.ts, and everything it
 * imports, as one ES module that runs in Node, at dist-lists/lists.js.
 *
 * It bakes in no deployment's env (the prefix below matches nothing), so the
 * config the list code reads falls back to the repo's own JSON, which is the
 * same on every deployment. The modules guard `window`, so nothing else needs
 * a browser.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
    },
  },
  envPrefix: "LISTS_BUILD_BAKES_NO_ENV_",
  publicDir: false,
  build: {
    lib: {
      entry: path.resolve(__dirname, "client", "src", "lib", "listTools.ts"),
      formats: ["es"],
      fileName: () => "lists.js",
    },
    outDir: path.resolve(__dirname, "dist-lists"),
    emptyOutDir: true,
    target: "node22",
    minify: false,
    sourcemap: false,
  },
});
