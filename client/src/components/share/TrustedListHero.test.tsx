// @vitest-environment jsdom
/**
 * A Trusted List of people (kind 30392 on /e): a follow set with its
 * provenance — the tag it was built from, whose web of trust ranked it, the
 * build's knobs, and each member's score. Before this it opened as the
 * structural card, its members a wall of `p` rows and a JSON blob.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
}));
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", async () => ({
  // lib/eventStore's verified-deletion seam (useStoreEvents reads it): nothing deleted here.
  isDeleted: () => false,
  deletions$: { subscribe: () => ({ unsubscribe: () => {} }) },
  eventStore: {
    ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
    getReplaceable: (_kind: number, pubkey: string) => knownProfiles.get(pubkey),
    getEvent: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));

import { TrustedListHero } from "./TrustedListHero";

const SIGNER = "7".repeat(64);
const OBSERVER = "4".repeat(64);
const TAG_AUTHOR = "e".repeat(64);
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);

const LIST: NostrEvent = {
  id: "a".repeat(64),
  kind: 30392,
  pubkey: SIGNER,
  tags: [
    ["d", "tl-tag-460c25e6-e5272de9-podcaster"],
    ["title", "Podcaster"],
    ["description", "This tag refers to someone who hosts one or more podcasts."],
    ["metric", "tag-membership"],
    ["observer", OBSERVER],
    ["source-tag", "f".repeat(64), TAG_AUTHOR, "podcaster"],
    ["cutoff", "1"],
    ["min-rank", "3"],
    ["rigor", "0.5"],
    ["p", BOB, "", "50"],
    ["p", ALICE, "", "93"],
  ],
  content: JSON.stringify({ members: [{ pubkey: ALICE, endorsements: 4, disputes: 0, score: 93 }] }),
  created_at: 1_790_086_103,
  sig: "s",
} as NostrEvent;

function profile(pubkey: string, name: string): NostrEvent {
  return {
    id: pubkey.slice(0, 63) + "0",
    kind: 0,
    pubkey,
    tags: [],
    content: JSON.stringify({ name }),
    created_at: 1,
    sig: "s",
  } as NostrEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  knownProfiles.clear();
});

describe("TrustedListHero", () => {
  it("opens as its people, with where the list comes from and each score", () => {
    knownProfiles.set(OBSERVER, profile(OBSERVER, "Observer Olga"));
    knownProfiles.set(TAG_AUTHOR, profile(TAG_AUTHOR, "Tagger Tom"));
    render(<TrustedListHero event={LIST} />);

    expect(screen.getByText("Podcaster")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(screen.getByText(/hosts one or more podcasts/)).toBeInTheDocument();

    const tag = screen.getByTestId("trusted-list-source-tag");
    expect(tag.getAttribute("href")).toBe(`/tags/${nip19.npubEncode(TAG_AUTHOR)}/podcaster`);
    expect(screen.getByText("Tagger Tom")).toBeInTheDocument();
    const pov = screen.getByTestId("trusted-list-perspective");
    expect(pov).toHaveTextContent("Observer Olga");
    expect(pov.getAttribute("href")).toBe(`/p/${nip19.npubEncode(OBSERVER)}`);

    const params = screen.getByTestId("trusted-list-params");
    expect(params).toHaveTextContent("Tag membership");
    expect(params).toHaveTextContent("Min rank 3");
    expect(params).toHaveTextContent("Rigor 0.5");

    // Best first, each with their score; the JSON content is not shown.
    const rows = screen.getByTestId("set-hero-roster").querySelectorAll("[data-testid^='set-member-']");
    expect([...rows].map((r) => r.getAttribute("data-testid"))).toEqual([`set-member-${ALICE}`, `set-member-${BOB}`]);
    expect(screen.getByTestId(`trusted-list-score-${ALICE}`)).toHaveTextContent("93");
    expect(screen.getByTestId(`trusted-list-score-${BOB}`)).toHaveTextContent("50");
    expect(screen.queryByText(/endorsements/)).toBeNull();
  });

  it("an empty list says so instead of drawing an empty roster", () => {
    render(<TrustedListHero event={{ ...LIST, tags: LIST.tags.filter((t) => t[0] !== "p") }} />);
    expect(screen.getByText("0 members")).toBeInTheDocument();
    expect(screen.getByTestId("set-hero-roster-empty")).toHaveTextContent("No one is on this list yet.");
    expect(screen.queryByTestId("set-hero-roster")).toBeNull();
  });
});

describe("TrustedListHero — lists of things (30393–30395)", () => {
  const NOTE_A = "a1".repeat(32);
  const NOTE_B = "b2".repeat(32);
  const base = (kind: number, tags: string[][]): NostrEvent => ({
    ...LIST,
    id: `${kind}`.padEnd(64, "0"),
    kind,
    tags: [["d", `tl-${kind}`], ["title", "stoicism Notes"], ["observer", OBSERVER], ...tags],
    content: '{"members":[]}',
  });

  it("a 30393 lists its e members as notes, best first, each scored — never its discovery a or p", () => {
    renderWithProviders(
      <TrustedListHero
        event={base(30393, [
          ["a", `39999:${TAG_AUTHOR}:stoicism`],
          ["p", ALICE],
          ["e", NOTE_B, "", "40"],
          ["e", NOTE_A, "", "90"],
          ["tagging-target", "1"],
          ["truncated", "500"],
        ])}
      />,
    );
    expect(screen.getByTestId("trusted-list-count")).toHaveTextContent("2 events");
    expect(screen.getByTestId("trusted-list-target")).toHaveTextContent("Note");
    expect(screen.getByTestId("trusted-list-truncated")).toHaveTextContent("2 of 500 shown");
    const notes = screen.getAllByTestId(/^item-list-note-[0-9a-f]{64}$/);
    expect(notes.map((li) => li.getAttribute("data-testid"))).toEqual([
      `item-list-note-${NOTE_A}`,
      `item-list-note-${NOTE_B}`,
    ]);
    expect(notes[0]).toHaveTextContent("90");
    // The observer's `p` is not a member: no roster.
    expect(screen.queryByTestId(`roster-${ALICE}`)).toBeNull();
  });

  it("a 30395 lists its NIP-73 ids, linked where they have a home; a retracted list says so and lists nothing", () => {
    const { unmount } = renderWithProviders(
      <TrustedListHero
        event={base(30395, [
          ["i", "doi:10.1000/182", "", "70"],
          ["i", "isbn:9780141439518"],
        ])}
      />,
    );
    const ids = screen.getAllByTestId("trusted-list-identifier");
    expect(ids[0]).toHaveTextContent("Paper · 10.1000/182");
    expect(ids[0].querySelector("a")).toHaveAttribute("href", "https://doi.org/10.1000/182");
    expect(ids[1]).toHaveTextContent("Book · 9780141439518");
    unmount();
    renderWithProviders(
      <TrustedListHero
        event={base(30394, [
          ["status", "retracted"],
          ["a", `39999:${TAG_AUTHOR}:x`],
        ])}
      />,
    );
    expect(screen.getByTestId("trusted-list-retracted")).toBeInTheDocument();
    expect(screen.queryByTestId("trusted-list-items")).toBeNull();
  });
});
