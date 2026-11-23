// @vitest-environment node
/**
 * How nginx hands the app's files out: compression, and how long a browser may
 * keep each kind. Every one of these fails silently — a page still loads, just
 * slower or staler — so the properties are held here.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { locationBody, nginxConf } from "./nginxConf";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");

const PUBLIC_ART = 'add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800";';

describe("nginx /assets/", () => {
  const body = locationBody("^~ /assets/");

  it("sends one Cache-Control, immutable for a year", () => {
    expect(body).toContain('add_header Cache-Control "public, max-age=31536000, immutable";');
    expect(body).not.toMatch(/\bexpires\b/);
  });

  it("never marks a 404 immutable: a rolling deploy can 404 a chunk for a moment", () => {
    expect(body).not.toMatch(/immutable"\s+always/);
  });

  it("sends the .gz the image build wrote, and only here", () => {
    expect(body).toContain("gzip_static on;");
    expect(nginxConf.match(/gzip_static on;/g)).toHaveLength(1);
    // The Dockerfile compresses dist/assets alone: the HTML and config.js are rewritten at start.
    expect(dockerfile).toContain("readdirSync('dist/assets'");
  });
});

describe("nginx public/ art", () => {
  it.each(["/brand/", "/icons/", "/splash/", "/screenshots/"])("%s is cached a day and 404s when missing", (dir) => {
    const body = locationBody(`^~ ${dir}`);
    expect(body).toContain(PUBLIC_ART);
    expect(body).toContain("try_files $uri =404;");
  });

  it("caches images at the root the same way, below the dotfile rule", () => {
    const matcher = "~* ^/[^/]+\\.(?:png|webp|jpe?g|gif|svg|ico|avif)$";
    expect(locationBody(matcher)).toContain(PUBLIC_ART);
    expect(nginxConf.indexOf(`location ${matcher} {`)).toBeGreaterThan(nginxConf.indexOf("location ~ /\\. {"));
  });

  it("gives every file a content-derived mtime, so an unchanged file keeps its ETag across deploys", () => {
    expect(dockerfile).toMatch(/createHash\('sha256'\)[\s\S]*utimesSync/);
  });
});

describe("nginx HTML", () => {
  it("is revalidated, never no-store (which bars the back/forward cache and 304s)", () => {
    expect(nginxConf).not.toMatch(/Cache-Control "[^"]*no-store/);
    expect(locationBody("= /index.html")).toContain('add_header Cache-Control "no-cache";');
  });
});

describe("nginx compression", () => {
  it("compresses well, for proxied clients too, and says it varies", () => {
    expect(nginxConf).toContain("gzip_comp_level 6;");
    expect(nginxConf).toContain("gzip_vary on;");
    expect(nginxConf).toContain("gzip_proxied any;");
    for (const type of ["text/css", "application/javascript", "application/json", "application/manifest+json"])
      expect(nginxConf).toMatch(new RegExp(`gzip_types[^;]*${type.replace("+", "\\+")}`));
  });
});

describe("nginx /github/ and /openlibrary/", () => {
  const PROXIES = [
    { prefix: "/github/", upstream: "$github_upstream", host: "api.github.com" },
    { prefix: "/openlibrary/", upstream: "$openlibrary_upstream", host: "openlibrary.org" },
  ];

  it.each(PROXIES)("$prefix proxies to $host, resolved per request", ({ prefix, upstream, host }) => {
    const body = locationBody(`^~ ${prefix}`);
    expect(body).toContain(`set ${upstream} ${host};`);
    expect(body).toContain(`proxy_pass https://${upstream};`);
    // `set` is a rewrite-module directive: after `rewrite … break` it would never run.
    expect(body.indexOf(`set ${upstream}`)).toBeLessThan(body.indexOf("rewrite "));
    expect(body).toContain("proxy_ssl_server_name on;");
    expect(body).toMatch(/proxy_set_header User-Agent "[^"]+";/);
  });

  it.each(PROXIES)("$prefix caches, and serves the last copy when the upstream refuses", ({ prefix }) => {
    const body = locationBody(`^~ ${prefix}`);
    expect(body).toContain("proxy_cache lookups;");
    expect(body).toContain("proxy_ignore_headers Cache-Control Expires Set-Cookie Vary;");
    expect(body).toMatch(/proxy_cache_valid 200[^;]* 1d;/);
    expect(body).toMatch(/proxy_cache_use_stale [^;]*updating[^;]*http_403[^;]*http_429/);
    expect(nginxConf).toMatch(/proxy_cache_path \S+ [^;]*keys_zone=lookups:/);
  });

  it.each(PROXIES)("$prefix is GET only, rate-limited, and sends no cookie either way", ({ prefix }) => {
    const body = locationBody(`^~ ${prefix}`);
    expect(body).toContain("limit_except GET { deny all; }");
    expect(body).toContain("limit_req zone=lookup");
    expect(body).toContain('proxy_set_header Cookie "";');
    expect(body).toContain("proxy_hide_header Set-Cookie;");
  });

  it("brings Open Library's ISBN redirect back through this proxy, as a relative URL", () => {
    const body = locationBody("^~ /openlibrary/");
    expect(body).toContain("proxy_redirect https://openlibrary.org/ /openlibrary/;");
    expect(body).toContain("absolute_redirect off;");
  });
});
