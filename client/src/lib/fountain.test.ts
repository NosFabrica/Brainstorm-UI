import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFountainItem, fountainRef, parseFountainPage, __resetFountainCache } from "./fountain";

// Fountain's episode page, as probed 2026-09-04: everything a card needs is in
// Open Graph, and fountain.fm answers the browser with an open CORS header.
const EPISODE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Radio Detox • Right Said Fred &amp; Friends • Listen on Fountain"/>
<meta property="og:description" content="The conversation between Host Heather Larson and Right Said Fred covers the journey of independent artists."/>
<meta property="og:site_name" content="Fountain: Podcasts &amp; Music"/>
<meta property="og:image" content="https://hosting-media.riverside.com/media/podcasts/ba9f/logos/b64d.jpeg"/>
<meta property="og:audio" content="https://api.riverside.com/hosting-analytics/media/0abf/eyJlc.mp3"/>
<title>Radio Detox • Right Said Fred &amp; Friends • Listen on Fountain</title></head><body></body></html>`;
const TRACK_HTML = `<html><head>
<meta property="og:title" content="Joe Martin • Alone In Valentine - single • Listen on Fountain"/>
<meta property="og:description" content="Discover millions of podcasts and emerging artists worth supporting. Powered by RSS, Lightning and Nostr."/>
<meta property="og:image" content="https://d12wklypp119aj.cloudfront.net/image/980f.jpg"/>
<meta property="og:audio" content="https://op3.dev/e,pg=265d/https://d12wklypp119aj.cloudfront.net/track/f7d4.mp3"/>
</head></html>`;

describe("fountainRef", () => {
  it("recognises episodes, tracks, shows and live rooms by id", () => {
    expect(fountainRef("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3")).toEqual({ kind: "episode", id: "T0iRUdk8nBSfUEPLLcJ3" });
    expect(fountainRef("https://fountain.fm/track/q6N8QzTSTDjL2L98FL2R?t=12")).toEqual({ kind: "track", id: "q6N8QzTSTDjL2L98FL2R" });
    expect(fountainRef("https://fountain.fm/show/abc")).toEqual({ kind: "show", id: "abc" });
    expect(fountainRef("https://fountain.fm/live/JGjRiczl3CEWDJUr1jb7")).toEqual({ kind: "live", id: "JGjRiczl3CEWDJUr1jb7" });
    expect(fountainRef("https://wavlake.com/track/x")).toBeNull();
  });
});

describe("parseFountainPage — the card's facts from Open Graph", () => {
  it("splits show from episode title, decodes entities, keeps the description and the mp3", () => {
    const item = parseFountainPage(EPISODE_HTML, "https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3");
    expect(item).toMatchObject({
      kind: "episode",
      show: "Radio Detox",
      title: "Right Said Fred & Friends",
      description: "The conversation between Host Heather Larson and Right Said Fred covers the journey of independent artists.",
      image: "https://hosting-media.riverside.com/media/podcasts/ba9f/logos/b64d.jpeg",
      audio: "https://api.riverside.com/hosting-analytics/media/0abf/eyJlc.mp3",
      url: "https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3",
    });
  });

  it("reads a track as artist and title, and drops Fountain's boilerplate description", () => {
    const item = parseFountainPage(TRACK_HTML, "https://fountain.fm/track/q6N8QzTSTDjL2L98FL2R");
    expect(item).toMatchObject({ kind: "track", show: "Joe Martin", title: "Alone In Valentine - single", description: null });
  });

  it("is not an item without something to play", () => {
    expect(parseFountainPage('<html><head><meta property="og:title" content="x"/></head></html>', "https://fountain.fm/episode/x")).toBeNull();
  });
});

describe("fetchFountainItem", () => {
  beforeEach(() => __resetFountainCache());

  it("reads the page once and remembers it", async () => {
    const fetchMock = vi.fn(async () => new Response(EPISODE_HTML, { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    const a = await fetchFountainItem("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3");
    const b = await fetchFountainItem("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3");
    expect(a?.title).toBe("Right Said Fred & Friends");
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers null, quietly, when Fountain cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("blocked"); }));
    expect(await fetchFountainItem("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3")).toBeNull();
  });
});
