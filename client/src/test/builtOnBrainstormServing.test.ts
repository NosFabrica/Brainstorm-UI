/**
 * /built-on/ is fetched by other sites: every app's copy of <built-on-brainstorm> loads v1.css
 * from here (docs/built-on-brainstorm.md). nginx is config, so a mistake in it fails silently,
 * in every app at once; these are the properties worth failing CI over.
 */
import { describe, expect, it } from "vitest";
import { locationBody, nginxConf } from "./nginxConf";

describe("nginx /built-on/", () => {
  it("is a `^~` prefix, so no regex location can outrank it", () => {
    expect(nginxConf).toMatch(/location \^~ \/built-on\/ \{/);
  });

  it("sends each of its headers always: an hour's cache, any origin, no sniffing", () => {
    const body = locationBody("^~ /built-on/");
    expect(body).toContain('add_header Cache-Control "public, max-age=3600" always;');
    expect(body).toContain('add_header Access-Control-Allow-Origin "*" always;');
    expect(body).toContain('add_header X-Content-Type-Options "nosniff" always;');
  });

  it("answers a missing file with a 404, never the app", () => {
    const body = locationBody("^~ /built-on/");
    expect(body).toContain("try_files $uri $uri/ =404;");
    expect(body).not.toContain("index.html");
  });
});
