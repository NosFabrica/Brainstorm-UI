// @vitest-environment jsdom
/**
 * The composed Everything page — Google's anatomy for real: parallel
 * sections, each ranked by what matters for that section. The seam is
 * mocked per-stream so tests drive sections independently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot, SearchParams } from "@/services/search";

interface StreamCall {
  query: string;
  params: SearchParams;
  emit: (s: Partial<SearchSnapshot>) => void;
  cancelled: boolean;
}
let calls: StreamCall[] = [];

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (query: string, params: SearchParams, onSnapshot: (s: SearchSnapshot) => void) => {
      const call: StreamCall = {
        query,
        params,
        emit: (partial) =>
          onSnapshot({ hits: [], eose: false, timeMs: null, error: null, ...partial }),
        cancelled: false,
      };
      calls.push(call);
      return () => {
        call.cancelled = true;
      };
    },
    suggestProfiles: () => Promise.resolve([]),
  };
});
const scoreOfMock = vi.fn<(pk: string) => number | null | undefined>(() => 0.8);
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => scoreOfMock(pk),
}));
// The media lightbox — faked so tiles can prove a tap opens the MEDIA, not the post.
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => openLightboxMock }));

import { ComposedResults } from "./ComposedResults";

function ev(id: string, kind: number, pubkey: string, content = "", tags: string[][] = [], created_at = 1_760_000_000): NostrEvent {
  return { id, kind, pubkey, tags, content, created_at, sig: "s" } as NostrEvent;
}
const author = (pubkey: string, name: string) => ({
  pubkey,
  npub: `npub1${name}`,
  name,
  wotRank: null,
  wotFollowers: null,
});
// Wavlake as the second music source: nothing unless a test says otherwise.
const wavlakeSearchMock = vi.fn<(term: string) => Promise<import("@/lib/wavlake").WavlakeSong[]>>(() => Promise.resolve([]));
vi.mock("@/lib/wavlake", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wavlake")>()),
  searchWavlakeTracks: (term: string) => wavlakeSearchMock(term),
}));

const hitOf = (event: NostrEvent, name = "someone") => ({
  event,
  author: author(event.pubkey, name),
  rank: null,
});

// The link-metadata proxy (RELAY-ASKS #7): unpictured stories ask it for
// the article's image. Silent (null) unless a test says otherwise.
const unfurlMock = vi.fn<(url: string) => Promise<{ title: string | null; description: string | null; image: string | null; siteName: string | null } | null>>(() => Promise.resolve(null));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: (url: string) => unfurlMock(url) }));

const sectionCall = (tab: string) => calls.find((c) => c.params.tab === tab)!;

beforeEach(() => {
  // clearAllMocks keeps implementations; Wavlake must fall silent between tests.
  wavlakeSearchMock.mockResolvedValue([]);
  calls = [];
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/?q=liverpool");
});

// Google's front page leads its news with a Top stories strip — image on
// top, source, headline, age — and its Videos and Images with tiles, not
// text rows. Latest and Media earn the same: news-shaped notes with a
// picture become the strip, media hits become a tile grid.
describe("ComposedResults — media-rich sections", () => {
  const NEWS = (n: number) =>
    `Liverpool complete the record signing of Bradley Barcola ${n}\nhttps://www.liverpoolecho.co.uk/story-${n}\nSummary ${n}. https://cdn.example/photo-${n}.jpg`;

  it("leads Latest with a Top stories strip of news-shaped notes, the rest as rows", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("notes").emit({
      hits: [
        hitOf(ev("n1", 1, "1".repeat(64), NEWS(1)), "Echo"),
        hitOf(ev("n2", 1, "2".repeat(64), "Just a plain note about Liverpool"), "fan"),
        hitOf(ev("n3", 1, "3".repeat(64), NEWS(3)), "Guardian"),
        hitOf(ev("n6", 1, "6".repeat(64), NEWS(6)), "Times"),
      ],
      eose: true,
      timeMs: 100,
    });
    const strip = await screen.findByTestId("serp-top-stories");
    const cards = [...strip.querySelectorAll('[data-testid^="top-story-"]')].map((c) => c.getAttribute("data-testid"));
    expect(cards).toEqual(["top-story-n1", "top-story-n3", "top-story-n6"]);
    const card = screen.getByTestId("top-story-n1");
    expect(card).toHaveTextContent("Liverpool complete the record signing of Bradley Barcola 1");
    expect(card).toHaveTextContent("liverpoolecho.co.uk");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/photo-1.jpg");
    // The headline goes to the article; the card sits in the Latest section.
    const headline = card.querySelector('a[href="https://www.liverpoolecho.co.uk/story-1"]');
    expect(headline).not.toBeNull();
    // Outlets should see Brainstorm in their analytics: noopener, no noreferrer.
    expect(headline?.getAttribute("rel")).toBe("noopener");
    // Strip items don't repeat as rows; the plain note still does.
    expect(screen.queryByTestId("serp-row-n1")).toBeNull();
    expect(screen.getByTestId("serp-row-n2")).toBeInTheDocument();
  });

  // Benjamin: "when Latest is showing there should always be 3" — a strip of
  // two reads as an accident. Pictured news leads; when that runs short the
  // strip fills to three with unpictured news, then with pictured notes.
  it("fills the strip to three: pictured news, then unpictured news, then pictured notes", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const NO_PIC = "Liverpool confirm the Barcola fee\nhttps://www.theguardian.com/story-4\nSummary 4.";
    sectionCall("notes").emit({
      hits: [
        hitOf(ev("n1", 1, "1".repeat(64), NEWS(1)), "Echo"),
        hitOf(ev("n2", 1, "2".repeat(64), "Just a plain note about Liverpool"), "fan"),
        hitOf(ev("n4", 1, "4".repeat(64), NO_PIC), "Guardian"),
        hitOf(ev("n5", 1, "5".repeat(64), "Anfield tonight https://cdn.example/anfield.jpg"), "fan2"),
      ],
      eose: true,
      timeMs: 100,
    });
    const strip = await screen.findByTestId("serp-top-stories");
    const cards = [...strip.querySelectorAll('[data-testid^="top-story-"]')].map((c) => c.getAttribute("data-testid"));
    expect(cards).toEqual(["top-story-n1", "top-story-n4", "top-story-n5"]);
    // The unpictured story still names its source; the pictured note's first line is its headline.
    expect(screen.getByTestId("top-story-n4")).toHaveTextContent("theguardian.com");
    expect(screen.getByTestId("top-story-n4").querySelector('[data-testid="story-image"]')).toBeNull();
    expect(screen.getByTestId("top-story-n5")).toHaveTextContent("Anfield tonight");
    expect(screen.getByTestId("top-story-n5").querySelector('[data-testid="story-image"]')?.getAttribute("src")).toBe("https://cdn.example/anfield.jpg");
    // Strip items don't repeat as rows.
    expect(screen.queryByTestId("serp-row-n5")).toBeNull();
    expect(screen.getByTestId("serp-row-n2")).toBeInTheDocument();
  });

  // Benjamin, over a placeholder card: "make sure the images are showing
  // correctly for these". News bots post headline + link, no picture — the
  // article has one. An unpictured story asks the link-metadata proxy and
  // shows the article's image when it answers.
  it("an unpictured story takes its image from the link's metadata", async () => {
    unfurlMock.mockImplementation((url) =>
      Promise.resolve(url.includes("theguardian") ? { title: null, description: null, image: "https://i.guim.co.uk/barcola.jpg", siteName: null } : null),
    );
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const NO_PIC = "Liverpool confirm the Barcola fee\nhttps://www.theguardian.com/story-4\nSummary 4.";
    sectionCall("notes").emit({
      hits: [hitOf(ev("n1", 1, "1".repeat(64), NEWS(1)), "Echo"), hitOf(ev("n4", 1, "4".repeat(64), NO_PIC), "Guardian"), hitOf(ev("n3", 1, "3".repeat(64), NEWS(3)), "Times")],
      eose: true,
      timeMs: 100,
    });
    const card = await screen.findByTestId("top-story-n4");
    await vi.waitFor(() => expect(card.querySelector('[data-testid="story-image"]')?.getAttribute("src")).toBe("https://i.guim.co.uk/barcola.jpg"));
    expect(unfurlMock).toHaveBeenCalledWith("https://www.theguardian.com/story-4");
    // A pictured story never asks.
    expect(unfurlMock).not.toHaveBeenCalledWith("https://www.liverpoolecho.co.uk/story-1");
  });

  // Benjamin, over three placeholder cards: "can we show the thumbnails for
  // those videos and articles in Latest?" Two of the three need no proxy at
  // all: a YouTube link has a thumbnail at a known address, and a link that
  // IS a video file can show its own first frame.
  it("YouTube links wear YouTube's thumbnail; video-file links show their first frame", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const YT = "US Downplays Iran Attacks on Bases in Kuwait and the UAE\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\nRicemoon covers the week.";
    const MP4 = "NEW - Minister says teams of professionals worked for a year\nhttps://blossom.primal.net/9714.mp4\nFLASH";
    sectionCall("notes").emit({
      hits: [hitOf(ev("y1", 1, "1".repeat(64), YT), "Ricemoon"), hitOf(ev("v1", 1, "2".repeat(64), MP4), "FLASH"), hitOf(ev("n3", 1, "3".repeat(64), NEWS(3)), "Echo")],
      eose: true,
      timeMs: 100,
    });
    const yt = await screen.findByTestId("top-story-y1");
    expect(yt.querySelector('[data-testid="story-image"]')?.getAttribute("src")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    const vid = screen.getByTestId("top-story-v1");
    expect(vid.querySelector('[data-testid="story-video"]')?.getAttribute("src")).toBe("https://blossom.primal.net/9714.mp4#t=0.1");
    expect(vid.querySelector('[data-testid="story-placeholder"]')).toBeNull();
  });

  it("one or two eligible stories make no strip — three or nothing", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("notes").emit({
      hits: [hitOf(ev("n1", 1, "1".repeat(64), NEWS(1)), "Echo"), hitOf(ev("n3", 1, "3".repeat(64), NEWS(3)), "Guardian")],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("serp-row-n1");
    expect(screen.queryByTestId("serp-top-stories")).toBeNull();
    expect(screen.getByTestId("serp-row-n3")).toBeInTheDocument();
  });

  // Benjamin: "for the Articles section make the images bigger, like bento
  // style, so it feels like a nice break-up within the feed." One lead
  // article with a big picture, compact picture tiles beside it, then any
  // overflow as rows. Articles without a picture get the outlet-style
  // placeholder rather than a broken frame.
  it("lays Articles out as a bento: a lead with a big image, tiles beside it, rows for the rest", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const article = (id: string, pk: string, title: string, image?: string) =>
      hitOf(
        ev(id, 30023, pk, "Long-form body", [["d", id], ["title", title], ["summary", `Summary of ${title}`], ...(image ? [["image", image]] : [])]),
        `author-${id}`,
      );
    sectionCall("articles").emit({
      hits: [
        article("a1", "1".repeat(64), "Anfield through the ages", "https://cdn.example/anfield.jpg"),
        article("a2", "2".repeat(64), "The Kop's songbook", "https://cdn.example/kop.jpg"),
        article("a3", "3".repeat(64), "Scouse cuisine, ranked"),
        article("a4", "4".repeat(64), "Ferry across the Mersey", "https://cdn.example/ferry.jpg"),
        article("a5", "5".repeat(64), "Fifth piece, no room in the grid", "https://cdn.example/five.jpg"),
      ],
      eose: true,
      timeMs: 100,
    });
    const section = await screen.findByTestId("serp-section-articles");
    const lead = within(section).getByTestId("article-lead-a1");
    expect(lead).toHaveTextContent("Anfield through the ages");
    expect(lead).toHaveTextContent("Summary of Anfield through the ages");
    expect(lead).toHaveTextContent("author-a1");
    expect(lead.querySelector('[data-testid="article-image"]')?.getAttribute("src")).toBe("https://cdn.example/anfield.jpg");
    const tiles = [...section.querySelectorAll('[data-testid^="article-tile-"]')].map((t) => t.getAttribute("data-testid"));
    expect(tiles).toEqual(["article-tile-a2", "article-tile-a3", "article-tile-a4"]);
    // No picture → placeholder, never a broken frame.
    expect(within(section).getByTestId("article-tile-a3").querySelector('[data-testid="article-image"]')).toBeNull();
    expect(within(section).getByTestId("article-tile-a3").querySelector('[data-testid="article-placeholder"]')).not.toBeNull();
    // The fifth stays a row beneath the grid.
    expect(within(section).getByTestId("serp-row-a5")).toBeInTheDocument();
    expect(within(section).queryByTestId("serp-row-a1")).toBeNull();
    // The lead opens the article.
    fireEvent.click(lead);
    expect(window.location.pathname).toMatch(/^\/e\/nevent1/);
  });

  it("no pictured news, no strip — Latest stays rows", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("notes").emit({ hits: [hitOf(ev("n2", 1, "2".repeat(64), "Just a plain note about Liverpool"))], eose: true, timeMs: 100 });
    await screen.findByTestId("serp-row-n2");
    expect(screen.queryByTestId("serp-top-stories")).toBeNull();
  });

  it("renders Media as a tile grid: photos as images, videos with a play badge, captions with author and age", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("media").emit({
      hits: [
        hitOf(ev("1".repeat(64), 20, "1".repeat(64), "Anfield at night", [["imeta", "url https://cdn.example/anfield.jpg", "m image/jpeg"]]), "Sports Central"),
        hitOf(ev("2".repeat(64), 21, "2".repeat(64), "Goal!", [["imeta", "url https://cdn.example/goal.mp4", "m video/mp4", "image https://cdn.example/goal-poster.jpg"]]), "AFP"),
      ],
      eose: true,
      timeMs: 100,
    });
    const grid = await screen.findByTestId("serp-media-grid");
    expect(grid.className).toMatch(/grid/);
    const photo = screen.getByTestId(`media-tile-${"1".repeat(64)}`);
    expect(photo.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/anfield.jpg");
    expect(photo).toHaveTextContent("Sports Central");
    expect(photo.querySelector('[data-testid="media-tile-play"]')).toBeNull();
    const video = screen.getByTestId(`media-tile-${"2".repeat(64)}`);
    expect(video.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/goal-poster.jpg");
    expect(video.querySelector('[data-testid="media-tile-play"]')).not.toBeNull();
    // Benjamin: a tap on the picture or the play badge opens THE MEDIA, full
    // view, playing — X / Instagram / TikTok — never the post. The caption
    // beneath is the way to the post.
    fireEvent.click(photo.querySelector('[data-testid="media-tile-media"]')!);
    // …and the full view knows whose it is and where the post lives.
    expect(openLightboxMock).toHaveBeenLastCalledWith(
      [{ url: "https://cdn.example/anfield.jpg", kind: "image" }],
      0,
      expect.objectContaining({ author: expect.objectContaining({ name: "Sports Central", npub: "npub1Sports Central" }), postHref: expect.stringMatching(/^\/e\/nevent1/) }),
    );
    expect(window.location.pathname).toBe("/");
    fireEvent.click(video.querySelector('[data-testid="media-tile-play"]')!);
    expect(openLightboxMock).toHaveBeenLastCalledWith(
      [{ url: "https://cdn.example/goal.mp4", kind: "video", poster: "https://cdn.example/goal-poster.jpg" }],
      0,
      expect.objectContaining({ author: expect.objectContaining({ name: "AFP" }) }),
    );
    expect(window.location.pathname).toBe("/");
    fireEvent.click(photo.querySelector('[data-testid="media-tile-caption"]')!);
    expect(window.location.pathname).toMatch(/^\/e\/nevent1/);
    // No text rows for media any more.
    expect(screen.queryByTestId(`serp-row-${"1".repeat(64)}`)).toBeNull();
  });
});

describe("ComposedResults", () => {
  it("fires the five purpose-ranked section streams in parallel", () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const tabs = calls.map((c) => c.params.tab);
    // Happening draws from BOTH calendar events and live streams now that
    // they are separate verticals.
    expect(tabs).toEqual(expect.arrayContaining(["people", "notes", "articles", "events", "live", "media"]));
    // Benjamin's call: every CONTENT section leads with what's fresh —
    // scattered timestamps read as random. People stays trust-ranked
    // (no timestamps there to scatter).
    for (const tab of ["notes", "articles", "events", "live", "media"]) {
      expect(sectionCall(tab).query).toBe("liverpool sort:recent");
    }
    expect(sectionCall("people").query).toBe("liverpool");
    expect(sectionCall("people").params.limit).toBeLessThanOrEqual(10);
  });

  // The home feed: NO query at all → the composed page becomes "what's
  // happening on Nostr right now", every content section fresh-first.
  it("streams the whole network when the query is empty (the home feed)", async () => {
    window.history.replaceState({}, "", "/");
    render(<ComposedResults query="" pov="nosfabrica" onTabChange={vi.fn()} />);
    expect(sectionCall("notes").query).toBe("sort:recent");
    expect(sectionCall("people").query).toBe("");

    sectionCall("notes").emit({
      hits: [hitOf(ev("n1", 1, "a".repeat(64), "gm from the whole network"), "someone")],
      eose: true,
      timeMs: 400,
    });
    expect(await screen.findByTestId("serp-section-latest")).toHaveTextContent("gm from the whole network");
  });

  it("renders sections as their streams answer, with More → switching tabs", async () => {
    const onTabChange = vi.fn();
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={onTabChange} />);

    sectionCall("notes").emit({
      hits: [hitOf(ev("n1", 1, "a".repeat(64), "Liverpool agree deal"), "reporter")],
      eose: true,
      timeMs: 300,
    });
    expect(await screen.findByTestId("serp-section-latest")).toHaveTextContent("Liverpool agree deal");

    fireEvent.click(screen.getByTestId("serp-more-latest"));
    expect(onTabChange).toHaveBeenCalledWith("notes");
    // Sections with nothing to show render nothing.
    expect(screen.queryByTestId("serp-section-media")).toBeNull();
  });

  // Review catch: Happening merged the events stream by publish order, so a
  // recently POSTED past meetup could lead the page. Happening means now or
  // next: upcoming calendar events soonest-first, then the live streams.
  it("Happening shows upcoming events soonest-first, drops past ones, then live streams", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const nowSec = Math.floor(Date.now() / 1000);
    const cal = (id: string, pk: string, title: string, start: number) =>
      hitOf(ev(id, 31923, pk, "", [["d", id], ["title", title], ["start", String(start)]]), "club");
    sectionCall("events").emit({
      hits: [
        cal("far", "1".repeat(64), "Liverpool Bitcoin Conference", nowSec + 30 * 86_400),
        cal("gone", "2".repeat(64), "Liverpool Meetup (July)", nowSec - 30 * 86_400),
        cal("soon", "3".repeat(64), "Liverpool Nostr Social", nowSec + 2 * 86_400),
      ],
      eose: true,
      timeMs: 100,
    });
    sectionCall("live").emit({
      hits: [hitOf(ev("stream", 30311, "4".repeat(64), "", [["d", "s"], ["title", "Anfield Radio"], ["status", "live"]]), "radio")],
      eose: true,
      timeMs: 100,
    });
    const section = await screen.findByTestId("serp-section-happening");
    const rows = [...section.querySelectorAll('[data-testid^="serp-row-"]')].map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["serp-row-soon", "serp-row-far", "serp-row-stream"]);
  });

  it("collapses the Happening section's recurring events behind a +N chip", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const orange = "6".repeat(64);
    sectionCall("live").emit({
      hits: [
        hitOf(ev("m1", 31923, orange, "", [["title", "Bitcoin Liverpool Meet"]]), "club"),
        hitOf(ev("m2", 31923, orange, "", [["title", "Bitcoin Liverpool Meetup"]]), "club"),
        hitOf(ev("m3", 31923, orange, "", [["title", "Bitcoin Liverpool Meetup"]]), "club"),
      ],
      eose: true,
      timeMs: 200,
    });
    const section = await screen.findByTestId("serp-section-happening");
    expect(section.querySelectorAll("[data-testid^='serp-row-']")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("serp-expand-m1"));
    expect(section.querySelectorAll("[data-testid^='serp-row-']")).toHaveLength(3);
  });

  // Music discovery through search: a query that matches native tracks gets a
  // Listen row — Google's songs carousel — playable in place. The kind is
  // abused for game state and ad-skip data, so only real tracks make the row.
  it("adds a Listen row of playable tracks when the query matches songs, and asks the Music tab for more", async () => {
    const onTabChange = vi.fn();
    render(<ComposedResults query="jazz" pov="nosfabrica" onTabChange={onTabChange} />);
    const nova = "d".repeat(64);
    const track = (id: string, title: string) =>
      hitOf(ev(id, 31337, nova, "", [["d", id], ["title", title], ["artist", "NOVA"], ["media", `https://renaissancemachine.ai/music/${id}.mp3`], ["image", `https://renaissancemachine.ai/${id}.jpg`]]), "NOVA");
    sectionCall("music").emit({
      hits: [
        track("s1", "Old Carbon"),
        track("s2", "Duende"),
        hitOf(ev("junk", 31337, "e".repeat(64), '{"status":"complete","ads":[]}', [["d", "3244b53c"], ["t", "antennapod-adskip"]]), null),
      ],
      eose: true,
      timeMs: 120,
    });

    const section = await screen.findByTestId("serp-section-listen");
    expect(section).toHaveTextContent("Old Carbon");
    expect(section).toHaveTextContent("Duende");
    expect(within(section).getAllByTestId("track-play")).toHaveLength(2);
    expect(section).not.toHaveTextContent("antennapod");

    fireEvent.click(within(section).getByTestId("serp-more-listen"));
    expect(onTabChange).toHaveBeenCalledWith("music");
  });

  it("the Listen row carries Wavlake's songs for the words when Nostr has none, labelled", async () => {
    wavlakeSearchMock.mockResolvedValue([
      { id: "wavlake:04cead49", title: "Two Ships", artist: "Ainsley Costello", audio: "https://cdn/two-ships.mp3", durationSec: 217, url: "https://wavlake.com/track/04cead49", source: "wavlake", artistNpub: "" },
    ]);
    const onTabChange = vi.fn();
    render(<ComposedResults query="Ainsley Costello" pov="nosfabrica" onTabChange={onTabChange} />);
    sectionCall("music").emit({ hits: [], eose: true, timeMs: 80 });

    const section = await screen.findByTestId("serp-section-listen");
    expect(wavlakeSearchMock).toHaveBeenCalledWith("Ainsley Costello");
    const card = within(section).getByTestId("wavlake-song-wavlake:04cead49");
    expect(card).toHaveTextContent("Two Ships");
    expect(card).toHaveTextContent("Wavlake");
    expect(within(card).getByTestId("track-play")).toBeInTheDocument();
    fireEvent.click(within(section).getByTestId("serp-more-listen"));
    expect(onTabChange).toHaveBeenCalledWith("music");
  });

  it("shows no Listen row when nothing on the relay is a song", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("music").emit({ hits: [hitOf(ev("junk", 31337, "e".repeat(64), "tester", [["d", "x"]]), null)], eose: true, timeMs: 90 });
    sectionCall("notes").emit({ hits: [hitOf(ev("n1", 1, "b".repeat(64), "Liverpool are top of the league"), "fan")], eose: true, timeMs: 100 });
    await screen.findByTestId("serp-section-latest");
    expect(screen.queryByTestId("serp-section-listen")).toBeNull();
  });

  // Benjamin, over "Rabbit Hole Recap": the Media section showed one stranger's
  // clip while the show's own episodes went unshown. When the query is a
  // person, their own media leads the section — latest first.
  it("the Media section leads with the person's own media, newest first, even when the media stream finds nothing", async () => {
    const NOW = Math.floor(Date.now() / 1000);
    const RHR = "b".repeat(64);
    const who = { pubkey: RHR, npub: "npub1rhr", name: "RABBIT HOLE RECAP", wotRank: 0.9, wotFollowers: 7400 };
    const episode = (id: string, n: number, age: number) =>
      ({ event: ev(id, 1, RHR, `RHR ${n}: EPISODE WITH nostr:nprofile1qqsabc AND nostr:nprofile1qqsdef https://blossom.primal.net/${id}.mp4`, [["imeta", `url https://blossom.primal.net/${id}.mp4`, "m video/mp4", `image https://blossom.primal.net/${id}.jpg`]], NOW - age), author: who, rank: null });
    render(
      <ComposedResults
        query="Rabbit Hole Recap"
        pov="nosfabrica"
        onTabChange={vi.fn()}
        personMedia={[
          episode("ep414", 414, 50 * 86_400),
          episode("ep420", 420, 7 * 86_400),
          episode("ep421", 421, 86_400),
          // the show reposted 419 — one tile, the newer
          episode("ep419b", 419, 13 * 86_400),
          episode("ep419", 419, 14 * 86_400),
          episode("ep418", 418, 21 * 86_400),
          episode("ep417", 417, 28 * 86_400),
          episode("ep416", 416, 35 * 86_400),
          episode("ep415", 415, 42 * 86_400),
        ]}
      />,
    );
    sectionCall("media").emit({ hits: [], eose: true, timeMs: 90 });

    const grid = await screen.findByTestId("serp-media-grid");
    const ids = [...grid.querySelectorAll(":scope > [data-testid^='media-tile-']")].map((n) => n.getAttribute("data-testid"));
    // Newest first, one per episode, six at most — the Media tab has the rest.
    expect(ids).toEqual(["media-tile-ep421", "media-tile-ep420", "media-tile-ep419b", "media-tile-ep418", "media-tile-ep417", "media-tile-ep416"]);
    expect(within(grid).getAllByTestId("media-tile-play")).toHaveLength(6);
    // Captions are the words, not the raw nostr: references.
    expect(grid).toHaveTextContent("RHR 421: EPISODE");
    expect(grid).not.toHaveTextContent(/EPISODE WITH/);
    expect(grid).not.toHaveTextContent(/nprofile1/);
  });

  // The Shop on Everything: when the words match things for sale, a row of
  // priced, photographed cards — at most four, two per seller — and More → Shop.
  it("adds a Shop row of sellable listings when the words match products, two per seller at most", async () => {
    const onTabChange = vi.fn();
    render(<ComposedResults query="maglia" pov="nosfabrica" onTabChange={onTabChange} />);
    const barattolo = "9".repeat(64);
    const other = "8".repeat(64);
    const listing = (id: string, seller: string, title: string, extra: string[][] = []) =>
      hitOf(ev(id, 30402, seller, title, [["d", id], ["title", title], ["price", "14100", "sats"], ["image", `https://img/${id}.jpg`], ...extra]), seller === barattolo ? "Barattolo" : "Altro");
    sectionCall("shop").emit({
      hits: [
        listing("m1", barattolo, "Maglia in kashmir"),
        listing("m2", barattolo, "Maglia mezza stagione"),
        listing("m3", barattolo, "Maglia a righe"),
        listing("m4", other, "Maglia vintage"),
        listing("sold", other, "Maglia venduta", [["status", "sold"]]),
      ],
      eose: true,
      timeMs: 120,
    });

    const section = await screen.findByTestId("serp-section-shop");
    const ids = [...section.querySelectorAll("[data-testid^='listing-card-']")].map((n) => n.getAttribute("data-testid"));
    expect(ids).toEqual(["listing-card-m1", "listing-card-m2", "listing-card-m4"]);
    expect(section).toHaveTextContent("14,100 sats");
    fireEvent.click(within(section).getByTestId("serp-more-shop"));
    expect(onTabChange).toHaveBeenCalledWith("shop");
  });

  it("shows no Shop row when nothing for sale matches", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("shop").emit({ hits: [hitOf(ev("sold", 30402, "8".repeat(64), "x", [["title", "x"], ["price", "1", "USD"], ["status", "sold"]]), "Altro")], eose: true, timeMs: 90 });
    sectionCall("notes").emit({ hits: [hitOf(ev("n1", 1, "b".repeat(64), "Liverpool are top of the league"), "fan")], eose: true, timeMs: 100 });
    await screen.findByTestId("serp-section-latest");
    expect(screen.queryByTestId("serp-section-shop")).toBeNull();
  });

  it("bolds the query terms inside snippets", async () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("notes").emit({
      hits: [hitOf(ev("n1", 1, "b".repeat(64), "Liverpool are top of the league"), "fan")],
      eose: true,
      timeMs: 100,
    });
    const marks = (await screen.findByTestId("serp-section-latest")).querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toContain("Liverpool");
  });

  it("pins previously-visited people first, with a quiet Visited hint", async () => {
    const visited = "f".repeat(64);
    const fresh = "a".repeat(64);
    const { pushRecentProfile } = await import("@/lib/recentSearches");
    pushRecentProfile({ pubkey: visited, npub: "npub1seen", label: "seen before" });

    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    sectionCall("people").emit({
      hits: [
        hitOf(ev("p1", 0, fresh, JSON.stringify({ name: "newface" })), "newface"),
        hitOf(ev("p2", 0, visited, JSON.stringify({ name: "seen before" })), "seen before"),
      ],
      eose: true,
      timeMs: 100,
    });
    const strip = await screen.findByTestId("serp-section-people");
    const names = [...strip.querySelectorAll("[data-testid^='serp-person-']")].map(
      (el) => el.getAttribute("data-testid"),
    );
    expect(names[0]).toBe(`serp-person-${visited.slice(0, 8)}`);
    expect(screen.getByTestId(`visited-${visited.slice(0, 8)}`)).toBeInTheDocument();
  });
});
