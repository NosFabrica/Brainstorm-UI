// @vitest-environment node
/**
 * The Media tab's two chips that change what is asked. A chosen chip is one
 * token in the query, so the page's URL (`q`) is the whole of its state: a
 * link reproduces it, and the box shows it as a pill.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { VIDEO_KINDS } from "./nip71";
import { parseQuery } from "./searchQuery";
import {
  VIDEO_FACET_KINDS,
  isClassicVinesTopic,
  mediaFacetOf,
  mediaNarrowingOf,
  withMediaFacet,
  withoutVineArchiveTag,
} from "./mediaFacet";

const npub = nip19.npubEncode("9".repeat(64));
/** What landing writes to the address bar and reads back from it. */
const throughUrl = (query: string) =>
  new URL(`https://brainstorm.world/?q=${encodeURIComponent(query)}&t=media`).searchParams.get("q") ?? "";

describe("the Videos facet", () => {
  it("asks the kinds lib/nip71 calls video, and no others", () => {
    expect([...VIDEO_FACET_KINDS].sort()).toEqual([...VIDEO_KINDS].sort());
  });

  it("is `kind:video`, the grammar's one word for the four video kinds", () => {
    expect(withMediaFacet("", "videos")).toBe("kind:video");
    expect(mediaFacetOf("kind:video")).toBe("videos");
    expect(parseQuery("kind:video").kinds).toEqual([...VIDEO_FACET_KINDS]);
  });

  it("the four kinds typed out are the same request, so the same chip", () => {
    expect(mediaFacetOf("kind:21 kind:22 kind:34235 kind:34236")).toBe("videos");
    expect(withMediaFacet("skate kind:21 kind:22 kind:34235 kind:34236", null)).toBe("skate");
  });

  it("keeps the words, the person and the panel's tokens beside it", () => {
    const q = withMediaFacet(`skate from:${npub} sort:recent`, "videos");
    expect(q).toBe(`skate from:${npub} sort:recent kind:video`);
    expect(mediaFacetOf(q)).toBe("videos");
  });

  it("round-trips through the URL", () => {
    const q = withMediaFacet("skate", "videos");
    expect(throughUrl(q)).toBe("skate kind:video");
    expect(mediaFacetOf(throughUrl(q))).toBe("videos");
    expect(withMediaFacet(throughUrl(q), null)).toBe("skate");
  });

  it("a hand-typed kind is the reader's own narrowing, not the chip", () => {
    expect(mediaFacetOf("kind:34236")).toBeNull();
    expect(mediaFacetOf("kind:video kind:20")).toBeNull();
    // Choosing the chip replaces it rather than stacking beside it.
    expect(withMediaFacet("kind:34236 skate", "videos")).toBe("skate kind:video");
  });

  it("taken off, leaves the rest of the query as it was", () => {
    expect(withMediaFacet("skate kind:video #fun", null)).toBe("skate #fun");
    expect(withMediaFacet("kind:video", null)).toBe("");
    // A kind that is not a video's was typed by hand, and stays.
    expect(withMediaFacet("kind:20 kind:video", null)).toBe("kind:20");
  });
});

