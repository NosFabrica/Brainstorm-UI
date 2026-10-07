// @vitest-environment jsdom
/**
 * The All tab's list asks for what its rows are about — a reaction's note, an
 * RSVP's event — once per settled page, in one batch for ids and one for
 * addresses, and each row quotes its target in a line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const fetched = vi.hoisted(() => new Map<string, NostrEvent>());
const fetchIds = vi.hoisted(() => vi.fn());
const fetchAddrs = vi.hoisted(() => vi.fn());
vi.mock("@/services/nostr", () => ({
  fetchEventsByIds: (ids: string[]) => {
    fetchIds(ids);
    return Promise.resolve(ids.map((id) => fetched.get(id)).filter(Boolean));
  },
  fetchAddressableEvents: (coords: { kind: number; pubkey: string; identifier: string }[]) => {
    fetchAddrs(coords);
    const out = new Map<string, NostrEvent>();
    for (const c of coords) {
      const key = `${c.kind}:${c.pubkey}:${c.identifier}`;
      const e = fetched.get(key);
      if (e) out.set(key, e);
    }
    return Promise.resolve(out);
  },
  fetchProfileMap: () => Promise.resolve(new Map()),
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: { ...(await import("@/test/fakeEventStore")).eventStoreDefaults },
}));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));

import { AllResults } from "./AllResults";

const A = "a".repeat(64);
const B = "b".repeat(64);
const ev = (id: string, kind: number, tags: string[][] = [], content = "", pubkey = A): NostrEvent =>
  ({ id, kind, pubkey, tags, content, created_at: 1_790_000_000, sig: "s" }) as NostrEvent;
const hit = (event: NostrEvent) => ({ event, author: null, rank: null });

beforeEach(() => {
  fetched.clear();
  fetchIds.mockClear();
  fetchAddrs.mockClear();
});

describe("AllResults", () => {
  it("asks once, when settled, for every row's target — and quotes it", async () => {
    const note = ev("1".repeat(64), 1, [], "The note people reacted to", B);
    const meetup = ev(
      "2".repeat(64),
      31923,
      [
        ["d", "meetup"],
        ["title", "Bitcoin Meetup"],
      ],
      "",
      B,
    );
    fetched.set(note.id, note);
    fetched.set(`31923:${B}:meetup`, meetup);
    const reaction = ev(
      "r".repeat(64),
      7,
      [
        ["e", note.id],
        ["p", B],
      ],
      "+",
    );
    const another = ev(
      "s".repeat(64),
      7,
      [
        ["e", note.id],
        ["p", B],
      ],
      "🔥",
    );
    const rsvp = ev("v".repeat(64), 31925, [
      ["a", `31923:${B}:meetup`],
      ["status", "accepted"],
      ["d", "x"],
    ]);
    const hits = [reaction, another, rsvp].map(hit);

    const { rerender } = render(<AllResults hits={hits} settled={false} scoreOf={() => null} query="" />);
    // Streaming: nothing asked yet.
    expect(fetchIds).not.toHaveBeenCalled();
    rerender(<AllResults hits={hits} settled scoreOf={() => null} query="" />);

    await waitFor(() =>
      expect(screen.getByTestId(`all-row-${reaction.id}`)).toHaveTextContent("The note people reacted to"),
    );
    expect(screen.getByTestId(`all-row-${rsvp.id}`)).toHaveTextContent("Bitcoin Meetup");
    expect(screen.getByTestId(`all-row-${rsvp.id}`)).toHaveTextContent("Going");
    // One ask for the ids (the shared note once), one for the addresses.
    expect(fetchIds).toHaveBeenCalledTimes(1);
    expect(fetchIds).toHaveBeenCalledWith([note.id]);
    expect(fetchAddrs).toHaveBeenCalledTimes(1);
  });
});
