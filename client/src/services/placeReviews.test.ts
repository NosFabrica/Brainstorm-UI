// @vitest-environment jsdom
/**
 * Reviews of a place, on the relays (the contract's sections 4 to 6): asked
 * for by the place's address either way it is written, with any removals of
 * them; published — and removed — to the reviewer's relays, the hub and the
 * index, signed as the active account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  readListEvents: vi.fn(),
  signAs: vi.fn(),
  publishToOutbox: vi.fn(),
  resolveTrustSource: vi.fn(),
  fetchEventsByFilter: vi.fn(),
}));
vi.mock("@/services/trustSource", () => ({ resolveTrustSource: io.resolveTrustSource }));
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: io.fetchEventsByFilter }));
vi.mock("@/services/listReads", () => ({ readListEvents: io.readListEvents }));
vi.mock("@/accounts/signing", () => ({ requireActiveAccount: () => ({ pubkey: "f".repeat(64) }), signAs: io.signAs }));
vi.mock("@/services/tags", () => ({ publishToOutbox: io.publishToOutbox }));
vi.mock("@/lib/relays", () => ({ SEARCH_RELAY: "wss://search.brainstorm.world/" }));
vi.mock("@/config/dictionary", () => ({ dictionaryRelays: () => ["wss://dcosl.brainstorm.world"] }));

import { fetchLensRanks, fetchPlaceReviews, publishPlaceReview, removePlaceReview } from "./placeReviews";

const CURATOR = "4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64";
const item = { id: "1".repeat(64), kind: 39999, pubkey: CURATOR, tags: [["d", "osm-node-11330857543"]] };
const PLACE = `39999:${CURATOR}:osm-node-11330857543`;
const A = "a".repeat(64);
const ME = "f".repeat(64);
const now = Math.floor(Date.now() / 1000);

const review = (id: string, pubkey: string, content: string) => ({
  id,
  kind: 34259,
  pubkey,
  created_at: now - 60,
  content,
  tags: [
    ["d", `place:${PLACE}`],
    ["a", PLACE],
    ["m", "place"],
    ["s", "4"],
  ],
});

beforeEach(() => vi.clearAllMocks());

describe("fetchPlaceReviews", () => {
  it("asks for the records of the place by `a` and by `d`, then for their removals, and keeps the ones that stand", async () => {
    io.readListEvents
      .mockResolvedValueOnce([review("r1", A, "Good."), review("r2", ME, "Gone.")])
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
    const out = await fetchPlaceReviews(item);
    expect(out.map((r) => [r.id, r.text, r.rating])).toEqual([["r1", "Good.", 4]]);
    expect(io.readListEvents).toHaveBeenNthCalledWith(
      1,
      [
        { kinds: [34259], "#a": [PLACE], limit: 500 },
        { kinds: [34259], "#d": [PLACE, `place:${PLACE}`], limit: 500 },
      ],
      expect.any(Number),
      // Beside the index: the hub, and the relays Regulars publishes reviews to as well.
      ["wss://dcosl.brainstorm.world", "wss://nos.lol", "wss://relay.primal.net"],
    );
    expect(io.readListEvents).toHaveBeenNthCalledWith(
      2,
      [
        { kinds: [5], "#e": ["r1", "r2"] },
        { kinds: [5], "#a": [`34259:${A}:place:${PLACE}`, `34259:${ME}:place:${PLACE}`] },
      ],
      expect.any(Number),
      ["wss://dcosl.brainstorm.world", "wss://nos.lol", "wss://relay.primal.net"],
    );
  });

  it("asks for no removals when the place has no reviews", async () => {
    io.readListEvents.mockResolvedValueOnce([]);
    expect(await fetchPlaceReviews(item)).toEqual([]);
    expect(io.readListEvents).toHaveBeenCalledTimes(1);
  });
});

describe("publishPlaceReview", () => {
  it("signs the record as the active account and publishes it to the reviewer's relays and the index, never the hub", async () => {
    const signed = { ...review("s1", ME, "Best pizza on the key."), sig: "" };
    io.signAs.mockResolvedValue(signed);
    io.publishToOutbox.mockResolvedValue({ accepted: 2, total: 3 });
    const out = await publishPlaceReview(
      item,
      { text: "Best pizza on the key.", rating: 4, price: 2, paid: null, photos: [] },
      { name: "Jacafé" },
    );
    expect(io.signAs).toHaveBeenCalledWith(
      { pubkey: ME },
      expect.objectContaining({
        kind: 34259,
        content: "Best pizza on the key.",
        tags: expect.arrayContaining([
          ["d", `place:${PLACE}`],
          ["alt", "Review of Jacafé: 4 of 5 stars"],
        ]),
      }),
    );
    expect(io.publishToOutbox).toHaveBeenCalledWith(signed, ["wss://search.brainstorm.world/"]);
    expect(out).toMatchObject({ id: "s1", pubkey: ME, text: "Best pizza on the key.", rating: 4 });
  });

  it("writes a change at the `d` of the review it replaces, keeping what this page doesn't set", async () => {
    io.signAs.mockImplementation(async (_account, template) => ({
      ...template,
      id: "s2",
      pubkey: ME,
      created_at: now,
    }));
    io.publishToOutbox.mockResolvedValue({ accepted: 1, total: 3 });
    const previous = {
      ...review("r0", ME, "Old."),
      tags: [
        ["d", PLACE],
        ["s", "3"],
        ["t", "brunch"],
      ],
    };
    await publishPlaceReview(
      item,
      { text: "New.", rating: 5, price: null, paid: null, photos: [] },
      { name: "Jacafé", previous },
    );
    const template = io.signAs.mock.calls[0][1];
    expect(template.tags).toContainEqual(["d", PLACE]);
    expect(template.tags).toContainEqual(["t", "brunch"]);
  });
});

describe("removePlaceReview", () => {
  it("signs the removal of the reader's review and sends it wherever the review went", async () => {
    const signed = { id: "del", kind: 5, pubkey: ME, created_at: now, content: "", tags: [], sig: "" };
    io.signAs.mockResolvedValue(signed);
    io.publishToOutbox.mockResolvedValue({ accepted: 3, total: 3 });
    await removePlaceReview({ id: "r2", pubkey: ME, tags: [["d", `place:${PLACE}`]] });
    expect(io.signAs).toHaveBeenCalledWith(
      { pubkey: ME },
      {
        kind: 5,
        content: "",
        tags: [
          ["e", "r2"],
          ["a", `34259:${ME}:place:${PLACE}`],
          ["k", "34259"],
        ],
      },
    );
    expect(io.publishToOutbox).toHaveBeenCalledWith(signed, ["wss://search.brainstorm.world/"]);
  });
});

describe("fetchLensRanks", () => {
  const SCORER = "e".repeat(64);

  it("reads the ranks the observer's chosen scorer gives the reviewers, from the scorer's relay", async () => {
    io.resolveTrustSource.mockResolvedValue({ taPubkey: SCORER, relay: "wss://scores.brainstorm.world" });
    io.fetchEventsByFilter.mockResolvedValue([
      {
        id: "k",
        kind: 30382,
        pubkey: SCORER,
        created_at: now,
        content: "",
        tags: [
          ["d", A],
          ["rank", "98"],
        ],
      },
    ]);
    const ranks = await fetchLensRanks(CURATOR, [A]);
    expect(ranks).toEqual(new Map([[A, 98]]));
    expect(io.resolveTrustSource).toHaveBeenCalledWith(CURATOR);
    expect(io.fetchEventsByFilter).toHaveBeenCalledWith({ kinds: [30382], authors: [SCORER], "#d": [A] }, [
      "wss://scores.brainstorm.world",
    ]);
  });

  it("is null for an observer who names no scorer, and asks nothing for nobody", async () => {
    io.resolveTrustSource.mockResolvedValue(null);
    expect(await fetchLensRanks(CURATOR, [A])).toBeNull();
    expect(await fetchLensRanks(CURATOR, [])).toEqual(new Map());
    expect(io.fetchEventsByFilter).not.toHaveBeenCalled();
  });
});
