// @vitest-environment jsdom
/**
 * Every kind given a reading of its own here is drawn as what it is on every
 * surface that shows an event: its page (EventScreen), a quote of it
 * (EmbeddedNoteCard), the search tab's card, a result row (SerpRow), the All
 * tab's reading (summaryOf) and its name (kindLabel). Each fixture is shaped
 * as its spec writes it; the test fails when a surface falls back to the
 * generic drawing, or leaves out the fields the spec gives it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import type { NostrEvent } from "nostr-tools";
import type { ReactElement } from "react";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";

// What the relays hold, for the readings that name another event: a channel, a stream, a space, an app.
const byAddress = new Map<string, NostrEvent>();
const byId = new Map<string, NostrEvent>();
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
    new Map(
      refs.flatMap((r) => {
        const key = `${r.kind}:${r.pubkey}:${r.identifier}`;
        const found = byAddress.get(key);
        return found ? [[key, found]] : [];
      }),
    ),
  fetchEventsByIds: async (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
}));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/hooks/useLinkMetadata", () => ({ useLinkMetadata: () => null }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/ThreadAncestors", () => ({ ThreadAncestors: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { EventScreen } from "./EventScreen";
import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { SerpRow } from "@/components/search/SerpRow";
import { ListCard, LiveTile, MediaCard } from "@/components/search/cards";
import { summaryOf } from "@/lib/resultSummary";
import { kindLabel } from "@/lib/kindLabel";
import { TAB_KINDS } from "@/services/search";
import { liveStateOf } from "@/lib/liveStream";

const PK = "4".repeat(64);
const HOST = "5".repeat(64);
const NOW = Math.floor(Date.now() / 1000);
let n = 0;
const ev = (kind: number, tags: string[][], content = ""): NostrEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey: PK,
  created_at: NOW - 600,
  tags,
  content,
  sig: "",
});

const AUTHOR = { pubkey: PK, npub: "", name: "Maker" };

type SearchCard = (event: NostrEvent) => ReactElement;
interface Case {
  kind: number;
  event: NostrEvent;
  /** What the page shows: a testid inside the event card, and words it must say. */
  page: { testId: string; text?: string | RegExp };
  /** A quote of it: the shape it is drawn as (a kind card's data-shape), or a testid. */
  embed: { shape?: string; testId?: string; text?: string | RegExp };
  /** The search tab's card, when a tab lists the kind. */
  grid?: { tab: keyof typeof TAB_KINDS; card: SearchCard; testId: string; text?: string | RegExp };
  /** A result row: a testid, never the generic row's alone, and its words. */
  row: { testId: string; text?: string | RegExp };
  /** The All tab's reading. */
  summary: { title?: string | RegExp; fact?: string | RegExp; body?: string | RegExp };
  label: string;
}

const meetingSpace = ev(30312, [
  ["d", "main-conference-room"],
  ["room", "Main Conference Hall"],
  ["summary", "Our primary conference space"],
  ["status", "open"],
  ["service", "https://meet.example.com/room"],
  ["endpoint", "https://api.example.com/room"],
  ["p", HOST, "wss://nostr.example.com/", "Host"],
]);

