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
  tags: [["d", D_TAG], ["p", MEMBER, "", "87"]],
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
    getSetupRows.mockResolvedValue([["30382:rank", SIGNER, TA_RELAY], ["30392", SIGNER, TL_RELAY]]);
    requestNewest.mockResolvedValue(event());

    const list = await loadTrustedList(want);

    expect(requestNewest).toHaveBeenCalledWith([TL_RELAY], { kinds: [30392], authors: [SIGNER], "#d": [D_TAG] }, expect.any(Number));
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
    requestNewest.mockResolvedValue(event({ tags: [["d", D_TAG], ["status", "retracted"]], content: "" }));

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
