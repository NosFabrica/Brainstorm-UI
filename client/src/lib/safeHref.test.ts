import { describe, expect, it } from "vitest";
import { httpsHref, safeHref, sameOriginPath } from "./safeHref";

describe("safeHref", () => {
  it("passes web addresses through, trimmed", () => {
    expect(safeHref("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(safeHref("  http://example.com ")).toBe("http://example.com");
    expect(safeHref("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
  });

  it("refuses every other scheme someone's tags could carry", () => {
    for (const bad of [
      "javascript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "\u0000javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "blob:https://brainstorm.world/1234",
      "file:///etc/passwd",
      "//evil.example",
      "/relative",
      "example.com",
      "",
      "   ",
    ])
      expect(safeHref(bad), bad).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
  });

  it("takes mailto: only where it was asked for", () => {
    expect(safeHref("mailto:a@example.com")).toBeUndefined();
    expect(safeHref("mailto:a@example.com", { mailto: true })).toBe("mailto:a@example.com");
    expect(safeHref("javascript:alert(1)", { mailto: true })).toBeUndefined();
  });
});

describe("httpsHref", () => {
  it("takes https only", () => {
    expect(httpsHref("https://nsec.app/approve?x=1")).toBe("https://nsec.app/approve?x=1");
    expect(httpsHref("http://nsec.app/approve")).toBeUndefined();
    expect(httpsHref("javascript:alert(1)")).toBeUndefined();
  });
});

describe("sameOriginPath", () => {
  const ORIGIN = "https://brainstorm.world";

  it("keeps a path on this site, with its query and fragment", () => {
    expect(sameOriginPath("/e/nevent1abc", ORIGIN)).toBe("/e/nevent1abc");
    expect(sameOriginPath("/?q=bitcoin&t=all", ORIGIN)).toBe("/?q=bitcoin&t=all");
    expect(sameOriginPath("/p/npub1x#notes", ORIGIN)).toBe("/p/npub1x#notes");
  });

  it("refuses anything that leaves the origin, however it is spelled", () => {
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "http://brainstorm.world/",
      "relative/path",
      "",
    ])
      expect(sameOriginPath(bad, ORIGIN), bad).toBeNull();
    expect(sameOriginPath(null, ORIGIN)).toBeNull();
  });

  it("refuses a same-origin path that would read as another host once navigated to", () => {
    // new URL("/.//evil.example", origin).pathname is "//evil.example": pushState
    // and location.assign both read that as a host.
    expect(sameOriginPath("/.//evil.example", ORIGIN)).toBeNull();
    expect(sameOriginPath("/x/..//evil.example", ORIGIN)).toBeNull();
  });

  it("refuses the pages a caller names, query or not", () => {
    expect(sameOriginPath("/login", ORIGIN, ["/login"])).toBeNull();
    expect(sameOriginPath("/login?next=/x", ORIGIN, ["/login"])).toBeNull();
    expect(sameOriginPath("/start", ORIGIN, ["/login", "/start"])).toBeNull();
    expect(sameOriginPath("/setup", ORIGIN, ["/login"])).toBe("/setup");
  });

  it("defaults to the page's own origin", () => {
    expect(sameOriginPath("/x?y=1")).toBe("/x?y=1");
    expect(sameOriginPath("//evil.example")).toBeNull();
  });
});
