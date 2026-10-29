// @vitest-environment jsdom
/**
 * Reviews of a book, as the books contract has them (docs/dictionary/books-actions.md, #253): the
 * shared record, kind 34259 marked `book`, read from the index (under its `include:spam` lens) and
 * the relays Unbnd publishes to as well — never the hub, which refuses reviews — by the book's
 * address either way a record names it, then their removals. A review, and its removal, go to the
 * reviewer's own write relays and the index; never the hub.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ readListEvents: vi.fn(), signAs: vi.fn(), publishToOutbox: vi.fn() }));
vi.mock("@/services/listReads", () => ({ readListEvents: io.readListEvents }));
vi.mock("@/accounts/signing", () => ({ requireActiveAccount: () => ({ pubkey: "f".repeat(64) }), signAs: io.signAs }));
vi.mock("@/services/tags", () => ({ publishToOutbox: io.publishToOutbox }));
vi.mock("@/lib/relays", () => ({ SEARCH_RELAY: "wss://search.brainstorm.world/" }));

import { fetchBookReviews, publishBookReview, removeBookReview } from "./bookReviews";

const LIBRARIAN = "6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b";
const item = { id: "1".repeat(64), kind: 39999, pubkey: LIBRARIAN, tags: [["d", "ol-ol19722168w"]] };
const BOOK = `39999:${LIBRARIAN}:ol-ol19722168w`;
const ME = "f".repeat(64);
const A = "a".repeat(64);
const now = Math.floor(Date.now() / 1000);
const UNBND_RELAYS = ["wss://nos.lol", "wss://relay.primal.net"];

const review = (id: string, pubkey: string, text: string) => ({
  id,
  kind: 34259,
  pubkey,
  created_at: now - 60,
  content: text,
  tags: [
    ["d", `book:${BOOK}`],
    ["a", BOOK, "wss://dcosl.brainstorm.world"],
    ["m", "book"],
    ["s", "4"],
  ],
});

beforeEach(() => vi.clearAllMocks());

describe("fetchBookReviews", () => {
  it("asks for the book's records by a and by d, then their removals, from the index and Unbnd's relays, and keeps those that stand", async () => {
    io.readListEvents
      .mockResolvedValueOnce([review("r1", A, "Read it twice."), review("r2", ME, "Gone.")])
      .mockResolvedValueOnce([
        {
          id: "x",
          kind: 5,
          pubkey: ME,
          created_at: now,
          content: "",
          tags: [
            ["e", "r2"],
            ["k", "34259"],
          ],
        },
      ]);
    const out = await fetchBookReviews(item);
    expect(out.map((r) => [r.id, r.text, r.rating])).toEqual([["r1", "Read it twice.", 4]]);
    expect(io.readListEvents).toHaveBeenNthCalledWith(
      1,
      [
        { kinds: [34259], "#a": [BOOK], limit: 500 },
        { kinds: [34259], "#d": [BOOK, `book:${BOOK}`], limit: 500 },
      ],
      expect.any(Number),
      UNBND_RELAYS,
    );
    expect(io.readListEvents).toHaveBeenNthCalledWith(
      2,
      [
        { kinds: [5], "#e": ["r1", "r2"] },
        { kinds: [5], "#a": [`34259:${A}:book:${BOOK}`, `34259:${ME}:book:${BOOK}`] },
      ],
      expect.any(Number),
      UNBND_RELAYS,
    );
  });

  it("reads no comments: a kind 1111 is not a book's review", async () => {
    io.readListEvents.mockResolvedValueOnce([]);
    expect(await fetchBookReviews(item)).toEqual([]);
    for (const [filters] of io.readListEvents.mock.calls) {
      for (const f of filters as { kinds: number[] }[]) expect(f.kinds).not.toContain(1111);
    }
  });
});

describe("publishBookReview", () => {
  it("signs the shared record as the active account, editing the one given, and sends it to the reviewer's relays and the index", async () => {
    const previous = { ...review("old", ME, "First go."), tags: [...review("old", ME, "").tags, ["x", "1"]] };
    const signed = { ...review("s1", ME, "Better the second time."), sig: "" };
    io.signAs.mockResolvedValue(signed);
    io.publishToOutbox.mockResolvedValue({ accepted: 2, total: 2 });
    const out = await publishBookReview(
      item,
      { text: "Better the second time.", rating: 5 },
      { title: "The storm before the storm", previous },
    );
    const template = io.signAs.mock.calls[0][1];
    expect(io.signAs.mock.calls[0][0]).toEqual({ pubkey: ME });
    expect(template).toMatchObject({ kind: 34259, content: "Better the second time." });
    expect(template.tags).toContainEqual(["m", "book"]);
    expect(template.tags).toContainEqual(["s", "5"]);
    expect(template.tags).toContainEqual(["x", "1"]);
    expect(io.publishToOutbox).toHaveBeenCalledWith(signed, ["wss://search.brainstorm.world/"]);
    expect(out).toMatchObject({ id: "s1", pubkey: ME, text: "Better the second time.", rating: 4 });
  });
});

describe("removeBookReview", () => {
  it("signs the removal by id and by address and sends it where the review went", async () => {
    const signed = { id: "rm", kind: 5, pubkey: ME, created_at: now, content: "", tags: [], sig: "" };
    io.signAs.mockResolvedValue(signed);
    io.publishToOutbox.mockResolvedValue({ accepted: 1, total: 1 });
    await removeBookReview({ id: "s1", pubkey: ME, tags: review("s1", ME, "").tags });
    expect(io.signAs.mock.calls[0][1].tags).toEqual([
      ["e", "s1"],
      ["a", `34259:${ME}:book:${BOOK}`],
      ["k", "34259"],
    ]);
    expect(io.publishToOutbox).toHaveBeenCalledWith(signed, ["wss://search.brainstorm.world/"]);
  });
});
