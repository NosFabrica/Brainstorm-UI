import { expect } from "vitest";

/** Schemes that run or render as a page of their own when a reader clicks a link. */
const SCRIPTY = /^(?:javascript|data|vbscript|blob):/i;

/**
 * Every link under `root` is one a reader can click safely: none whose href
 * the browser would read as javascript:, data:, vbscript: or blob:. Read the
 * way the browser reads it (the URL parser drops tabs, newlines and leading
 * controls), so `java\tscript:` counts.
 */
export function expectNoScriptHrefs(root: ParentNode = document) {
  for (const a of root.querySelectorAll("a[href], area[href]")) {
    const raw = a.getAttribute("href") ?? "";
    let scheme = "";
    try {
      scheme = new URL(raw, "https://brainstorm.test/").protocol;
    } catch {
      /* not a URL at all: not a scheme either */
    }
    expect(SCRIPTY.test(scheme) || SCRIPTY.test(raw.trim()), `href=${JSON.stringify(raw)}`).toBe(false);
  }
}

/** A hostile value for a URL-shaped tag: script once clicked. */
export const HOSTILE_URL = "javascript:alert(document.domain)";
/** One that passes a "has a host" check: `new URL(...).host` is "x.example". */
export const HOSTILE_URL_WITH_HOST = "javascript://x.example/%0aalert(document.domain)";
