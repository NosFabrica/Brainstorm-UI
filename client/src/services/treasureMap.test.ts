/**
 * Saving the reader's edited Treasure Map: only their own, never over a newer
 * one, stamped to replace the one it was made on, and counted relay by relay.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { UnlockCancelled } from "@/accounts/local-signer";
import type { MapDraft } from "@/lib/treasureMapEdit";

const ME = "a".repeat(64);
const h = vi.hoisted(() => ({
  account: null as { pubkey: string } | null,
  signAs: vi.fn(),
  fetchTrustProviderList: vi.fn(),
  publishToRelays: vi.fn(),
}));
vi.mock("@/accounts/signing", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  activeAccount: () => h.account,
  signAs: h.signAs,
}));
vi.mock("@/services/nostr", () => ({
  fetchTrustProviderList: h.fetchTrustProviderList,
  publishToRelays: h.publishToRelays,
}));

import { saveTreasureMap } from "./treasureMap";

const map = (id: string, created_at: number, pubkey = ME) =>
  ({ id, pubkey, created_at, kind: 10040, tags: [], content: "", sig: "" }) as NostrEvent;
const BASE = map("1".repeat(64), 1000);
const draft: MapDraft = { kind: 10040, pubkey: ME, content: "", tags: [["3038x", "b".repeat(64), ""]] };

beforeEach(() => {
  vi.clearAllMocks();
  h.account = { pubkey: ME };
  h.fetchTrustProviderList.mockResolvedValue(BASE);
  h.signAs.mockImplementation(async (_account, template) => ({ ...template, id: "2".repeat(64), pubkey: ME }));
  h.publishToRelays.mockResolvedValue({ success: true, accepted: 4, total: 4 });
});

describe("saveTreasureMap", () => {
  it("signs the draft, stamped after the Map it replaces, and publishes it to every relay", async () => {
    vi.spyOn(Date, "now").mockReturnValue(500_000);
    expect(await saveTreasureMap({ viewer: ME, base: BASE, draft })).toEqual({
      outcome: "saved",
      accepted: 4,
      total: 4,
    });
    expect(h.signAs).toHaveBeenCalledWith(h.account, { kind: 10040, content: "", tags: draft.tags, created_at: 1001 });
    expect(h.publishToRelays.mock.calls[0][2]).toMatchObject({ need: Number.POSITIVE_INFINITY });
  });

  it("is partial when some relays took it, and failed when none did", async () => {
    h.publishToRelays.mockResolvedValueOnce({ success: true, accepted: 2, total: 5 });
    expect(await saveTreasureMap({ viewer: ME, base: BASE, draft })).toEqual({
      outcome: "partial",
      accepted: 2,
      total: 5,
    });
    h.publishToRelays.mockResolvedValueOnce({ success: false, error: "blocked", accepted: 0, total: 5 });
    expect(await saveTreasureMap({ viewer: ME, base: BASE, draft })).toEqual({
      outcome: "failed",
      error: "blocked",
      total: 5,
    });
  });

  it("signs nothing over a newer Map", async () => {
    h.fetchTrustProviderList.mockResolvedValue(map("3".repeat(64), 1000));
    expect(await saveTreasureMap({ viewer: ME, base: BASE, draft })).toEqual({ outcome: "changed" });
    expect(h.signAs).not.toHaveBeenCalled();
  });

  it("isn't stopped by a read that finds nothing, and with no Map at all stamps now", async () => {
    vi.spyOn(Date, "now").mockReturnValue(500_000);
    h.fetchTrustProviderList.mockResolvedValue(undefined);
    expect((await saveTreasureMap({ viewer: ME, base: null, draft })).outcome).toBe("saved");
    expect(h.signAs.mock.calls[0][1].created_at).toBe(500);
  });

  it("only ever saves the signed-in reader's own Map", async () => {
    h.account = { pubkey: "c".repeat(64) };
    expect((await saveTreasureMap({ viewer: ME, base: BASE, draft })).outcome).toBe("not-sent");
    h.account = { pubkey: ME };
    expect((await saveTreasureMap({ viewer: ME, base: map(BASE.id, 1000, "d".repeat(64)), draft })).outcome).toBe(
      "not-sent",
    );
    expect(h.signAs).not.toHaveBeenCalled();
  });

  it("says nothing when the reader cancels the signature", async () => {
    h.signAs.mockRejectedValue(new UnlockCancelled());
    expect(await saveTreasureMap({ viewer: ME, base: BASE, draft })).toEqual({ outcome: "not-sent", message: null });
    expect(h.publishToRelays).not.toHaveBeenCalled();
  });
});
