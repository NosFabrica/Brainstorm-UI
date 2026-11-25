// @vitest-environment node
/**
 * The headers every response carries: a Content-Security-Policy, and the
 * clickjacking, sniffing, referrer and permission headers beside it. They are
 * written at container start (docker-entrypoint.sh), because the policy names
 * the page's inline scripts by hash and the inline config is only known then,
 * and nginx.conf includes them. Nothing fails loudly when a header is missing,
 * so the properties are held here.
 */
import { execFileSync, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nginxConf } from "./nginxConf";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ENTRYPOINT = path.join(ROOT, "docker-entrypoint.sh");
const INCLUDE = "include /etc/nginx/security-headers.conf;";

let dir: string;

function run(env: Record<string, string> = {}) {
  execFileSync("sh", [ENTRYPOINT, "true"], {
    env: {
      PATH: process.env.PATH,
      UI_HTML_ROOT: dir,
      UI_NGINX_ETC: path.join(dir, "etc"),
      OG_RESOLVER: "127.0.0.11",
      VITE_API_URL: "https://api.example.test",
      VITE_SEARCH_RELAY_URL: "wss://search.example.test/",
      VITE_HOUSE_OBSERVER: "</script><script>window.pwned=1</script>",
      ...env,
    },
  });
  return fs.readFileSync(path.join(dir, "etc", "security-headers.conf"), "utf8");
}

/** The inline scripts of a page as a browser hashes them: the text between the tags. */
function inlineScriptHashes(html: string): string[] {
  const out = new Set<string>();
  const re = /<!--[\s\S]*?-->|<script([^>]*)>([\s\S]*?)<\/script>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].startsWith("<!--")) continue;
    if (/\ssrc\s*=/.test(m[1])) continue;
    out.add(crypto.createHash("sha256").update(m[2], "utf8").digest("base64"));
  }
  return [...out];
}

const cspOf = (conf: string, name = "Content-Security-Policy") =>
  new RegExp(`add_header ${name} "([^"]+)" always;`).exec(conf)?.[1] ?? null;
const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? null;