const CASES: Case[] = [
  {
    kind: 30024,
    event: ev(
      30024,
      [
        ["d", "my-draft"],
        ["title", "Half an essay"],
        ["summary", "Not done yet."],
      ],
      "The first paragraph of a draft.",
    ),
    page: { testId: "article-draft", text: /Draft/ },
    embed: { testId: "embedded-article", text: /Half an essay/ },
    row: { testId: "serp-row-", text: /Half an essay/ },
    summary: { title: "Half an essay" },
    label: "Draft",
  },
  {
    kind: 30312,
    event: meetingSpace,
    page: { testId: "meeting-join", text: /Join the room/ },
    embed: { shape: "live", text: /Main Conference Hall/ },
    grid: {
      tab: "live",
      card: (e) => <LiveTile event={e} author={AUTHOR} state={liveStateOf(e)} />,
      testId: "live-tile-",
      text: /Main Conference Hall/,
    },
    row: { testId: "live-card-", text: /Main Conference Hall/ },
    summary: { title: "Main Conference Hall", fact: "Open" },
    label: "Space",
  },
  {
    kind: 30313,
    event: ev(30313, [
      ["d", "annual-meeting-2025"],
      ["a", `30312:${PK}:main-conference-room`, "wss://nostr.example.com"],
      ["title", "Annual Company Meeting"],
      ["summary", "Yearly company-wide meeting"],
      ["starts", String(NOW + 3600)],
      ["status", "planned"],
      ["p", HOST, "wss://provider1.com/", "Speaker"],
    ]),
    page: { testId: "meeting-space", text: /In/ },
    embed: { shape: "live", text: /Annual Company Meeting/ },
    grid: {
      tab: "live",
      card: (e) => <LiveTile event={e} author={AUTHOR} state={liveStateOf(e)} />,
      testId: "live-tile-",
      text: /Upcoming/,
    },
    row: { testId: "live-card-", text: /Annual Company Meeting/ },
    summary: { title: "Annual Company Meeting", fact: "Planned" },
    label: "Meeting",
  },
  {
    kind: 39092,
    event: ev(39092, [
      ["d", "photographers"],
      ["title", "Photographers"],
      ["p", HOST],
      ["p", "6".repeat(64)],
    ]),
    page: { testId: "follow-set-hero" },
    embed: { shape: "people-list", text: /Photographers/ },
    grid: {
      tab: "lists",
      card: (e) => <ListCard event={e} author={AUTHOR} />,
      testId: "list-card-",
      text: /2 members/,
    },
    row: { testId: "list-card-", text: /Photographers/ },
    summary: { fact: "2 people" },
    label: "Starter pack",
  },
  {
    kind: 30267,
    event: ev(
      30267,
      [
        ["d", "nostr"],
        ["title", "My nostr apps"],
        ["a", `32267:${HOST}:com.example.app1`],
        ["a", `32267:${HOST}:net.example.app2`],
      ],
      "My nostr app selection",
    ),
    page: { testId: "item-list-hero", text: /2 apps/ },
    embed: { testId: "embedded-list", text: /2 apps/ },
    grid: { tab: "lists", card: (e) => <ListCard event={e} author={AUTHOR} />, testId: "list-card-", text: /2 apps/ },
    row: { testId: "list-card-", text: /My nostr apps/ },
    summary: { fact: "2 apps" },
    label: "App list",
  },
  {
    kind: 1808,
    event: ev(
      1808,
      [
        ["url", "https://audio.nostr.build/df02fe32fae1d1"],
        ["blossom", "df02fe32fae1d123c1d4bdf54ea9638d78062c46", "audio/mp4"],
        ["duration", "33.3"],
        ["subject", "Audio Note"],
      ],
      "Don't choose to just exist.",
    ),
    page: { testId: "audio-hero", text: /Audio Note/ },
    embed: { testId: "embedded-audio", text: /Audio Note/ },
    grid: { tab: "media", card: (e) => <MediaCard event={e} author={AUTHOR} />, testId: "", text: /just exist/ },
    row: { testId: "serp-row-", text: /just exist/ },
    summary: { title: "Audio Note", body: /just exist/ },
    label: "Audio",
  },
  {
    kind: 39701,
    event: ev(
      39701,
      [
        ["d", "alice.blog/post"],
        ["published_at", "1738863000"],
        ["title", "Blog insights by Alice"],
        ["t", "insight"],
      ],
      "A marvelous insight by Alice.",
    ),
    page: { testId: "web-bookmark-hero", text: /Blog insights by Alice/ },
    embed: { testId: "embedded-web-bookmark", text: /alice\.blog/ },
    grid: { tab: "lists", card: (e) => <SerpRow event={e} author={AUTHOR} query="" />, testId: "web-bookmark-" },
    row: { testId: "web-bookmark-", text: /Blog insights by Alice/ },
    summary: { title: "Blog insights by Alice" },
    label: "Web bookmark",
  },
  {
    kind: 10002,
    event: ev(10002, [
      ["r", "wss://alicerelay.example.com"],
      ["r", "wss://expensive-relay.example2.com", "write"],
      ["r", "wss://nostr-relay.example.com", "read"],
    ]),
    page: { testId: "relay-list-relays", text: /expensive-relay\.example2\.com/ },
    embed: { shape: "relay-list", text: /3 relays · 2 read, 2 write/ },
    row: { testId: "relay-list-card-", text: /alicerelay\.example\.com/ },
    summary: { fact: "2 read · 2 write", body: /nostr-relay\.example\.com \(read\)/ },
    label: "Relay list",
  },
  {
    kind: 30315,
    event: ev(
      30315,
      [
        ["d", "music"],
        ["r", "spotify:search:Intergalatic%20-%20Beastie%20Boys"],
        ["expiration", String(NOW + 120)],
      ],
      "Intergalatic - Beastie Boys",
    ),
    page: { testId: "status-hero", text: /Intergalatic - Beastie Boys/ },
    embed: { shape: "status", text: /Listening to/ },
    row: { testId: "status-card-", text: /Intergalatic - Beastie Boys/ },
    summary: { title: "Intergalatic - Beastie Boys", fact: "Listening to" },
    label: "Status",
  },
  {
    kind: 42,
    event: ev(42, [["e", "c".repeat(64), "wss://relay.example.com", "root"]], "Hello channel"),
    page: { testId: "chat-context", text: /Channel/ },
    embed: { testId: "chat-context", text: /Channel/ },
    row: { testId: "chat-context", text: /Channel/ },
    summary: { fact: "In a channel", body: /Hello channel/ },
    label: "Chat",
  },
  {
    kind: 1311,
    event: ev(1311, [["a", `30311:${HOST}:demo-cf-stream`, "", "root"]], "Zaps to live streams is beautiful."),
    page: { testId: "chat-context", text: /Live chat/ },
    embed: { testId: "chat-context", text: /Live chat/ },
    row: { testId: "chat-context", text: /Live chat/ },
    summary: { fact: "Live chat", body: /beautiful/ },
    label: "Live chat",
  },
  {
    kind: 9,
    event: ev(9, [["h", "pizza-lovers"]], "GM"),
    page: { testId: "chat-context", text: /pizza-lovers/ },
    embed: { testId: "chat-context", text: /pizza-lovers/ },
    row: { testId: "chat-context", text: /pizza-lovers/ },
    summary: { fact: "In group pizza-lovers", body: /GM/ },
    label: "Chat",
  },
];

