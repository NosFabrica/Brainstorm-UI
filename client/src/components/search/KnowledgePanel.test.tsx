// @vitest-environment jsdom
/**
 * One panel slot, two panel types: a strong PERSON match wins it; otherwise
 * a query with real hashtag activity earns the TOPIC panel — the entity
 * card for "liverpool" the way jack gets his.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchSnapshot, SearchParams } from "@/services/search";

const suggestMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
const nipPageMock = vi.fn<() => Promise<NostrEvent | null>>(() => Promise.resolve(null));
const personSetsMock = vi.fn<() => Promise<{ title: string; exporters: number }[]>>(() => Promise.resolve([]));
let streamCalls: { query: string; params: SearchParams; emit: (s: Partial<SearchSnapshot>) => void }[] = [];

vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    suggestProfiles: () => suggestMock(),
    fetchNipPage: (...args: unknown[]) => nipPageMock(...(args as [])),
    fetchPersonSets: (...args: unknown[]) => personSetsMock(...(args as [])),
    searchStream: (query: string, params: SearchParams, onSnapshot: (s: SearchSnapshot) => void) => {
      streamCalls.push({
        query,
        params,
        emit: (partial) => onSnapshot({ hits: [], eose: false, timeMs: null, error: null, ...partial }),
      });
      return () => {};
    },
  };
});
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));
type Endorsements = import("@/services/endorsements").AppEndorsements;
const endorsementsMock = vi.fn<(address: string | null, opts: unknown) => Endorsements | null>(() => null);
vi.mock("@/hooks/useAppEndorsements", () => ({
  useAppEndorsements: (address: string | null, opts: unknown) => endorsementsMock(address, opts),
}));

import { KnowledgePanel } from "./KnowledgePanel";

function noteHit(id: string, pubkey: string, name: string, created_at: number, tags: string[][] = []) {
  return {
    event: { id, kind: 1, pubkey, tags, content: "x", created_at, sig: "s" } as NostrEvent,
    author: { pubkey, npub: `npub1${name}`, name, wotRank: null, wotFollowers: null },
    rank: null,
  };
}

const NOW = Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  nipPageMock.mockResolvedValue(null);
  personSetsMock.mockResolvedValue([]);
  endorsementsMock.mockReturnValue(null);
  streamCalls = [];
});

describe("the topic panel", () => {
  it("appears for a tag-active query when no person matches", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    // Person probe found nobody → the tag probe fires for #liverpool.
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    expect(streamCalls[0].query).toBe("#liverpool");

    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 100,
    });

    const panel = await screen.findByTestId("search-topic-panel");
    expect(panel).toHaveTextContent("#liverpool");
    expect(screen.getByTestId("topic-panel-feed").getAttribute("href")).toBe("/t/liverpool");
  });

  it("summarizes the topic's activity: note count and voice count", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "1".repeat(64), "kop", NOW - 3000),
        noteHit("t4", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 100,
    });
    const panel = await screen.findByTestId("search-topic-panel");
    // 4 notes from 3 distinct voices.
    expect(screen.getByTestId("topic-activity")).toHaveTextContent("4 recent notes");
    expect(screen.getByTestId("topic-activity")).toHaveTextContent("3 voices");
    expect(panel).toHaveTextContent("Active today");
  });

  it("voices are named rows linking to their profiles", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    const voice = screen.getByTestId(`topic-voice-${"1".repeat(64)}`);
    expect(voice).toHaveTextContent("kop");
    expect(voice.getAttribute("href")).toBe("/p/npub1kop");
    // The trust-tier ring rides every avatar in the app — voices included
    // (useAuthorScores is mocked to 0.7 → a ringed tier).
    const ringed = voice.querySelector('[class*="shadow-[0_0_0"]');
    expect(ringed).not.toBeNull();
  });

  it("suggests related topics from tags that ride along on the notes", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100, [["t", "liverpool"], ["t", "PremierLeague"]]),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000, [["t", "liverpool"], ["t", "premierleague"], ["t", "ynwa"]]),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000, [["t", "liverpool"], ["t", "onceonly"]]),
      ],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    // premierleague rides on two notes → suggested; the searched tag itself
    // and one-off tags stay out.
    const rel = screen.getByTestId("topic-related-premierleague");
    expect(rel).toHaveTextContent("#premierleague");
    expect(rel.getAttribute("href")).toBe("/?q=%23premierleague");
    expect(screen.queryByTestId("topic-related-liverpool")).toBeNull();
    expect(screen.queryByTestId("topic-related-onceonly")).toBeNull();
  });

  it("same-named bot accounts collapse to one voice row", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "GazetaRSS", NOW - 2000),
        noteHit("t3", "3".repeat(64), "GazetaRSS", NOW - 3000),
        noteHit("t4", "4".repeat(64), "GazetaRSS", NOW - 4000),
      ],
      eose: true,
      timeMs: 100,
    });
    await screen.findByTestId("search-topic-panel");
    expect(screen.getAllByText("GazetaRSS")).toHaveLength(1);
  });

  it("a query matching an app adds an Apps module to the rail", async () => {
    render(<KnowledgePanel query="amethyst" pov="nosfabrica" />);
    await vi.waitFor(() =>
      expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true),
    );
    const appsCall = streamCalls.find((c) => c.params.tab === "apps")!;
    const listing = {
      id: "ap1",
      kind: 32267,
      pubkey: "9".repeat(64),
      tags: [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"], ["summary", "The all-in-one Nostr client"], ["icon", "https://cdn.zapstore.dev/a.png"]],
      content: "",
      created_at: NOW - 500,
      sig: "s",
    } as NostrEvent;
    const offTopic = {
      ...listing, id: "ap2",
      tags: [["d", "net.primal"], ["name", "Primal"], ["summary", "Feeds"]],
    } as NostrEvent;
    appsCall.emit({
      hits: [
        { event: listing, author: null, rank: null },
        { event: offTopic, author: null, rank: null },
      ],
      eose: true,
      timeMs: 90,
    });
    const panel = await screen.findByTestId("search-apps-panel");
    expect(panel).toHaveTextContent("Amethyst");
    // Fuzzy strays whose NAME doesn't match the query stay out.
    expect(panel).not.toHaveTextContent("Primal");
    expect(screen.getByTestId("apps-panel-app-ap1").getAttribute("href")).toMatch(/^\/e\//);
    // The deep link into the full Apps vertical.
    expect(screen.getByTestId("apps-panel-more").getAttribute("href")).toBe("/?q=amethyst&t=apps");
  });

  // The rail's app rows carry the network's numbers — reviews and zaps — as
  // a quiet meta line. Counts only: three COUNT frames per row, no pages.
  it("app rows say how much the network has said about them", async () => {
    endorsementsMock.mockImplementation((address) =>
      address?.endsWith("com.vitorpamplona.amethyst")
        ? { address, reviews: [], reviewCount: 14, zaps: [], zapCount: 101, collectionCount: 46 }
        : null,
    );
    render(<KnowledgePanel query="amethyst" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true));
    const appsCall = streamCalls.find((c) => c.params.tab === "apps")!;
    appsCall.emit({
      hits: [{
        event: { id: "ap1", kind: 32267, pubkey: "9".repeat(64), tags: [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"]], content: "", created_at: NOW, sig: "s" } as NostrEvent,
        author: null, rank: null,
      }],
      eose: true,
      timeMs: 90,
    });
    const meta = await screen.findByTestId("apps-panel-meta-ap1");
    expect(meta).toHaveTextContent("14 reviews");
    expect(meta).toHaveTextContent("101");
    expect(endorsementsMock).toHaveBeenCalledWith("32267:" + "9".repeat(64) + ":com.vitorpamplona.amethyst", {
      publisher: "9".repeat(64), reviewLimit: 0, zapLimit: 0,
    });
  });

  it("a row with nothing said about it has no meta line", async () => {
    endorsementsMock.mockReturnValue({ address: "x", reviews: [], reviewCount: 0, zaps: [], zapCount: 0, collectionCount: 3 });
    render(<KnowledgePanel query="amethyst" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true));
    streamCalls.find((c) => c.params.tab === "apps")!.emit({
      hits: [{
        event: { id: "ap1", kind: 32267, pubkey: "9".repeat(64), tags: [["d", "com.vitorpamplona.amethyst"], ["name", "Amethyst"]], content: "", created_at: NOW, sig: "s" } as NostrEvent,
        author: null, rank: null,
      }],
      eose: true, timeMs: 90,
    });
    await screen.findByTestId("apps-panel-app-ap1");
    expect(screen.queryByTestId("apps-panel-meta-ap1")).toBeNull();
  });

  it("no name-matching app, no Apps module", async () => {
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() =>
      expect(streamCalls.some((c) => c.params.tab === "apps")).toBe(true),
    );
    const appsCall = streamCalls.find((c) => c.params.tab === "apps")!;
    appsCall.emit({
      hits: [{
        event: { id: "ap3", kind: 32267, pubkey: "9".repeat(64), tags: [["name", "SoccerStats"]], content: "", created_at: NOW, sig: "s" } as NostrEvent,
        author: null, rank: null,
      }],
      eose: true,
      timeMs: 80,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("search-apps-panel")).toBeNull();
  });

  it("stays silent when the tag is quiet", async () => {
    render(<KnowledgePanel query="zzzobscure" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({ hits: [noteHit("t1", "1".repeat(64), "solo", NOW)], eose: true, timeMs: 80 });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });

  it("shows the person when their name matches exactly and the topic is quiet", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1jack", name: "jack", wotRank: 0.8, wotFollowers: 10 },
    ]);
    render(<KnowledgePanel query="jack" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });

  // Benjamin's catch: "liverpool" prefix-matched a fan account named
  // LiverpoolHODL and promoted it as THE match. A name-alike is not the
  // entity — prefix matches never earn the panel.
  it("never promotes a name-alike person (prefix matches are out)", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1hodl", name: "LiverpoolHODL", wotRank: 0.9, wotFollowers: 999 },
    ]);
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    // Topic quiet too → the slot stays empty rather than showing the wrong face.
    streamCalls[0].emit({ hits: [], eose: true, timeMs: 60 });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("search-knowledge-panel")).toBeNull();
    expect(screen.queryByTestId("search-topic-panel")).toBeNull();
  });

  it("a NIP-shaped query gets the spec card, not a person hunt", async () => {
    nipPageMock.mockResolvedValue({
      id: "e".repeat(64),
      kind: 30818,
      pubkey: "f".repeat(64),
      tags: [["d", "nip-46"], ["title", "Nostr Connect"]],
      content: "# NIP-46\n\nNostr Connect lets a client talk to a remote signer over relays.",
      created_at: 1_710_000_000,
      sig: "s",
    } as NostrEvent);
    render(<KnowledgePanel query="nip-46" pov="nosfabrica" />);
    const panel = await screen.findByTestId("search-nip-panel");
    // Asked for both spellings the wiki uses.
    expect(nipPageMock).toHaveBeenCalledWith(["nip-46"]);
    expect(panel).toHaveTextContent("NIP-46");
    expect(panel).toHaveTextContent("Nostr Connect");
    expect(panel).toHaveTextContent(/remote signer/);
    expect(screen.getByTestId("nip-panel-read").getAttribute("href")).toMatch(/^\/(e|a)\//);
    // A spec lookup is not a person or topic hunt.
    expect(suggestMock).not.toHaveBeenCalled();
    expect(streamCalls).toHaveLength(0);
  });

  it("'nip 5' pads and tries both wiki spellings", async () => {
    render(<KnowledgePanel query="nip 5" pov="nosfabrica" />);
    await vi.waitFor(() => expect(nipPageMock).toHaveBeenCalled());
    expect(nipPageMock).toHaveBeenCalledWith(["nip-5", "nip-05"]);
  });

  it("a person's follow-set memberships badge their panel with exporter counts", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1david", name: "david", wotRank: 0.9, wotFollowers: 42 },
    ]);
    personSetsMock.mockResolvedValue([
      { title: "Verified Human", exporters: 3 },
      { title: "AOS 2026 Participant", exporters: 1 },
    ]);
    render(<KnowledgePanel query="david" pov="nosfabrica" />);
    await screen.findByTestId("search-knowledge-panel");
    // Asked about THIS person.
    await vi.waitFor(() => expect(personSetsMock).toHaveBeenCalledWith("b".repeat(64)));
    const badge = await screen.findByTestId("person-set-Verified Human");
    expect(badge).toHaveTextContent("Verified Human");
    expect(badge).toHaveTextContent("3");
    expect(screen.getByTestId("person-set-AOS 2026 Participant")).toHaveTextContent("1");
  });

  it("an active topic outranks even an exact-named person", async () => {
    suggestMock.mockResolvedValueOnce([
      { pubkey: "b".repeat(64), npub: "npub1lfc", name: "liverpool", wotRank: 0.8, wotFollowers: 10 },
    ]);
    render(<KnowledgePanel query="liverpool" pov="nosfabrica" />);
    await vi.waitFor(() => expect(streamCalls.length).toBeGreaterThanOrEqual(1));
    streamCalls[0].emit({
      hits: [
        noteHit("t1", "1".repeat(64), "kop", NOW - 100),
        noteHit("t2", "2".repeat(64), "anfield", NOW - 2000),
        noteHit("t3", "3".repeat(64), "red", NOW - 5000),
      ],
      eose: true,
      timeMs: 90,
    });
    await screen.findByTestId("search-topic-panel");
    expect(screen.queryByTestId("search-knowledge-panel")).toBeNull();
  });
});
