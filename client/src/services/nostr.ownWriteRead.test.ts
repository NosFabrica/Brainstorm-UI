// @vitest-environment node
/**
 * Reads after our own publish used to return the copy loaded earlier: prefs
 * reverted on screen, an un-ignore was undone on re-hydrate, a replaced 10040
 * still named the old provider. Real store, real loaders; only the relays and
 * the signer are faked.
 *
 * Node, not jsdom: the events are really signed so the store will verify them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY } from "rxjs";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const publish = vi.fn();
const request = vi.fn(() => EMPTY);
const signAs = vi.fn();
const activeAccount = vi.fn();

vi.mock("@/lib/relayPool", () => ({
  pool: {
    publish: (...args: unknown[]) => publish(...args),
    request: (...args: unknown[]) => request(...(args as [])),
  },
}));

vi.mock("@/accounts/signing", async (original) => ({
  ...(await original<typeof import("@/accounts/signing")>()),
  activeAccount: () => activeAccount(),
  signAs: (...args: unknown[]) => signAs(...args),
  canSignSilently: async () => true,
  encryptToSelf: async (_account: unknown, plain: string) => `enc:${plain}`,
  decryptFromSelf: async (_account: unknown, cipher: string) => cipher.replace(/^enc:/, ""),
}));

const SECRET = new Uint8Array(32).fill(3);
const PUBKEY = getPublicKey(SECRET);
const PREFS_D = "brainstorm.world/profile-prefs";

const prefsEvent = (createdAt: number, prefs: unknown) =>
  finalizeEvent({ kind: 30078, created_at: createdAt, tags: [["d", PREFS_D]], content: JSON.stringify(prefs) }, SECRET);

const alertPrefsEvent = (createdAt: number, prefs: unknown) =>
  finalizeEvent(
    {
      kind: 30078,
      created_at: createdAt,
      tags: [["d", "brainstorm.world/alert-prefs"]],
      content: `enc:${JSON.stringify(prefs)}`,
    },
    SECRET,
  );

const providerList = (createdAt: number, provider: string) =>
  finalizeEvent(
    { kind: 10040, created_at: createdAt, tags: [["30382:rank", provider, "wss://nip85.example"]], content: "" },
    SECRET,
  );

let nostr: typeof import("./nostr");
let store: typeof import("@/lib/eventStore");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  activeAccount.mockReturnValue({ pubkey: PUBKEY, type: "test" });
  let clock = 1000;
  signAs.mockImplementation(async (_account: unknown, template: object) =>
    finalizeEvent({ created_at: ++clock, tags: [], content: "", ...template } as never, SECRET),
  );
  nostr = await import("./nostr");
  store = await import("@/lib/eventStore");
  expect(nostr.PROFILE_PREFS_D_TAG).toBe(PREFS_D);
  store.eventStore.add(prefsEvent(500, { theme: "old" }));
});

const readRequests = () => request.mock.calls.filter((call) => JSON.stringify(call).includes('"kinds":[30078]')).length;

describe("profile prefs after our own save", () => {
  it("reads back the saved prefs, without asking a relay", async () => {
    publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);

    expect((await nostr.publishProfilePrefs({ theme: "new" })).success).toBe(true);
    const before = readRequests();

    expect(await nostr.fetchProfilePrefs(PUBKEY)).toEqual({ theme: "new" });
    expect(readRequests()).toBe(before);
  });

  it("keeps the old prefs when no relay accepted the save", async () => {
    publish.mockResolvedValue([{ ok: false, from: "wss://r0", message: "blocked" }]);

    expect((await nostr.publishProfilePrefs({ theme: "new" })).success).toBe(false);

    expect(await nostr.fetchProfilePrefs(PUBKEY)).toEqual({ theme: "old" });
  });
});

describe("alert prefs after our own save", () => {
  it("reads back an un-ignore instead of the ignore loaded earlier", async () => {
    store.eventStore.add(alertPrefsEvent(500, { ignored: ["x"] }));
    publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);

    expect((await nostr.publishAlertPrefs({ ignored: [] })).success).toBe(true);

    expect(await nostr.fetchAlertPrefs()).toEqual({ ignored: [] });
  });
});

describe("a replaced trust-provider list", () => {
  it("reads as the new provider while no relay answers", async () => {
    const OLD = "c".repeat(64);
    const NEW = "d".repeat(64);
    store.eventStore.add(providerList(500, OLD));
    publish.mockResolvedValue([{ ok: true, from: "wss://r0", message: "" }]);

    expect((await nostr.publishToRelays(providerList(600, NEW))).success).toBe(true);

    const read = await nostr.fetchTrustProviderList(PUBKEY, 50);
    expect(read?.tags[0]?.[1]).toBe(NEW);
  });
});
