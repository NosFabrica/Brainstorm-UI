// @vitest-environment jsdom
/**
 * A Trusted List of people (kind 30392 on /e): a follow set with its
 * provenance — the tag it was built from, whose web of trust ranked it, the
 * build's knobs, and each member's score. Before this it opened as the
 * structural card, its members a wall of `p` rows and a JSON blob.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
