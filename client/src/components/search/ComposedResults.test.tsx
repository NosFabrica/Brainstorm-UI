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

describe("ComposedResults", () => {
  it("fires the five purpose-ranked section streams in parallel", () => {
    render(<ComposedResults query="liverpool" pov="nosfabrica" onTabChange={vi.fn()} />);
    const tabs = calls.map((c) => c.params.tab);
    expect(tabs).toEqual(expect.arrayContaining(["people", "notes", "articles", "live", "media"]));
    // Benjamin's call: every CONTENT section leads with what's fresh —
    // scattered timestamps read as random. People stays trust-ranked
    // (no timestamps there to scatter).
    for (const tab of ["notes", "articles", "live", "media"]) {
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

  it("a crowded people strip cycles with arrows", async () => {
    render(<ComposedResults query="nostr" pov="nosfabrica" onTabChange={() => {}} />);
    const peopleCall = calls.find((c) => c.params.tab === "people")!;
    peopleCall.emit({
      hits: Array.from({ length: 8 }, (_, i) =>
        hitOf(ev(`p${i}`, 0, String(i).repeat(64).slice(0, 64), JSON.stringify({ name: `person${i}` })), `person${i}`),
      ),
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("people-strip-next");
    const strip = screen.getByTestId("people-strip");
    const scrollBy = vi.fn();
    (strip as HTMLElement & { scrollBy: typeof scrollBy }).scrollBy = scrollBy;
    fireEvent.click(screen.getByTestId("people-strip-next"));
    expect(scrollBy).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("people-strip-prev"));
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it("a short people strip needs no arrows", async () => {
    render(<ComposedResults query="nostr" pov="nosfabrica" onTabChange={() => {}} />);
    const peopleCall = calls.find((c) => c.params.tab === "people")!;
    peopleCall.emit({
      hits: [hitOf(ev("p1", 0, "1".repeat(64), JSON.stringify({ name: "solo" })), "solo")],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("people-strip");
    expect(screen.queryByTestId("people-strip-next")).toBeNull();
  });
});
