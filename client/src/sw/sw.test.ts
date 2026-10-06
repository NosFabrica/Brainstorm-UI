import { describe, expect, it } from "vitest";
import { strategyFor } from "./sw";

const ORIGIN = "https://brainstorm.world";
const page = { method: "GET", mode: "navigate" };
const fetch = { method: "GET", mode: "cors" };
const at = (path: string) => new URL(path, ORIGIN);

describe("what the worker does with a request", () => {
  it("serves every page load from the shell, whatever the path", () => {
    for (const path of ["/", "/messages/abc", "/p/npub1xyz", "/e/nevent1abc?x=1", "/dashboard"])
      expect(strategyFor(at(path), page, ORIGIN)).toBe("shell");
  });

  it("leaves what nginx answers itself to nginx, page load or not", () => {
    for (const path of [
      "/og/p/abc.png",
      "/img/abc",
      "/link-preview?url=x",
      "/.well-known/nostr.json",
      "/bot",
      "/robots.txt",
    ]) {
      expect(strategyFor(at(path), page, ORIGIN)).toBeNull();
      expect(strategyFor(at(path), fetch, ORIGIN)).toBeNull();
    }
  });

  it("keeps hashed assets for good, but not video (range requests)", () => {
    expect(strategyFor(at("/assets/index-abc.js"), fetch, ORIGIN)).toBe("cache-first");
    expect(strategyFor(at("/assets/figtree-latin-wght-normal-abc.woff2"), fetch, ORIGIN)).toBe("cache-first");
    expect(strategyFor(at("/assets/hero-abc.webp"), fetch, ORIGIN)).toBe("cache-first");
    expect(strategyFor(at("/assets/about_hero-abc.mp4"), fetch, ORIGIN)).toBeNull();
  });

  it("asks the network first for what a deploy rewrites", () => {
    expect(strategyFor(at("/config.js"), fetch, ORIGIN)).toBe("network-first");
    expect(strategyFor(at("/site.webmanifest"), fetch, ORIGIN)).toBe("network-first");
  });

  it("answers icons from the cache and refreshes them behind", () => {
    expect(strategyFor(at("/icons/icon-192.png"), fetch, ORIGIN)).toBe("stale-while-revalidate");
    expect(strategyFor(at("/favicon.svg"), fetch, ORIGIN)).toBe("stale-while-revalidate");
    expect(strategyFor(at("/brand/symbol-white.svg"), fetch, ORIGIN)).toBe("stale-while-revalidate");
  });

  it("never touches another origin, a write, or anything it wasn't told about", () => {
    expect(strategyFor(new URL("https://brainstormserver.nosfabrica.com/user/self"), fetch, ORIGIN)).toBeNull();
    expect(strategyFor(at("/assets/index-abc.js"), { method: "POST", mode: "cors" }, ORIGIN)).toBeNull();
    expect(strategyFor(at("/something.json"), fetch, ORIGIN)).toBeNull();
  });
});
