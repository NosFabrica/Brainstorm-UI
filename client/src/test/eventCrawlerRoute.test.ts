/**
 * /e/{id} unfurls: crawlers get og's note/article/calendar/place card, humans the SPA,
 * and anything og can't describe falls back to the SPA's generic card.
 */
import { describe, expect, it } from "vitest";
import { locationBody, nginxConf } from "./nginxConf";

const E = "~ ^/e/[^/]+/?$";

describe("nginx /e/", () => {
  it("sends crawlers to og and everyone else to the SPA", () => {
    const body = locationBody(E);
    expect(body).toContain("error_page 418 = @og;");
    expect(body).toContain("if ($is_og_bot) { return 418; }");
    expect(body).toContain("try_files $uri $uri/ /index.html;");
  });

  it("sits above the extension deny-list, like /p/ and /s/", () => {
    expect(nginxConf.indexOf(`location ${E} {`)).toBeGreaterThan(-1);
    expect(nginxConf.indexOf(`location ${E} {`)).toBeLessThan(nginxConf.indexOf("location ~* \\.(php|"));
  });
});
