// @vitest-environment node
/**
 * /link-preview reaches the og service on the app's own origin — via nginx in
 * production, via the vite dev server locally. Both are config, so both fail
 * silently; these are the properties worth failing CI over.
 *
 * Node rather than jsdom because importing vite.config.ts pulls in esbuild,
 * which refuses to run against jsdom's TextEncoder. It lives under
 * client/src/test because that is the only tree vitest includes.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config, { PREVIEW_DOWN } from "../../../vite.config";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const conf = fs.readFileSync(path.join(ROOT, "nginx.conf"), "utf8");

/** Body of `location <matcher> {` … `}`, brace-counted so nested blocks survive. */
function locationBody(matcher: string): string {
  const header = `location ${matcher} {`;
  const start = conf.indexOf(header);
  if (start === -1) throw new Error(`no \`${header}\` in nginx.conf`);
  let depth = 0;
  for (let i = start + header.length - 1; i < conf.length; i++) {
    if (conf[i] === "{") depth++;
    else if (conf[i] === "}" && --depth === 0) {
      return conf.slice(start + header.length, i);
    }
  }
  throw new Error(`unterminated \`${header}\``);
}

describe("nginx /link-preview", () => {
  it("is a `^~` prefix, so no regex location can outrank it", () => {
    expect(conf).toMatch(/location \^~ \/link-preview \{/);
  });

  it("proxies to the og upstream, resolved at request time", () => {
    const body = locationBody("^~ /link-preview");
    expect(body).toContain("set $og_upstream ${OG_UPSTREAM};");
    expect(body).toContain("proxy_pass http://$og_upstream;");
  });

  it("never falls back to the SPA — a JSON caller must not get HTML", () => {
    const body = locationBody("^~ /link-preview");
    expect(body).not.toContain("try_files");
    expect(body).not.toContain("index.html");
    expect(body).not.toContain("@spa");
  });

  it("forwards X-Forwarded-For, or the service's limiter has nothing to key on", () => {
    expect(locationBody("^~ /link-preview")).toContain(
      "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    );
  });

  it("sends upstream failures to the JSON 503 handler", () => {
    expect(locationBody("^~ /link-preview")).toMatch(
      /error_page\s+502\s+503\s+504\s+=\s+@preview_down;/,
    );
  });

  it("answers a downed service with JSON, in the envelope the UI expects", () => {
    const body = locationBody("@preview_down");
    expect(body).toContain("default_type application/json;");
    // Byte-for-byte, so nginx and the dev proxy cannot drift apart.
    expect(body).toContain(`return 503 '${PREVIEW_DOWN}';`);
    expect(JSON.parse(PREVIEW_DOWN)).toEqual({
      code: 503,
      message: "link preview unavailable",
      data: null,
    });
  });
});

type ProxyEntry = {
  target: string;
  xfwd?: boolean;
  configure?: (proxy: { on: (e: string, fn: ErrorHandler) => void }) => void;
};
type ErrorHandler = (
  err: Error,
  req: unknown,
  res: {
    writeHead: (code: number, headers: Record<string, string>) => void;
    end: (body: string) => void;
    headersSent: boolean;
  },
) => void;

const preview = (config as { server?: { proxy?: Record<string, ProxyEntry> } })
  .server?.proxy?.["/link-preview"];

describe("vite dev server", () => {
  it("proxies /link-preview so local development reaches a local service", () => {
    expect(preview).toBeDefined();
    expect(preview!.target).toMatch(/^http:\/\/\S+:\d+$/);
  });

  it("adds a forwarding hop, so the service's limiter has something to key on", () => {
    expect(preview!.xfwd).toBe(true);
  });

  it("answers an unreachable service with the same JSON 503 nginx sends", () => {
    let onError: ErrorHandler | undefined;
    preview!.configure!({
      on: (event, fn) => {
        if (event === "error") onError = fn;
      },
    });
    expect(onError).toBeDefined();

    const res = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };
    onError!(new Error("ECONNREFUSED"), {}, res);
    expect(res.writeHead).toHaveBeenCalledWith(503, {
      "Content-Type": "application/json",
    });
    expect(res.end).toHaveBeenCalledWith(PREVIEW_DOWN);
  });
});