const wrap = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>{ui}</AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

const byTestIdPrefix = (container: HTMLElement, prefix: string) =>
  container.querySelector(`[data-testid^="${prefix}"]`) as HTMLElement | null;

describe.each(CASES)("kind $kind on every surface", (c) => {
  it("its page draws it as what it is, never the generic fallback", async () => {
    const { container } = wrap(<EventScreen event={c.event as MinimalEvent} />);
    const hit = await vi.waitFor(() => {
      const el = byTestIdPrefix(container, c.page.testId);
      if (!el) throw new Error(`no ${c.page.testId}`);
      return el;
    });
    if (c.page.text) expect(hit).toHaveTextContent(c.page.text);
    // The generic fallbacks: a structural table, or a bare media/text block.
    expect(screen.queryByTestId("structural-hero")).toBeNull();
    expect(screen.queryByTestId("event-media")).toBeNull();
  });

  it("a quote of it is its own card", async () => {
    const { container } = wrap(<EmbeddedNoteCard event={c.event as MinimalEvent} author={{ name: "Maker" }} />);
    const hit = await vi.waitFor(() => {
      const el = c.embed.shape
        ? (container.querySelector(`[data-testid="embedded-card"][data-shape="${c.embed.shape}"]`) as HTMLElement)
        : byTestIdPrefix(container, c.embed.testId!);
      if (!el) throw new Error(`no ${c.embed.shape ?? c.embed.testId}`);
      return el;
    });
    if (c.embed.text) expect(hit).toHaveTextContent(c.embed.text);
    expect(screen.queryByTestId("embedded-structural")).toBeNull();
  });

  it.runIf(!!c.grid)("the search tab that lists it draws its card", () => {
    expect(TAB_KINDS[c.grid!.tab]).toContain(c.kind);
    const { container } = wrap(c.grid!.card(c.event));
    expect(container.textContent?.trim()).toBeTruthy();
    if (c.grid!.testId) expect(byTestIdPrefix(container, c.grid!.testId)).not.toBeNull();
    if (c.grid!.text) expect(container).toHaveTextContent(c.grid!.text);
  });

  it("a result row says it, in its own row or card", () => {
    const { container } = wrap(<SerpRow event={c.event} author={AUTHOR} query="" />);
    const hit = byTestIdPrefix(container, c.row.testId);
    expect(hit).not.toBeNull();
    if (c.row.text) expect(container).toHaveTextContent(c.row.text);
    expect(screen.queryByTestId("serp-content-shape")).toBeNull();
  });

  it("the All tab reads it", () => {
    const s = summaryOf(c.event);
    if (c.summary.title) expect(s.title).toMatch(c.summary.title);
    if (c.summary.fact) expect(s.facts.join(" | ")).toMatch(c.summary.fact);
    if (c.summary.body) expect(s.body ?? "").toMatch(c.summary.body);
    expect(s.shape).toBeNull();
  });

  it("it has a name", () => {
    expect(kindLabel(c.event)).toBe(c.label);
  });
});

