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
