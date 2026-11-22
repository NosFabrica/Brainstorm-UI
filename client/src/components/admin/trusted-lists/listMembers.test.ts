/**
 * Reading a published Trusted List back: from the relay the server names for
 * the observer's lists, the newest copy at the list's address, members and all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nip19 } from "nostr-tools";

const getSetupRows = vi.fn<(pubkey: string) => Promise<string[][]>>();
vi.mock("@/services/api", () => ({ apiClient: { getSetupRows: (pk: string) => getSetupRows(pk) } }));
const requestNewest = vi.fn();
vi.mock("@/lib/relayRequest", () => ({ requestNewest: (...a: unknown[]) => requestNewest(...a) }));

import { loadTrustedList } from "./listMembers";

const OBSERVER = "b".repeat(64);
const SIGNER = "c".repeat(64);
const MEMBER = "d".repeat(64);
const D_TAG = "tl-tag-bbbbbbbb-aaaaaaaa-podcaster";
const TL_RELAY = "wss://tl.example";
const TA_RELAY = "wss://ta.example";
const event = (over: Record<string, unknown> = {}) => ({
  id: "1".repeat(64),
  kind: 30392,
  pubkey: SIGNER,
  created_at: 1,
  sig: "",
  tags: [
    ["d", D_TAG],
    ["p", MEMBER, "", "87"],
  ],
  content: JSON.stringify({ members: [{ pubkey: MEMBER, endorsements: 3, disputes: 0, score: 87 }] }),
  ...over,
});
const want = { observer: OBSERVER, signingPubkey: SIGNER, dTag: D_TAG };

describe("loadTrustedList", () => {
  beforeEach(() => {
    getSetupRows.mockReset();
    requestNewest.mockReset();
  });

  it("reads the newest copy from the relay /setup names for lists, with its members and a link", async () => {
    getSetupRows.mockResolvedValue([
      ["30382:rank", SIGNER, TA_RELAY],
      ["30392", SIGNER, TL_RELAY],
    ]);
    requestNewest.mockResolvedValue(event());

    const list = await loadTrustedList(want);

    expect(requestNewest).toHaveBeenCalledWith(
      [TL_RELAY],
      { kinds: [30392], authors: [SIGNER], "#d": [D_TAG] },
      expect.any(Number),
    );
    expect(list?.members).toEqual([{ pubkey: MEMBER, score: 87, endorsements: 3, disputes: 0 }]);
    expect(list?.retracted).toBe(false);
    const decoded = nip19.decode(list!.naddr);
    expect(decoded.type).toBe("naddr");
    expect(decoded.data).toMatchObject({ kind: 30392, pubkey: SIGNER, identifier: D_TAG });
  });

  // TRUSTED_LIST_RELAY falls back to the TA relay on the server; so do we.
  it("uses the Trusted Assertions relay when /setup names none for lists", async () => {
    getSetupRows.mockResolvedValue([["30382:rank", SIGNER, TA_RELAY]]);
    requestNewest.mockResolvedValue(event());

    await loadTrustedList(want);

    expect(requestNewest.mock.calls[0][0]).toEqual([TA_RELAY]);
  });

  it("reads members from the p tags when the content carries none", async () => {
    getSetupRows.mockResolvedValue([["30392", SIGNER, TL_RELAY]]);
    requestNewest.mockResolvedValue(event({ content: "" }));

    const list = await loadTrustedList(want);

    expect(list?.members).toEqual([{ pubkey: MEMBER, score: 87 }]);
  });

  it("reads a retracted list as having no members", async () => {
    getSetupRows.mockResolvedValue([["30392", SIGNER, TL_RELAY]]);
    requestNewest.mockResolvedValue(
      event({
        tags: [
          ["d", D_TAG],
          ["status", "retracted"],
        ],
        content: "",
      }),
    );

    const list = await loadTrustedList(want);

    expect(list?.retracted).toBe(true);
    expect(list?.members).toEqual([]);
  });

  it("says when the relay doesn't have it", async () => {
    getSetupRows.mockResolvedValue([["30392", SIGNER, TL_RELAY]]);
    requestNewest.mockResolvedValue(undefined);

    expect(await loadTrustedList(want)).toBeNull();
  });
});

// ADR trusted-lists/0002 D3, D5: notes by id (30393), addressable things by coordinate (30394).
describe("loadTrustedList for lists of tagged notes and items", () => {
  const NOTE = "e".repeat(64);
  const ITEM = `39999:${"a".repeat(64)}:the-hobbit`;
  const NOTES_D = "tl-tag-notes-bbbbbbbb-aaaaaaaa-espresso-k1";
  const ITEMS_D = "tl-tag-items-bbbbbbbb-aaaaaaaa-espresso-dlaaaaaaaa-books-1234abcd";

  beforeEach(() => {
    getSetupRows.mockReset();
    requestNewest.mockReset();
    getSetupRows.mockResolvedValue([
      ["30392", SIGNER, TL_RELAY],
      ["30393", SIGNER, TL_RELAY],
      ["30394", SIGNER, TL_RELAY],
    ]);
  });

  it("reads a list of notes at its own kind, with its notes as members and a link of that kind", async () => {
    requestNewest.mockResolvedValue(
      event({
        kind: 30393,
        tags: [
          ["d", NOTES_D],
          ["tagging-target", "1"],
          ["e", NOTE, "", "64"],
        ],
        content: JSON.stringify({ members: [{ id: NOTE, endorsements: 2, disputes: 1, score: 64 }] }),
      }),
    );

    const list = await loadTrustedList({ ...want, dTag: NOTES_D, kind: 30393 });

    expect(requestNewest).toHaveBeenCalledWith(
      [TL_RELAY],
      { kinds: [30393], authors: [SIGNER], "#d": [NOTES_D] },
      expect.any(Number),
    );
    expect(list?.kind).toBe(30393);
    expect(list?.members).toEqual([{ id: NOTE, score: 64, endorsements: 2, disputes: 1 }]);
    expect(nip19.decode(list!.naddr).data).toMatchObject({ kind: 30393, pubkey: SIGNER, identifier: NOTES_D });
  });

  it("reads a list of items with their coordinates as members", async () => {
    requestNewest.mockResolvedValue(
      event({
        kind: 30394,
        tags: [
          ["d", ITEMS_D],
          ["a", ITEM, "", "90"],
        ],
        content: JSON.stringify({ members: [{ address: ITEM, endorsements: 4, disputes: 0, score: 90 }] }),
      }),
    );

    const list = await loadTrustedList({ ...want, dTag: ITEMS_D, kind: 30394 });

    expect(list?.members).toEqual([{ address: ITEM, score: 90, endorsements: 4, disputes: 0 }]);
    expect(nip19.decode(list!.naddr).data).toMatchObject({ kind: 30394, identifier: ITEMS_D });
  });

  // A Tapestry 30393 points back at its tag with an `a` and a `p`: neither is a member.
  it("reads only the kind's own member tags when the content carries none", async () => {
    requestNewest.mockResolvedValue(
      event({
        kind: 30393,
        tags: [
          ["d", NOTES_D],
          ["a", `39999:${SIGNER}:espresso`],
          ["p", MEMBER],
          ["e", NOTE, "", "64"],
          ["e", "not-an-id"],
        ],
        content: JSON.stringify({ notes: [] }),
      }),
    );

    const list = await loadTrustedList({ ...want, dTag: NOTES_D, kind: 30393 });

    expect(list?.members).toEqual([{ id: NOTE, score: 64 }]);
  });

  it("asks the relay /setup names for the list's own kind", async () => {
    getSetupRows.mockResolvedValue([
      ["30392", SIGNER, TL_RELAY],
      ["30394", SIGNER, "wss://items.example"],
    ]);
    requestNewest.mockResolvedValue(undefined);

    await loadTrustedList({ ...want, dTag: ITEMS_D, kind: 30394 });

    expect(requestNewest.mock.calls[0][0]).toEqual(["wss://items.example"]);
  });
});
