// @vitest-environment jsdom
/**
 * Every kind whose meaning is in its tags — what someone did, a poll, a
 * highlight, a trust score, a designation — drawn on every surface a Brainstorm
 * card is drawn on, each reading the kind's spec'd fields through one reader so
 * the surfaces agree:
 *
 *   (a) its own page (EventScreen → the kind's hero),
 *   (b) quoted in a note (EmbeddedNoteCard),
 *   (c) a search tab's grid — the row it routes the kind to: SerpRow for a
 *       highlight and for every kind no tab names; ShareNoteCard for a poll,
 *   (d) the Top page and home feed rows (SerpRow),
 *   (e) the All tab's row (AllResultRow, lib/resultSummary),
 *   (f) its label (lib/kindLabel).
 *
 * Each fixture carries the tags its NIP defines; each surface must show the
 * fact those tags hold and must not fall back to the generic reading — the raw
 * content, a lone "Kind N", a "Structured data" line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import type { NostrEvent } from "nostr-tools";
import type { ReactElement } from "react";
import type { AccountMetadata } from "@/accounts/metadata";
import { eventStore } from "@/lib/eventStore";
import type { MinimalEvent } from "@/lib/noteRefs";

const byId = new Map<string, MinimalEvent>();
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
}));
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/services/assertionFootprint", () => ({ fetchAssertionFootprint: async () => null }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/ThreadAncestors", () => ({ ThreadAncestors: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { EventScreen } from "./EventScreen";
import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { ShareNoteCard } from "./ShareNoteCard";
import { SerpRow } from "@/components/search/SerpRow";
import { AllResultRow } from "@/components/search/AllResultRow";
import { kindLabel } from "@/lib/kindLabel";

const AUTHOR = "4".repeat(64);
const ALICE = "a".repeat(64);
const NOTE = "1".repeat(64);
const POLL = "2".repeat(64);
const LATER = String(Math.floor(Date.now() / 1000) + 86_400 * 3);

let n = 100;
const ev = (kind: number, tags: string[][], content = "", pubkey = AUTHOR): NostrEvent =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind,
    pubkey,
    created_at: Math.floor(Date.now() / 1000) - 600,
    tags,
    content,
    sig: "0".repeat(128),
  }) as NostrEvent;

/** What a case must show: on every surface `all`, and on some surfaces more (or other) words. */
type Case = {
  name: string;
  event: NostrEvent;
  /** The spec'd fact, as words, every surface says. */
  all: (string | RegExp)[];
  /** Words the generic fallback would show and a surface must not lead with (the raw content). */
  not?: string[];
  /** The page's hero. */
  hero: string;
  /** (c): the row the search grid routes it to. */
  grid: "serp" | "note";
};

const zapRequest = JSON.stringify({
  kind: 9734,
  pubkey: "c".repeat(64),
  content: "great post",
  tags: [
    ["p", ALICE],
    ["amount", "21000"],
  ],
});