describe("the readings the surfaces share", () => {
  it("a meeting's page names its people with their roles, and its space", () => {
    const meeting = CASES[2].event;
    wrap(<EventScreen event={meeting as MinimalEvent} />);
    expect(within(screen.getByTestId("meeting-hero")).getByTestId(`meeting-role-${HOST}`)).toHaveTextContent("Speaker");
    expect(screen.getByTestId("meeting-status")).toHaveTextContent("Upcoming");
  });

  it("a space's page is its Host's, and a closed one offers no way in", () => {
    const closed = ev(
      30312,
      meetingSpace.tags.map((t) => (t[0] === "status" ? ["status", "closed"] : t)),
    );
    wrap(<EventScreen event={closed as MinimalEvent} />);
    expect(screen.getByTestId("meeting-status")).toHaveTextContent("Closed");
    expect(screen.queryByTestId("meeting-join")).toBeNull();
  });

  it("a relay list's page marks each relay read, write or both", () => {
    wrap(<EventScreen event={CASES[7].event as MinimalEvent} />);
    const rows = screen.getAllByTestId("relay-list-relay");
    expect(
      rows.map((r) => [!!within(r).queryByTestId("relay-read"), !!within(r).queryByTestId("relay-write")]),
    ).toEqual([
      [true, true],
      [false, true],
      [true, false],
    ]);
  });

  it("an expired status says so; a cleared one says it was cleared", () => {
    const expired = ev(
      30315,
      [
        ["d", "general"],
        ["expiration", String(NOW - 60)],
      ],
      "Hiking",
    );
    wrap(<EventScreen event={expired as MinimalEvent} />);
    expect(screen.getByTestId("status-expired")).toBeInTheDocument();
    expect(screen.getByTestId("status-label")).toHaveTextContent("Status");
    expect(summaryOf(ev(30315, [["d", "general"]], "")).title).toBe("Cleared their status");
  });
});

describe("what a reading names, found", () => {
  const held = (e: NostrEvent) => {
    byAddress.set(`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e);
    byId.set(e.id, e);
    return e;
  };

  it("an app curation set's page draws each app it names as its app card", async () => {
    held({
      ...ev(32267, [
        ["d", "com.example.app1"],
        ["name", "Amethyst"],
      ]),
      pubkey: HOST,
    });
    wrap(<EventScreen event={CASES[4].event as MinimalEvent} />);
    const apps = await screen.findByTestId("item-list-addresses");
    await vi.waitFor(() => expect(apps.querySelector('[data-shape="app"]')).not.toBeNull());
    expect(apps).toHaveTextContent("Amethyst");
    // The app not found yet is still a way to it.
    expect(within(apps).getByTestId(`item-list-address-32267:${HOST}:net.example.app2`)).toBeInTheDocument();
  });

  it("a meeting names the space its `a` points at", async () => {
    held(meetingSpace);
    wrap(<EventScreen event={CASES[2].event as MinimalEvent} />);
    await vi.waitFor(() => expect(screen.getByTestId("meeting-space")).toHaveTextContent("In Main Conference Hall"));
  });

  it("a live chat message names its stream; a channel message its channel", async () => {
    held({
      ...ev(30311, [
        ["d", "demo-cf-stream"],
        ["title", "Adult Swim Metalocalypse"],
      ]),
      pubkey: HOST,
    });
    const channel = held({ ...ev(40, [], JSON.stringify({ name: "Bitcoin talk", about: "", picture: "" })) });
    wrap(
      <>
        <EmbeddedNoteCard event={CASES[10].event as MinimalEvent} author={{ name: "Maker" }} />
        <EmbeddedNoteCard
          event={ev(42, [["e", channel.id, "", "root"]], "Hello") as MinimalEvent}
          author={{ name: "Maker" }}
        />
      </>,
    );
    await vi.waitFor(() => {
      const lines = screen.getAllByTestId("chat-context").map((l) => l.textContent);
      expect(lines).toEqual(["Live chat·Adult Swim Metalocalypse", "Channel·Bitcoin talk"]);
    });
  });
});