describe("the Classic Vines facet", () => {
  it("is the archive's hashtag", () => {
    expect(withMediaFacet("", "vines")).toBe("#vine-archive");
    expect(mediaFacetOf("#vine-archive")).toBe("vines");
    expect(mediaFacetOf("#Vine-Archive")).toBe("vines");
  });

  it("keeps the words and the person beside it", () => {
    const q = withMediaFacet(`cats from:${npub}`, "vines");
    expect(q).toBe(`cats from:${npub} #vine-archive`);
    expect(mediaFacetOf(q)).toBe("vines");
  });

  it("round-trips through the URL", () => {
    const q = withMediaFacet("cats", "vines");
    expect(throughUrl(q)).toBe("cats #vine-archive");
    expect(mediaFacetOf(throughUrl(q))).toBe("vines");
    expect(withMediaFacet(throughUrl(q), null)).toBe("cats");
  });

  it("one chip at a time: choosing one takes the other off", () => {
    expect(withMediaFacet(withMediaFacet("cats", "videos"), "vines")).toBe("cats #vine-archive");
    expect(withMediaFacet(withMediaFacet("cats", "vines"), "videos")).toBe("cats kind:video");
  });

  it("another hashtag is not it", () => {
    expect(mediaFacetOf("#vine")).toBeNull();
    expect(mediaFacetOf("#vinearchive")).toBeNull();
    expect(mediaFacetOf("#bitcoin-art")).toBeNull();
  });

  it("the tag comes out of what the relay is asked, and nothing else does", () => {
    expect(withoutVineArchiveTag(`cats #vine-archive from:${npub} #funny`)).toBe(`cats from:${npub} #funny`);
    expect(withoutVineArchiveTag("#vine-archive")).toBe("");
  });
});

describe("`#vine-archive` typed alone", () => {
  it("is the Classic Vines search, not a topic", () => {
    expect(isClassicVinesTopic("#vine-archive")).toBe(true);
    expect(isClassicVinesTopic("  #Vine-Archive ")).toBe(true);
  });

  it("with anything beside it, or as any other tag, is not", () => {
    expect(isClassicVinesTopic("#vine-archive cats")).toBe(false);
    expect(isClassicVinesTopic("#vinearchive")).toBe(false);
    expect(isClassicVinesTopic("#bitcoin-art")).toBe(false);
    expect(isClassicVinesTopic("vine-archive")).toBe(false);
  });
});

// The relay is asked the narrowed question; whatever the page adds from elsewhere (the lead
// group of a named person's own media) has to pass the same one.
describe("mediaNarrowingOf — what a Media query narrows the tab to", () => {
  const event = (kind: number, tags: string[][] = []) => ({ kind, tags });
  const vine = event(34236, [["l", "vine-archive", "archive.divine.video"]]);

  it("is nothing for words, a person or a hashtag that is not the archive's", () => {
    expect(mediaNarrowingOf("")).toBeNull();
    expect(mediaNarrowingOf(`cats from:${npub} #funny sort:recent`)).toBeNull();
  });

  it("`kind:video` and the four kinds typed out are the video kinds", () => {
    for (const q of ["kind:video", "kind:21 kind:22 kind:34235 kind:34236"]) {
      const narrowing = mediaNarrowingOf(q)!;
      expect(narrowing.kinds).toEqual([21, 22, 34235, 34236]);
      expect([1, 20, 21, 22, 34235, 34236, 1063].filter((kind) => narrowing.has(event(kind)))).toEqual([
        21, 22, 34235, 34236,
      ]);
    }
  });

  it("a typed kind is that kind", () => {
    const narrowing = mediaNarrowingOf(`from:${npub} kind:20`)!;
    expect(narrowing.kinds).toEqual([20]);
    expect(narrowing.has(event(20))).toBe(true);
    expect(narrowing.has(event(34236))).toBe(false);
  });

  it("Classic Vines is kind 34236 carrying the archive's label", () => {
    const narrowing = mediaNarrowingOf("cats #vine-archive")!;
    expect(narrowing.kinds).toEqual([34236]);
    expect(narrowing.has(vine)).toBe(true);
    // A short Divine published itself, and a note that happens to wear the label, are not Vines.
    expect(narrowing.has(event(34236))).toBe(false);
    expect(narrowing.has(event(1, [["l", "vine-archive"]]))).toBe(false);
  });

  it("Classic Vines beside a typed kind no Vine is narrows to nothing", () => {
    const narrowing = mediaNarrowingOf("#vine-archive kind:21")!;
    expect(narrowing.kinds).toEqual([]);
    expect(narrowing.has(vine)).toBe(false);
    expect(mediaNarrowingOf("#vine-archive kind:video")!.has(vine)).toBe(true);
  });
});
