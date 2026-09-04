// @vitest-environment jsdom
/**
 * The composed Everything page — Google's anatomy for real: parallel
 * sections, each ranked by what matters for that section. The seam is
 * mocked per-stream so tests drive sections independently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
const hitOf = (event: NostrEvent, name = "someone") => ({
  event,
  author: author(event.pubkey, name),
  rank: null,
});

const sectionCall = (tab: string) => calls.find((c) => c.params.tab === tab)!;

beforeEach(() => {
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
      ],
      eose: true,
      timeMs: 100,
    });
    const strip = await screen.findByTestId("serp-top-stories");
    const cards = [...strip.querySelectorAll('[data-testid^="top-story-"]')].map((c) => c.getAttribute("data-testid"));
    expect(cards).toEqual(["top-story-n1", "top-story-n3"]);
    const card = screen.getByTestId("top-story-n1");
    expect(card).toHaveTextContent("Liverpool complete the record signing of Bradley Barcola 1");
    expect(card).toHaveTextContent("liverpoolecho.co.uk");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/photo-1.jpg");
    // The headline goes to the article; the card sits in the Latest section.
    expect(card.querySelector('a[href="https://www.liverpoolecho.co.uk/story-1"]')).not.toBeNull();
    // Strip items don't repeat as rows; the plain note still does.
    expect(screen.queryByTestId("serp-row-n1")).toBeNull();
    expect(screen.getByTestId("serp-row-n2")).toBeInTheDocument();
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
