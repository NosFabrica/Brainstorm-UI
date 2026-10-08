// @vitest-environment jsdom
/**
 * The list card. A Trusted List (kind 30392) is a people list that says more:
 * its faces best first, each wearing its score on the tag, and a line naming
 * the tag's author and whose web of trust ranked it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));
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
    add: (e: NostrEvent) => e,
  },
}));

import { ListCard } from "./cards";

const SIGNER = "7".repeat(64);
const OBSERVER = "4".repeat(64);
const TAG_AUTHOR = "e".repeat(64);
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);

const profile = (pubkey: string, name: string) =>
  ({ id: pubkey, kind: 0, pubkey, tags: [], content: JSON.stringify({ name }), created_at: 1, sig: "s" }) as NostrEvent;

const ev = (kind: number, tags: string[][], content = ""): NostrEvent =>
  ({ id: `list${kind}`, kind, pubkey: SIGNER, tags, content, created_at: 1_790_000_000, sig: "s" }) as NostrEvent;

describe("ListCard", () => {
  it("a Trusted List shows its faces best first with their scores, and where it comes from", () => {
    knownProfiles.set(OBSERVER, profile(OBSERVER, "Olga"));
    knownProfiles.set(TAG_AUTHOR, profile(TAG_AUTHOR, "Tom"));
    const list = ev(
      30392,
      [
        ["title", "Podcaster"],
        ["observer", OBSERVER],
        ["source-tag", "f".repeat(64), TAG_AUTHOR, "podcaster"],
        ["p", BOB, "", "50"],
        ["p", ALICE, "", "93"],
      ],
      JSON.stringify({ members: [{ pubkey: ALICE, endorsements: 4, disputes: 0, score: 93 }] }),
    );
    render(<ListCard event={list} author={null} />);

    expect(screen.getByTestId(`list-count-${list.id}`)).toHaveTextContent("2 members");
    const faces = screen.getByTestId(`list-members-${list.id}`);
    const scores = within(faces).getAllByTestId(/^list-member-score-/);
    expect(scores.map((s) => s.textContent)).toEqual(["93", "50"]);
    expect(screen.getByTestId(`list-provenance-${list.id}`)).toHaveTextContent(
      "From Tom's tag “podcaster” · Ranked by Olga",
    );
    expect(screen.queryByText(/endorsements/)).toBeNull();
  });

  it("a follow set stays as it was: no scores, no provenance line", () => {
    const set = ev(30000, [
      ["title", "Friends"],
      ["p", ALICE],
      ["p", BOB],
    ]);
    render(<ListCard event={set} author={null} />);
    expect(screen.getByTestId(`list-count-${set.id}`)).toHaveTextContent("2 members");
    expect(screen.queryAllByTestId(/^list-member-score-/)).toHaveLength(0);
    expect(screen.queryByTestId(`list-provenance-${set.id}`)).toBeNull();
  });
});
