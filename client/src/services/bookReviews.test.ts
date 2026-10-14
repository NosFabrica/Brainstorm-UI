// @vitest-environment jsdom
/**
 * Reviews of a book come from wherever list events live — the hub and our
 * index, both at once (services/listReads) — and a new one is signed as the
 * active account and published where list events go.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ readListEvents: vi.fn(), signAs: vi.fn(), publishTagEvent: vi.fn() }));
vi.mock("@/services/listReads", () => ({ readListEvents: io.readListEvents }));
vi.mock("@/accounts/signing", () => ({ requireActiveAccount: () => ({ pubkey: "f".repeat(64) }), signAs: io.signAs }));
vi.mock("@/services/tags", () => ({ publishTagEvent: io.publishTagEvent }));
vi.mock("@/config/dictionary", () => ({ dictionaryRelays: () => ["wss://dcosl.brainstorm.world"] }));

import { fetchBookReviews, publishBookReview } from "./bookReviews";

const item = {
  id: "1".repeat(64),
  kind: 39999,
  pubkey: "4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64",
  tags: [["d", "osm-node-13302615652"]],
};
const PLACE = `39999:${item.pubkey}:osm-node-13302615652`;

beforeEach(() => vi.clearAllMocks());

describe("fetchBookReviews", () => {
  it("asks for comments rooted on the place, newest first, and keeps the ones that are reviews", async () => {
    io.readListEvents.mockResolvedValue([
      { id: "r1", kind: 1111, pubkey: "a".repeat(64), created_at: 5, content: "Good.", tags: [["A", PLACE]] },
      { id: "r2", kind: 1111, pubkey: "b".repeat(64), created_at: 9, content: "Great.", tags: [["a", PLACE]] },
      {
        id: "x",
        kind: 1111,
        pubkey: "c".repeat(64),
        created_at: 7,
        content: "Elsewhere.",
        tags: [["A", "39999:z:other"]],
      },
    ]);
    const out = await fetchBookReviews(item);
    expect(out.map((r) => [r.id, r.text])).toEqual([
      ["r2", "Great."],
      ["r1", "Good."],
    ]);
    expect(io.readListEvents).toHaveBeenCalledWith(
      [
        { kinds: [1111], "#A": [PLACE], limit: 200 },
        { kinds: [1111], "#a": [PLACE], limit: 200 },
      ],
      expect.any(Number),
    );
  });
});

describe("publishBookReview", () => {
  it("signs the review as the active account, publishes it, and hands back the review as the page shows it", async () => {
    const signed = {
      id: "s".repeat(64),
      kind: 1111,
      pubkey: "f".repeat(64),
      created_at: 42,
      content: "Best pizza on the key.",
      tags: [
        ["A", PLACE, "wss://dcosl.brainstorm.world"],
        ["price", "2"],
      ],
      sig: "",
    };
    io.signAs.mockResolvedValue(signed);
    io.publishTagEvent.mockResolvedValue({ accepted: 1, total: 2 });
    const out = await publishBookReview(item, { text: "Best pizza on the key.", price: 2, paid: null, photos: [] });
    expect(io.signAs).toHaveBeenCalledWith(
      { pubkey: "f".repeat(64) },
      expect.objectContaining({ kind: 1111, content: "Best pizza on the key." }),
    );
    expect(io.publishTagEvent).toHaveBeenCalledWith(signed);
    expect(out).toMatchObject({
      id: "s".repeat(64),
      pubkey: "f".repeat(64),
      at: 42,
      text: "Best pizza on the key.",
      price: 2,
    });
  });
});