const CASES: Case[] = [
  {
    name: "7 reaction (NIP-25 e/p/k, content '+')",
    event: ev(
      7,
      [
        ["e", NOTE],
        ["p", ALICE],
        ["k", "1"],
      ],
      "+",
    ),
    all: [/Reacted|Liked/],
    hero: "reaction-hero",
    grid: "serp",
  },
  {
    name: "17 external reaction (NIP-25 + NIP-73 k/i)",
    event: ev(
      17,
      [
        ["k", "web"],
        ["i", "https://example.com/post"],
      ],
      "⭐",
    ),
    all: [/Reacted/, "example.com"],
    hero: "reaction-hero",
    grid: "serp",
  },
  {
    name: "5 deletion (NIP-09 e/k, content reason)",
    event: ev(
      5,
      [
        ["e", NOTE],
        ["k", "1"],
      ],
      "posted by accident",
    ),
    all: ["Deleted 1 event"],
    hero: "deletion-hero",
    grid: "serp",
  },
  {
    name: "1984 report (NIP-56 type on e)",
    event: ev(
      1984,
      [
        ["e", NOTE, "spam"],
        ["p", ALICE],
      ],
      "selling pills",
    ),
    all: [/Reported/, "Spam"],
    hero: "report-hero",
    grid: "serp",
  },
  {
    name: "1985 label (NIP-32 L/l)",
    event: ev(1985, [
      ["L", "license"],
      ["l", "MIT", "license"],
      ["e", NOTE],
    ]),
    all: ["MIT"],
    hero: "label-hero",
    grid: "serp",
  },
  {
    name: "8 badge award (NIP-58 a/p)",
    event: ev(8, [
      ["a", `30009:${AUTHOR}:bravery`],
      ["p", ALICE],
    ]),
    all: [/Awarded/],
    hero: "badge-award-hero",
    grid: "serp",
  },
  {
    name: "1018 poll vote (NIP-88 e/response)",
    event: ev(1018, [
      ["e", POLL],
      ["response", "yay"],
    ]),
    all: ["Voted in a poll"],
    hero: "poll-vote-hero",
    grid: "serp",
  },
  {
    name: "4550 approval (NIP-72 a/e/p/k)",
    event: ev(4550, [
      ["a", `34550:${AUTHOR}:cooking`],
      ["e", NOTE],
      ["p", ALICE],
      ["k", "1"],
    ]),
    all: ["Approved a post"],
    hero: "approval-hero",
    grid: "serp",
  },
  {
    name: "3 follow list (NIP-02 p)",
    event: ev(3, [
      ["p", ALICE],
      ["p", "b".repeat(64)],
      ["t", "bitcoin"],
    ]),
    all: ["Follows 2 people"],
    not: ["hashtag"],
    hero: "follows-hero",
    grid: "serp",
  },
  {
    name: "31925 RSVP (NIP-52 a/status/fb)",
    event: ev(31925, [
      ["a", `31923:${ALICE}:meetup`],
      ["d", "x"],
      ["status", "accepted"],
      ["fb", "busy"],
    ]),
    all: ["Going"],
    hero: "rsvp-hero",
    grid: "serp",
  },
  {
    name: "9734 zap request (NIP-57 amount/p)",
    event: ev(
      9734,
      [
        ["p", ALICE],
        ["amount", "21000"],
        ["relays", "wss://r.example"],
        ["e", NOTE],
      ],
      "Zap!",
    ),
    all: [/21 sats/, "Zap!"],
    hero: "zap-hero",
    grid: "serp",
  },
  {
    name: "9735 zap receipt (NIP-57 bolt11/description)",
    event: ev(
      9735,
      [
        ["p", ALICE],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", zapRequest],
      ],
      "",
      "d".repeat(64),
    ),
    all: [/21 sats/, "great post"],
    hero: "zap-hero",
    grid: "serp",
  },
  {
    name: "9321 nutzap (NIP-61 proof/unit/u/p)",
    event: ev(
      9321,
      [
        ["proof", JSON.stringify({ amount: 5, C: "02", id: "00", secret: "s" })],
        ["unit", "sat"],
        ["u", "https://mint.example"],
        ["p", ALICE],
      ],
      "thanks",
    ),
    all: [/5 sats/, "thanks"],
    hero: "zap-hero",
    grid: "serp",
  },
  {
    name: "1068 poll (NIP-88 option/polltype/endsAt)",
    event: ev(
      1068,
      [
        ["option", "y1", "Yay"],
        ["option", "n1", "Nay"],
        ["polltype", "singlechoice"],
        ["endsAt", LATER],
      ],
      "Pineapple on pizza?",
    ),
    all: ["Pineapple on pizza?", "Yay", "Nay"],
    hero: "poll",
    grid: "note",
  },
  {
    name: "6969 zap poll (draft zap polls: poll_option)",
    event: ev(
      6969,
      [
        ["poll_option", "0", "Yes"],
        ["poll_option", "1", "No"],
      ],
      "Ship it?",
    ),
    all: ["Ship it?", "Yes", "No"],
    hero: "poll",
    grid: "note",
  },
  {
    name: "9802 highlight (NIP-84 r source, p author, comment)",
    event: ev(
      9802,
      [
        ["r", "https://source.example/essay", "source"],
        ["r", "https://other.example", "mention"],
        ["p", ALICE, "", "author"],
        ["comment", "So true"],
      ],
      "the words they marked",
    ),
    all: ["the words they marked", "source.example"],
    not: ["other.example"],
    hero: "highlight-hero",
    grid: "serp",
  },
  {
    name: "30382 trust score (NIP-85 d/rank/followers)",
    event: ev(30382, [
      ["d", ALICE],
      ["rank", "63"],
      ["followers", "188"],
    ]),
    all: [/Trust score for/, /63/, /188/],
    hero: "assertion-hero",
    grid: "serp",
  },
  {
    name: "30383 event score",
    event: ev(30383, [
      ["d", NOTE],
      ["rank", "40"],
    ]),
    all: [/Score for/, /40/],
    hero: "assertion-hero",
    grid: "serp",
  },
  {
    name: "30384 address score",
    event: ev(30384, [
      ["d", `30023:${ALICE}:essay`],
      ["rank", "50"],
    ]),
    all: [/Score for/, /50/],
    hero: "assertion-hero",
    grid: "serp",
  },
  {
    name: "30385 identifier score (NIP-73 d, k)",
    event: ev(30385, [
      ["d", "isbn:9780140449334"],
      ["k", "isbn"],
      ["rank", "71"],
    ]),
    all: [/Score for/, /71/],
    hero: "assertion-hero",
    grid: "serp",
  },
  {
    name: "10040 designation (NIP-85 kind:tag rows)",
    event: ev(10040, [["30382:rank", "e".repeat(64), "wss://nip85.brainstorm.world"]]),
    all: [/Trust designation|Activated Brainstorm trust signals/],
    hero: "designation-hero",
    grid: "serp",
  },
];