/** The built pages and config.js as the image holds them, before the entrypoint first runs. */
function fresh() {
  for (const name of ["index.html", "200.html", "404.html"])
    fs.copyFileSync(path.join(ROOT, "client", "index.html"), path.join(dir, name));
  fs.copyFileSync(path.join(ROOT, "client", "public", "config.js"), path.join(dir, "config.js"));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "headers-"));
  fs.mkdirSync(path.join(dir, "etc"));
  fresh();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the Content-Security-Policy docker-entrypoint.sh writes", () => {
  it("lets exactly the page's own inline scripts run, the inline config included", () => {
    const conf = run();
    const csp = cspOf(conf)!;
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const hashes = inlineScriptHashes(html);
    // The theme bootstrap, the inline config and the relay head start.
    expect(hashes).toHaveLength(3);
    const allowed = [...directive(csp, "script-src")!.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual(hashes.sort());
  });

  it("follows the config into the hash: a different deploy's values, a different policy", () => {
    const a = directive(cspOf(run())!, "script-src");
    fresh();
    const b = directive(cspOf(run({ VITE_API_URL: "https://api.other.test" }))!, "script-src");
    expect(a).not.toBe(b);
    expect(b!.match(/'sha256-/g)).toHaveLength(3);
  });

  it("runs no other script: no unsafe-inline, no eval, no plugins, no base or frame tricks", () => {
    const csp = cspOf(run())!;
    const script = directive(csp, "script-src")!;
    expect(script).toMatch(/^script-src 'self' 'wasm-unsafe-eval'( 'sha256-[A-Za-z0-9+/]+=*')+$/);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
  });

  it("reaches what the app reaches: relays and APIs anywhere, media from anyone's host, its worker", () => {
    const csp = cspOf(run())!;
    expect(directive(csp, "connect-src")).toMatch(/ https: /);
    expect(directive(csp, "connect-src")).toMatch(/ wss: /);
    expect(directive(csp, "img-src")).toMatch(/ https: .* blob:/);
    expect(directive(csp, "media-src")).toMatch(/ blob:/);
    expect(directive(csp, "worker-src")).toMatch(/'self'/);
  });

  it("can report instead of block, or step aside, by CSP_MODE", () => {
    const report = run({ CSP_MODE: "report-only" });
    expect(cspOf(report)).toBeNull();
    expect(cspOf(report, "Content-Security-Policy-Report-Only")).toMatch(/script-src 'self'/);
    expect(run({ CSP_MODE: "off" })).not.toMatch(/Content-Security-Policy/);
  });

  it("sends the other headers in every mode", () => {
    for (const mode of ["enforce", "report-only", "off"]) {
      const conf = run({ CSP_MODE: mode });
      expect(conf).toContain('add_header X-Content-Type-Options "nosniff" always;');
      expect(conf).toContain('add_header X-Frame-Options "DENY" always;');
      expect(conf).toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
      expect(conf).toMatch(/add_header Permissions-Policy "[^"]*camera=\(\)[^"]*" always;/);
      expect(conf).toMatch(/add_header Strict-Transport-Security "max-age=\d+[^"]*" always;/);
    }
  });
});

describe("nginx.conf's security headers", () => {
  /** Every `location … {` block, brace-counted. */
  function locations(): { header: string; body: string }[] {
    const out: { header: string; body: string }[] = [];
    const re = /^ *location\s[^{\n]+\{/gm;
    for (let m = re.exec(nginxConf); m; m = re.exec(nginxConf)) {
      let depth = 0;
      for (let i = m.index + m[0].length - 1; i < nginxConf.length; i++) {
        if (nginxConf[i] === "{") depth++;
        else if (nginxConf[i] === "}" && --depth === 0) {
          out.push({ header: m[0], body: nginxConf.slice(m.index + m[0].length, i) });
          break;
        }
      }
    }
    return out;
  }

  it("are sent at server level", () => {
    const server = nginxConf.replace(/^ {4}location\s[^{\n]+\{[\s\S]*?\n {4}\}/gm, "");
    expect(server).toContain(INCLUDE);
    expect(nginxConf).toMatch(/\bserver_tokens off;/);
  });

  it("are repeated in every location that adds a header of its own, which inherits none", () => {
    const bare = locations().filter(({ body }) => /\badd_header\b/.test(body) && !body.includes(INCLUDE));
    expect(bare.map((l) => l.header)).toEqual([]);
  });

  it("are not doubled where a location already said one", () => {
    for (const { body } of locations())
      if (body.includes(INCLUDE)) expect(body).not.toMatch(/add_header X-Content-Type-Options/);
  });

  it("make a config nginx accepts", () => {
    const nginx = spawnSync("nginx", ["-v"]);
    if (nginx.error) return; // no nginx here; CI's image build runs it
    run();
    const etc = path.join(dir, "etc");
    const conf = nginxConf
      .replace(/\$\{OG_RESOLVER\}/g, "127.0.0.11")
      .replace(/\$\{OG_UPSTREAM\}/g, "og:8080")
      .replace(/\$\{IMG_UPSTREAM\}/g, "img:8080")
      .replace(/\$\{IMG_REFERER_HOSTS\}/g, "")
      .replace(/\/etc\/nginx\//g, `${etc}/`)
      .replace(/\/var\/cache\/nginx\//g, `${dir}/cache/`)
      .replace(/root \/usr\/share\/nginx\/html;/, `root ${dir};`);
    fs.writeFileSync(path.join(etc, "img-realip.conf"), "");
    fs.writeFileSync(
      path.join(etc, "nginx.conf"),
      `pid ${dir}/nginx.pid; error_log ${dir}/error.log; events {} http { access_log off; include ${path.join(etc, "site.conf")}; }`,
    );
    fs.writeFileSync(path.join(etc, "site.conf"), conf);
    const test = spawnSync("nginx", ["-t", "-c", path.join(etc, "nginx.conf"), "-p", dir], { encoding: "utf8" });
    expect(test.stderr).toMatch(/syntax is ok/);
  });
});
