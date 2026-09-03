// @vitest-environment jsdom
/**
 * The pack page (kind 30000 on /e): a follow set opens as its people —
 * title, curator, description, and the FULL member roster as tappable
 * rows wearing the app's tier rings, each into their profile. Before
 * this, clicking a "Verified Human" card landed on a blank event page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));
const profileMapMock = new Map<string, { name?: string; picture?: string }>();
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(() => Promise.resolve(profileMapMock)),
}));
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (_kind: number, pubkey: string) => knownProfiles.get(pubkey),
    getEvent: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));

import { FollowSetHero } from "./FollowSetHero";

const CURATOR = "b".repeat(64);
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);

const SET: NostrEvent = {
  id: "a".repeat(64),
  kind: 30000,
  pubkey: CURATOR,
  tags: [
    ["d", "tl-pin-verified-human"],
    ["title", "Verified Human"],
    ["description", "A Pinned-tag list from Brainstorm."],
    ["p", ALICE],
    ["p", BOB],
  ],
  content: "",
  created_at: 1_760_000_000,
  sig: "s",
} as NostrEvent;

beforeEach(() => {
  vi.clearAllMocks();
  knownProfiles.clear();
  profileMapMock.clear();
});

describe("FollowSetHero", () => {
  it("opens the pack as its people: title, count, description, member rows", async () => {
    profileMapMock.set(ALICE, { name: "alice", picture: "https://img.example/a.jpg" });
    render(<FollowSetHero event={SET} />);

    expect(screen.getByText("Verified Human")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(screen.getByText(/Pinned-tag list/)).toBeInTheDocument();

    // Members are ROWS into their profiles — the whole point of the page.
    const row = await screen.findByTestId(`set-member-${ALICE}`);
    expect(row).toHaveTextContent("alice");
    expect(row.getAttribute("href")).toBe(`/p/${nip19.npubEncode(ALICE)}`);
    // Rings ride every face.
    expect([...row.querySelectorAll("span")].some((el) => el.className.includes("shadow-[0_0_0"))).toBe(true);
    // A member with no profile yet still gets a row, degraded to npub.
    expect(screen.getByTestId(`set-member-${BOB}`)).toHaveTextContent("npub1");
  });

  it("names the curator", () => {
    knownProfiles.set(CURATOR, {
      id: "p".repeat(64), kind: 0, pubkey: CURATOR, tags: [],
      content: JSON.stringify({ name: "Dr. Edo Paz" }), created_at: 1, sig: "s",
    } as NostrEvent);
    render(<FollowSetHero event={SET} />);
    const curator = screen.getByTestId("set-hero-curator");
    expect(curator).toHaveTextContent("Dr. Edo Paz");
    expect(curator.getAttribute("href")).toBe(`/p/${nip19.npubEncode(CURATOR)}`);
  });
});
