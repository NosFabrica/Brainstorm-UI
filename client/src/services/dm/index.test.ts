// @vitest-environment node
/**
 * Which engine runs: one per Active Account row, not per pubkey. Two rows can hold
 * one identity (an extension row and a local row); each opens and seals with its
 * own signer, so switching between them is a switch of engine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

const engines: { pubkey: string; account: { pubkey: string }; stop: ReturnType<typeof vi.fn> }[] = [];

vi.mock("./engine", () => ({
  DmEngine: class {
    readonly pubkey: string;
    readonly stop = vi.fn();
    constructor(readonly account: { pubkey: string }) {
      this.pubkey = account.pubkey;
      engines.push(this as never);
    }
    start = async () => {};
  },
}));
vi.mock("@/lib/dm/cache", () => ({ dmCacheBackend: () => ({}), deviceSealer: {} }));
vi.mock("@/lib/dm/prefsSync", () => ({ hydrateDmPrefs: async () => {}, startDmPrefsSync: () => () => {} }));
vi.mock("@/lib/dm/prefs", () => ({ ensureReadFloor: () => {} }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: () => {} } }));
vi.mock("@/services/api", () => ({ apiClient: {} }));
vi.mock("@/services/nostr", () => ({ publishToRelays: async () => ({ success: true }) }));
vi.mock("@/services/blossom", () => ({ publishBlossomServers: async () => {}, uploadToBlossom: async () => "" }));

type Row = { id: string; pubkey: string; nip44?: unknown; signEvent: () => Promise<never> };
const active$ = new BehaviorSubject<Row | undefined>(undefined);
vi.mock("@/accounts", () => ({
  accountManager: {
    get active() {
      return active$.value;
    },
    active$,
  },
}));

const { startDirectMessages, dmEngine, engineOptionsFor } = await import("./index");
const { AmberAccount } = await import("@/accounts/amber");

const PK = "a".repeat(64);
const row = (id: string, pubkey = PK): Row => ({ id, pubkey, signEvent: async () => Promise.reject() as never });

beforeEach(() => {
  engines.length = 0;
  active$.next(undefined);
});

describe("startDirectMessages", () => {
  it("starts a new engine when the active row changes, even to another row of the same identity", () => {
    const extensionRow = row("extension-row");
    const localRow = row("local-row");
    active$.next(extensionRow);
    const stop = startDirectMessages();
    expect(engines).toHaveLength(1);

    active$.next(localRow);
    expect(engines).toHaveLength(2);
    expect(engines[0].stop).toHaveBeenCalledTimes(1);
    expect(dmEngine()).toBe(engines[1]);
    stop();
  });

  it("keeps the running engine when the same row is active again", () => {
    const only = row("only-row");
    active$.next(only);
    const stop = startDirectMessages();
    active$.next(only);
    expect(engines).toHaveLength(1);
    expect(engines[0].stop).not.toHaveBeenCalled();
    stop();
    expect(engines[0].stop).toHaveBeenCalledTimes(1);
    expect(dmEngine()).toBeNull();
  });
});

describe("opening wraps through Amber", () => {
  // Every request is an app switch of up to a minute. Two at a time, the second sat in
  // the account's queue behind the first's two switches, ran out the 45s wrap deadline
  // before Amber was ever asked, and was asked anyway once its turn came.
  it("asks one wrap at a time, and never gives one up before Amber's own deadline does", () => {
    const amber = Object.create(AmberAccount.prototype);
    const options = engineOptionsFor(amber);
    expect(options).toMatchObject({ concurrency: 1, dropDetection: false });
    expect(options.decryptTimeoutMs).toBe(Number.POSITIVE_INFINITY);
  });
});
