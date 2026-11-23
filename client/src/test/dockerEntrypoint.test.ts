// @vitest-environment node
/**
 * docker-entrypoint.sh inlines config.js into the pages at container start, so
 * a page load doesn't wait on a parser-blocking request for it. It runs once,
 * in the image, with nothing watching: a page whose config came out mangled
 * would boot against no API and no relays. So it is run here, for real, against
 * a scratch copy of index.html and config.js.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ENTRYPOINT = path.join(ROOT, "docker-entrypoint.sh");

const ENV = {
  VITE_API_URL: "https://api.example.test",
  VITE_SEARCH_RELAY_URL: "wss://search.example.test/",
  VITE_NIP85_RELAY_URL: "wss://scores.example.test",
  // Everything an HTML parser could take for the end of the script, or a comment.
  VITE_HOUSE_OBSERVER: "</script><script>window.pwned=1</script><!-- & | /",
};

let dir: string;

function run() {
  execFileSync("sh", [ENTRYPOINT, "true"], {
    env: {
      PATH: process.env.PATH,
      UI_HTML_ROOT: dir,
      UI_NGINX_ETC: path.join(dir, "etc"),
      OG_RESOLVER: "127.0.0.11",
      ...ENV,
    },
  });
}

const page = () => fs.readFileSync(path.join(dir, "index.html"), "utf8");

/** What the page's inline config sets window.__ENV__ to, run as a browser would. */
function inlineEnv(html: string): Record<string, string> {
  const script = /<!--CONFIG-START--><script>([\s\S]*?)<\/script><!--CONFIG-END-->/.exec(html)?.[1];
  if (script === undefined) throw new Error("no inline config");
  const window: { __ENV__?: Record<string, string> } = {};
  vm.runInNewContext(script, { window });
  return window.__ENV__ ?? {};
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "entrypoint-"));
  fs.mkdirSync(path.join(dir, "etc"));
  for (const name of ["index.html", "200.html"])
    fs.copyFileSync(path.join(ROOT, "client", "index.html"), path.join(dir, name));
  fs.copyFileSync(path.join(ROOT, "client", "public", "config.js"), path.join(dir, "config.js"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("docker-entrypoint.sh's inline config", () => {
  it("puts config.js's values in the page, with no request for config.js left", () => {
    run();
    const html = page();
    expect(html).not.toContain('<script src="/config.js">');
    const env = inlineEnv(html);
    expect(env.VITE_API_URL).toBe(ENV.VITE_API_URL);
    expect(env.VITE_SEARCH_RELAY_URL).toBe(ENV.VITE_SEARCH_RELAY_URL);
    // Every page the SPA can be served as, not only index.html.
    expect(fs.readFileSync(path.join(dir, "200.html"), "utf8")).toBe(html);
  });

  it("comes before the head start, which reads window.__ENV__", () => {
    run();
    const html = page();
    expect(html.indexOf("<!--CONFIG-END-->")).toBeLessThan(
      html.indexOf("(window.__ENV__ || {}).VITE_SEARCH_RELAY_URL"),
    );
  });

  it("keeps a value whole that an HTML parser would otherwise end the script on", () => {
    run();
    const html = page();
    const script = /<!--CONFIG-START--><script>([\s\S]*?)<\/script><!--CONFIG-END-->/.exec(html)![1];
    expect(script).not.toMatch(/<\/script|<!--/i);
    expect(inlineEnv(html).VITE_HOUSE_OBSERVER).toBe(ENV.VITE_HOUSE_OBSERVER);
  });

  it("leaves config.js in place, substituted, for the APK and the service worker", () => {
    run();
    const config = fs.readFileSync(path.join(dir, "config.js"), "utf8");
    const window: { __ENV__?: Record<string, string> } = {};
    vm.runInNewContext(config, { window });
    expect(window.__ENV__?.VITE_API_URL).toBe(ENV.VITE_API_URL);
  });

  it("inlines once however often the container restarts", () => {
    run();
    run();
    const html = page();
    expect(html.match(/<!--CONFIG-START-->/g)).toHaveLength(1);
    expect(html.match(/window\.__ENV__ = /g)).toHaveLength(1);
    expect(inlineEnv(html).VITE_API_URL).toBe(ENV.VITE_API_URL);
  });
});
