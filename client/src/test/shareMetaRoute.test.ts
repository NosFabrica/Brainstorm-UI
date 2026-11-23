// @vitest-environment node
/**
 * Share pages — /p/{id}, /e/{id}, /s/{code} — carry their own preview tags for
 * EVERY visitor: nginx serves the SPA and includes og's /meta/ fragment in its
 * <head> (SSI), with index.html's generic tags as the fallback. There is no
 * User-Agent split to fall out of date. All of it is config that fails
 * silently, so these are the properties worth failing CI over.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { locationBody, nginxConf } from "./nginxConf";

const indexHtml = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../index.html"),
  "utf8",
);

const SHARE_PAGES = [
  { matcher: "~ ^/p/([^/]+)/?$", meta: "/__og/meta/p/$1" },
  { matcher: "~ ^/e/([^/]+)/?$", meta: "/__og/meta/e/$1" },
  // `~*`: the QR payload is uppercase, so a scan arrives as /S/CODE.
  { matcher: "~* ^/s/([^/]+)/?$", meta: "/__og/meta/s/$1" },
];

describe("nginx share pages", () => {
  it.each(SHARE_PAGES)("$matcher serves the SPA with og's tags included", ({ matcher, meta }) => {
    const body = locationBody(matcher);
    expect(body).toContain(`set $share_meta ${meta};`);
    expect(body).toContain("ssi on;");
    // Served from this location, where includes run — not redirected to one where they don't.
    expect(body).toContain("try_files /index.html =404;");
    // Revalidated every load, as index.html is; `no-cache`, so it can still be a 304.
    expect(body).toContain('add_header Cache-Control "no-cache";');
  });

  it("no longer decides by User-Agent", () => {
    expect(nginxConf).not.toContain("$http_user_agent");
    expect(nginxConf).not.toContain("is_og_bot");
  });

  it.each(SHARE_PAGES)("$matcher sits above the extension deny-list", ({ matcher }) => {
    const at = nginxConf.indexOf(`location ${matcher} {`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(nginxConf.indexOf("location ~* \\.(php|"));
  });
});

describe("nginx /__og/ (the include)", () => {
  const body = locationBody("^~ /__og/");

  it("is reachable only as a subrequest", () => {
    expect(body).toContain("internal;");
  });

  it("asks og for the path after /__og/", () => {
    expect(body).toContain("set $og_upstream ${OG_UPSTREAM};");
    expect(body).toContain("rewrite ^/__og(/.*)$ $1 break;");
    expect(body).toContain("proxy_pass http://$og_upstream;");
    // `set` is a rewrite-module directive: after `rewrite … break` it would never run.
    expect(body.indexOf("set $og_upstream")).toBeLessThan(body.indexOf("rewrite "));
  });

  it("answers every failure with nothing, so the page keeps its generic tags", () => {
    // Anything the subrequest outputs lands in <head>, nginx's own error pages included.
    expect(body).toContain("proxy_intercept_errors on;");
    expect(body).toMatch(/error_page\s+400\s+404\s+500\s+502\s+503\s+504\s+=\s+@share_meta_none;/);
    expect(locationBody("@share_meta_none")).toContain("return 204;");
  });

  it("is bounded, because a person's page load waits on it", () => {
    const read = Number(/proxy_read_timeout (\d+)s;/.exec(body)?.[1]);
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThanOrEqual(5);
  });
});

describe("index.html's preview tags", () => {
  const block = /<!--# block name="share_meta" -->([\s\S]*?)<!--# endblock -->/.exec(indexHtml);

  it("are the include's fallback block, followed by the include", () => {
    expect(block).not.toBeNull();
    const include = '<!--# include virtual="$share_meta" stub="share_meta" -->';
    expect(indexHtml.indexOf(include)).toBeGreaterThan(indexHtml.indexOf("<!--# endblock -->"));
    expect(indexHtml.indexOf(include)).toBeLessThan(indexHtml.indexOf("</head>"));
  });

  it("are all inside the block, so an included page never carries two sets", () => {
    const outside = indexHtml.replace(block?.[0] ?? "", "");
    for (const tag of ['property="og:', 'name="twitter:', 'name="description"', 'rel="canonical"']) {
      expect(block?.[1]).toContain(tag);
      expect(outside).not.toContain(tag);
    }
  });

  it("leave <title> to the page: it names the tab, not the link", () => {
    expect(block?.[1]).not.toContain("<title>");
    expect(indexHtml).toContain("<title>");
  });
});
