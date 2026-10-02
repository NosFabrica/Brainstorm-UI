// @vitest-environment node
/**
 * The synced chat prefs (lib/dm/prefsSync) name the rooms you pinned, muted and
 * accepted — that is, who you talk to. They may only ever leave the device as
 * NIP-44 ciphertext to your own key, and must not leave it at all when that
 * can't be done.
 *
 * Node, not jsdom: the events are really signed and really encrypted, and jsdom's
 * foreign-realm Uint8Array fails @noble's checks (see `test/setup.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY } from "rxjs";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";

const publish = vi.fn();
const signAs = vi.fn();
const activeAccount = vi.fn();
const requestNewestWithReach = vi.fn();

vi.mock("@/lib/relayRequest", async (original) => ({
  ...(await original<typeof import("@/lib/relayRequest")>()),
  requestNewestWithReach: (...args: unknown[]) => requestNewestWithReach(...args),
}));

vi.mock("@/lib/relayRouting", async (original) => ({
  ...(await original<typeof import("@/lib/relayRouting")>()),
  outboxRelays: async () => ["wss://r0", "wss://r1", "wss://r2"],
}));

vi.mock("@/lib/relayPool", () => ({
  pool: { publish: (...args: unknown[]) => publish(...args), request: () => EMPTY },
}));

vi.mock("@/accounts/signing", async (original) => ({
  ...(await original<typeof import("@/accounts/signing")>()),
  activeAccount: () => activeAccount(),
  signAs: (...args: unknown[]) => signAs(...args),
}));

const SECRET = new Uint8Array(32).fill(1);
const PUBKEY = getPublicKey(SECRET);
const ROOM = `${"b".repeat(64)},${PUBKEY}`;
const toSelf = nip44.getConversationKey(SECRET, PUBKEY);

const account = (withNip44: boolean) => ({
  pubkey: PUBKEY,
  type: "test",
  nip44: withNip44
    ? {
        encrypt: async (_to: string, plain: string) => nip44.encrypt(plain, toSelf),
        decrypt: async (_from: string, cipher: string) => nip44.decrypt(cipher, toSelf),
      }
    : undefined,
});

let nostr: typeof import("./nostr");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);
  signAs.mockImplementation(async (_account: unknown, template: { kind: number }) =>
    finalizeEvent({ created_at: 0, tags: [], content: "", ...template } as never, SECRET),
  );
  nostr = await import("./nostr");
});

const blob = { v: 1, updated_at: 123, pinned: [ROOM], muted: [ROOM], accepted: [ROOM] };

describe("publishing the synced chat prefs", () => {
  it("puts only ciphertext on the wire, readable with the account's own key", async () => {
    activeAccount.mockReturnValue(account(true));

    const res = await nostr.publishAlertPrefs(blob, nostr.DM_PREFS_D_TAG, { background: true });

    expect(res.success).toBe(true);
    const event = publish.mock.calls[0][1] as { kind: number; tags: string[][]; content: string };
    expect(event.kind).toBe(30078);
    expect(event.tags).toEqual([["d", "brainstorm.world/dm-prefs"]]);
    // Nothing about the rooms is legible: not the blob, not a single pubkey in it.
    expect(event.content).not.toContain("b".repeat(64));
    expect(event.content).not.toContain("pinned");
    expect(() => JSON.parse(event.content)).toThrow();
    expect(JSON.parse(nip44.decrypt(event.content, toSelf))).toEqual(blob);
  });

  it("publishes nothing when the account can't encrypt", async () => {
    activeAccount.mockReturnValue(account(false));

    const res = await nostr.publishAlertPrefs(blob, nostr.DM_PREFS_D_TAG, { background: true });

    expect(res).toEqual({ success: false, error: "Could not encrypt" });
    expect(signAs).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("reading the synced chat prefs before replacing them", () => {
  const asked = ["wss://r0", "wss://r1", "wss://r2"];
  const reach = (answered: string[]) => ({ asked, answered });
  const signed = async () => {
    const content = nip44.encrypt(JSON.stringify(blob), toSelf);
    return finalizeEvent({ kind: 30078, created_at: 50, tags: [["d", "brainstorm.world/dm-prefs"]], content }, SECRET);
  };

  beforeEach(() => activeAccount.mockReturnValue(account(true)));

  it("decrypts the account's copy, asking the relays for exactly that d tag", async () => {
    const event = await signed();
    requestNewestWithReach.mockResolvedValue({ newest: event, reach: reach(asked) });

    const got = await nostr.fetchPrivateAppData(nostr.DM_PREFS_D_TAG);

    expect(got).toEqual({ status: "found", id: event.id, createdAt: 50, data: blob });
    expect(requestNewestWithReach.mock.calls[0][1]).toEqual({
      kinds: [30078],
      authors: [PUBKEY],
      "#d": ["brainstorm.world/dm-prefs"],
      limit: 1,
    });
  });

  it("calls it absent only when most relays answered", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reach(asked.slice(0, 2)) });
    expect(await nostr.fetchPrivateAppData(nostr.DM_PREFS_D_TAG)).toEqual({ status: "absent" });

    requestNewestWithReach.mockResolvedValue({ newest: undefined, reach: reach(asked.slice(0, 1)) });
    expect(await nostr.fetchPrivateAppData(nostr.DM_PREFS_D_TAG)).toEqual({ status: "unknown" });
  });

  it("calls a copy it can't decrypt unknown, never absent", async () => {
    requestNewestWithReach.mockResolvedValue({ newest: await signed(), reach: reach(asked) });
    activeAccount.mockReturnValue(account(false));
    expect(await nostr.fetchPrivateAppData(nostr.DM_PREFS_D_TAG)).toEqual({ status: "unknown" });
  });

  it("skips the decrypt for a copy it has already seen", async () => {
    const event = await signed();
    const decrypt = vi.fn();
    activeAccount.mockReturnValue({ ...account(true), nip44: { encrypt: vi.fn(), decrypt } });
    requestNewestWithReach.mockResolvedValue({ newest: event, reach: reach(asked) });

    const got = await nostr.fetchPrivateAppData(nostr.DM_PREFS_D_TAG, { knownId: event.id });

    expect(got).toEqual({ status: "unchanged", id: event.id, createdAt: 50 });
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("stamps the publish with the created_at it's given", async () => {
    await nostr.publishAlertPrefs(blob, nostr.DM_PREFS_D_TAG, { background: true, createdAt: 777 });
    expect((publish.mock.calls[0][1] as { created_at: number }).created_at).toBe(777);
  });
});
