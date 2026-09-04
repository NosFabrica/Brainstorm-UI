import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Byte-for-byte the body nginx's @preview_down returns. Keep the two in step. */
export const PREVIEW_DOWN =
  '{"code":503,"message":"link preview unavailable","data":null}';

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

      const serverCode = `
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 5000;
const DIST = __dirname;
const MIME = {".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".ico":"image/x-icon",".woff":"font/woff",".woff2":"font/woff2",".ttf":"font/ttf"};
http.createServer((req, res) => {
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";
  let fp = path.join(DIST, url);
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(DIST, "index.html");
  const ext = path.extname(fp);
  const ct = MIME[ext] || "application/octet-stream";
  try {
    const data = fs.readFileSync(fp);
    res.writeHead(200, {"Content-Type": ct, "Cache-Control": "public, max-age=3600"});
    res.end(data);
  } catch(e) {
    res.writeHead(404, {"Content-Type":"text/plain"});
    res.end("Not found");
  }
}).listen(PORT, "0.0.0.0", () => console.log("Serving on port " + PORT));
`.trim();
      fs.writeFileSync(path.join(dist, "index.cjs"), serverCode);
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), spaFallbackPlugin()],
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
