// @vitest-environment node
/**
 * Authors' ranks from a scorer's kind 30382s, read from its own relay, and
 * the verified line as the web-of-trust rule. Which scorer — the observer's
 * own, else the house's — is hooks/useLensRanks `useAuthorRanks`
 * (hooks/useWotItems.test.tsx).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const HOUSE_TA = "c".repeat(64);
const VIEWER_TA = "d".repeat(64);
const AVI = "e".repeat(64);
const BOT = "f".repeat(64);
const VIEWER = "b".repeat(64);
const HOUSE_SOURCE = { taPubkey: HOUSE_TA, relay: "wss://house.example" };

const fetchMock = vi.fn();
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: (...a: unknown[]) => fetchMock(...a) }));

import { authorRanksFrom, inWebOfTrust, readAuthorRanks, VERIFIED_RANK } from "./wotRanks";

const assertion = (subject: string, rank: number, created_at = 1, pubkey = HOUSE_TA) => ({
  kind: 30382,
  pubkey,
  created_at,
  tags: [
    ["d", subject],
    ["rank", String(rank)],
  ],
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe("readAuthorRanks", () => {
  it("asks the scorer's relay for its assertions about each author, once", async () => {
    fetchMock.mockResolvedValue([assertion(AVI, 57)]);
    expect(await readAuthorRanks(HOUSE_SOURCE, [AVI, BOT, AVI, ""])).toEqual([assertion(AVI, 57)]);
    expect(fetchMock).toHaveBeenCalledWith(
      { kinds: [30382], authors: [HOUSE_TA], "#d": [AVI, BOT] },
      ["wss://house.example"],
      8000,
    );
  });

  it("a relay that fails ranks nobody rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await readAuthorRanks(HOUSE_SOURCE, [AVI])).toEqual([]);
  });
});

describe("authorRanksFrom", () => {
  it("ranks the authors the scorer assessed; unassessed ones are absent", () => {
    const ranks = authorRanksFrom([assertion(AVI, 57)], HOUSE_TA, [AVI, BOT]);
    expect(ranks.get(AVI)).toBe(57);
    expect(ranks.has(BOT)).toBe(false);
  });

  it("the newest assertion about an author wins", () => {
    expect(authorRanksFrom([assertion(AVI, 90, 1), assertion(AVI, 1, 2)], HOUSE_TA, [AVI]).get(AVI)).toBe(1);
  });

  // Whatever answered the read, only the scorer's own assertions about the
  // authors asked count: a relay's stray 30382 from another key ranked nobody it should.
  it("counts only the scorer's assertions about the authors asked", () => {
    const events = [assertion(AVI, 99, 5, VIEWER_TA), assertion(BOT, 99, 5), assertion(AVI, 1, 1)];
    expect(authorRanksFrom(events, HOUSE_TA, [AVI])).toEqual(new Map([[AVI, 1]]));
  });
});

describe("inWebOfTrust", () => {
  it("is the verified line, rank 2", () => {
    expect(VERIFIED_RANK).toBe(2);
    const ranks = new Map([
      [AVI, 2],
      [BOT, 1],
    ]);
    expect(inWebOfTrust(ranks, AVI)).toBe(true);
    expect(inWebOfTrust(ranks, BOT)).toBe(false);
    expect(inWebOfTrust(ranks, VIEWER)).toBe(false); // unranked is not in it
  });
});