const providers = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>{ui}</AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

const SURFACES: { id: string; draw: (c: Case) => ReactElement; root: (c: Case) => string }[] = [
  { id: "(a) page", draw: (c) => <EventScreen event={c.event as MinimalEvent} />, root: (c) => c.hero },
  {
    id: "(b) quoted",
    draw: (c) => <EmbeddedNoteCard event={c.event as MinimalEvent} author={{ name: "Maker" }} href="/e/x" />,
    root: () => "embedded-note",
  },
  {
    id: "(c) tab grid",
    draw: (c) =>
      c.grid === "note" ? (
        <ShareNoteCard
          event={c.event as MinimalEvent}
          profiles={new Map()}
          eventsById={new Map()}
          showAuthor
          href="/e/x"
        />
      ) : (
        <SerpRow event={c.event} author={null} query="" />
      ),
    root: (c) => (c.grid === "note" ? "note-card" : `serp-row-${c.event.id}`),
  },
  {
    id: "(d) top row",
    draw: (c) => <SerpRow event={c.event} author={null} query="" />,
    root: (c) => `serp-row-${c.event.id}`,
  },
  {
    id: "(e) all row",
    draw: (c) => <AllResultRow event={c.event} author={null} query="" />,
    root: (c) => `all-row-${c.event.id}`,
  },
];

beforeEach(() => {
  byId.clear();
  byId.set(NOTE, ev(1, [], "the note it is about", ALICE) as MinimalEvent);
});

describe.each(CASES)("$name", (c) => {
  it.each(SURFACES)("$id shows what its tags say, never the generic fallback", async (s) => {
    providers(s.draw(c));
    const root = await waitFor(() => {
      const el =
        c.hero === "poll" && s.id === "(a) page" ? screen.getByTestId("event-note") : screen.getByTestId(s.root(c));
      return el;
    });
    await waitFor(() => {
      for (const words of c.all) expect(root).toHaveTextContent(words);
    });
    for (const words of c.not ?? []) expect(root).not.toHaveTextContent(words);
    // The generic fallbacks: a lone structural line, raw JSON, a bare "Kind N".
    expect(screen.queryByTestId("embedded-structural")).toBeNull();
    expect(screen.queryByTestId("serp-content-shape")).toBeNull();
    expect(root).not.toHaveTextContent(/\bKind \d+\b/);
    // A reaction's "+" is never its words.
    if (c.event.kind === 7) expect(root.textContent).not.toMatch(/(^|\s)\+(\s|$)/);
    cleanup();
  });

  it("(f) has a name, not a number", () => {
    expect(kindLabel(c.event)).not.toMatch(/^Kind \d+$/);
  });
});
