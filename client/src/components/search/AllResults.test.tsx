// @vitest-environment jsdom
/**
 * The All tab's list asks for what its rows are about — a reaction's note, an
 * RSVP's event — once per settled page, in one batch for ids and one for
 * addresses, and each row quotes its target in a line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";

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
const held = vi.hoisted(() => new Map<string, NostrEvent>());
vi.mock("@/lib/eventStore", async () => ({
  eventStore: {
    ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
    getReplaceable: (kind: number, pubkey: string, d?: string) => held.get(`${kind}:${pubkey}:${d ?? ""}`),
  },
}));
// Profiles on the search relay, answered through its shared lookup queue.
const liveProfiles = vi.hoisted(() => new Map<string, { name?: string; display_name?: string }>());
const askedProfiles = vi.hoisted(() => vi.fn());
vi.mock("@/services/authorProfileQueue", () => ({
  wantProfile: (pubkey: string, onProfile: (p: unknown) => void) => {
    askedProfiles(pubkey);
    const meta = liveProfiles.get(pubkey);
    queueMicrotask(() =>
      onProfile(
        meta ? { id: "0".repeat(64), kind: 0, pubkey, tags: [], content: JSON.stringify(meta), created_at: 1 } : null,
      ),
    );
    return () => {};
  },
}));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
// How a list item reads through its own definition (hooks/useItemView): the concept and its reading,
// looked up per item — here, a book on the Books list.
const itemViews = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/hooks/useItemView", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useItemView")>()),
  useItemView: (item: { id?: string }) =>
    itemViews.get(item.id ?? "") ?? { resolved: null, shown: null, pending: true },
}));

import { AllResults } from "./AllResults";

const A = "a".repeat(64);
const B = "b".repeat(64);
const ev = (id: string, kind: number, tags: string[][] = [], content = "", pubkey = A): NostrEvent =>
  ({ id, kind, pubkey, tags, content, created_at: 1_790_000_000, sig: "s" }) as NostrEvent;
const hit = (event: NostrEvent) => ({ event, author: null, rank: null });

beforeEach(() => {
  itemViews.clear();
  held.clear();
  liveProfiles.clear();
  askedProfiles.mockClear();
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

  it("a reaction to a highlight quotes the marked words, not the word Highlight", async () => {
    const highlight = ev("5".repeat(64), 9802, [], "The words someone marked", B);
    fetched.set(highlight.id, highlight);
    const reaction = ev("6".repeat(64), 7, [["e", highlight.id]], "+");
    render(<AllResults hits={[hit(reaction)]} settled scoreOf={() => null} query="" />);
    await waitFor(() =>
      expect(screen.getByTestId(`all-row-${reaction.id}`)).toHaveTextContent("The words someone marked"),
    );
  });

  it("a highlight from an article says the article once found, and its site until then", async () => {
    const article = ev(
      "3".repeat(64),
      30023,
      [
        ["d", "essay"],
        ["title", "The Essay"],
      ],
      "",
      B,
    );
    const highlight = ev(
      "4".repeat(64),
      9802,
      [
        ["a", `30023:${B}:essay`],
        ["r", "https://essays.example/the-essay"],
      ],
      "Marked words",
    );
    const { rerender } = render(<AllResults hits={[hit(highlight)]} settled={false} scoreOf={() => null} query="" />);
    expect(screen.getByTestId("all-row-facts")).toHaveTextContent("From essays.example");
    fetched.set(`30023:${B}:essay`, article);
    rerender(<AllResults hits={[hit(highlight)]} settled scoreOf={() => null} query="" />);
    await waitFor(() => expect(screen.getByTestId("all-row-source")).toHaveTextContent("From The Essay"));
    expect(screen.queryByTestId("all-row-facts")).toBeNull();
  });

  it("names an author the search could not, from their profile — never an npub when there is a name", async () => {
    liveProfiles.set(A, { display_name: "Alice" });
    const note = ev("n".repeat(64), 1, [], "hello");
    render(<AllResults hits={[hit(note)]} settled scoreOf={() => null} query="" />);
    await waitFor(() => expect(screen.getByTestId(`all-row-${note.id}`)).toHaveTextContent("Alice"));
    expect(askedProfiles).toHaveBeenCalledWith(A);
  });

  it("a held address is not asked of the relays again", async () => {
    const rsvp = ev("v".repeat(64), 31925, [
      ["a", `31923:${B}:meetup`],
      ["status", "accepted"],
      ["d", "x"],
    ]);
    held.set(
      `31923:${B}:meetup`,
      ev(
        "2".repeat(64),
        31923,
        [
          ["d", "meetup"],
          ["title", "Held Meetup"],
        ],
        "",
        B,
      ),
    );
    render(<AllResults hits={[hit(rsvp)]} settled scoreOf={() => null} query="" />);
    await waitFor(() => expect(fetchAddrs).not.toHaveBeenCalled());
  });

  it("a zap receipt is the payer's row, not the wallet service's that signed it", async () => {
    const sk = generateSecretKey();
    const payer = getPublicKey(sk);
    liveProfiles.set(payer, { name: "Payer" });
    const request = JSON.stringify(finalizeEvent({ kind: 9734, created_at: 1, content: "", tags: [["p", B]] }, sk));
    const receipt = ev("z".repeat(64), 9735, [
      ["p", B],
      ["bolt11", "lnbc210n1x"],
      ["description", request],
    ]);
    render(<AllResults hits={[hit(receipt)]} settled scoreOf={() => null} query="" />);
    await waitFor(() => expect(screen.getByTestId(`all-row-${receipt.id}`)).toHaveTextContent("Payer"));
  });

  it("a zap receipt naming a payer its request does not vouch for stays the signer's row", async () => {
    const victim = "c".repeat(64);
    liveProfiles.set(victim, { name: "Victim" });
    const request = JSON.stringify({ kind: 9734, pubkey: victim, content: "", tags: [["p", B]] });
    const receipt = ev("y".repeat(64), 9735, [
      ["p", B],
      ["P", victim],
      ["bolt11", "lnbc210n1x"],
      ["description", request],
    ]);
    render(<AllResults hits={[hit(receipt)]} settled scoreOf={() => null} query="" />);
    await waitFor(() => expect(screen.getByTestId(`all-row-${receipt.id}`)).toBeInTheDocument());
    expect(screen.getByTestId(`all-row-${receipt.id}`)).not.toHaveTextContent("Victim");
  });

  it("an RSVP whose status is an object's own property name draws as a reply", () => {
    const rsvp = ev("x".repeat(64), 31925, [["status", "constructor"]]);
    render(<AllResults hits={[hit(rsvp)]} settled scoreOf={() => null} query="" />);
    expect(screen.getByTestId(`all-row-${rsvp.id}`)).toHaveTextContent("Replied");
  });
});

// A list item reads as its list draws it — a book's title, author and cover, named a Book — not
// as "List item" with whatever short tags it carries.
describe("a list item on the All tab", () => {
  const COVER = "https://covers.openlibrary.org/b/id/1-L.jpg";
  const dune = ev("d".repeat(64), 39999, [
    ["z", "39998:x:books"],
    ["name", "Dune"],
    ["author", "Frank Herbert"],
    ["isbn", "9780441172719"],
  ]);

  it("reads as its definition draws it: title, author, cover, and what it is", () => {
    itemViews.set(dune.id, {
      resolved: { governing: { singular: "Book" } },
      shown: { title: "Dune", summary: "Frank Herbert", image: COVER, imageShape: "portrait" },
      pending: false,
    });
    render(<AllResults hits={[hit(dune)]} settled scoreOf={() => null} query="dune" />);
    const row = screen.getByTestId(`all-row-${dune.id}`);
    expect(row.querySelector('[data-testid="all-row-title"]')).toHaveTextContent("Dune");
    expect(row.querySelector('[data-testid="all-row-body"]')).toHaveTextContent("Frank Herbert");
    expect(row.querySelector('[data-testid="all-row-kind"]')).toHaveTextContent("Book");
    expect(row.querySelector(`img[src="${COVER}"]`)).not.toBeNull();
    expect(row).not.toHaveTextContent("9780441172719");
  });

  it("reads as its tags say while its definition is looked up", () => {
    render(<AllResults hits={[hit(dune)]} settled scoreOf={() => null} query="dune" />);
    expect(screen.getByTestId(`all-row-${dune.id}`).querySelector('[data-testid="all-row-kind"]')).toHaveTextContent(
      "List item",
    );
  });
});
