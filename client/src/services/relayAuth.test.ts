// @vitest-environment jsdom
/**
 * Signing in to relays that ask (NIP-42), for a reader who has a signer and
 * said yes. A relay in Benjamin's own relay list answers reads with
 * `auth-required`; the pool skips it (lib/relayPool) so nothing waits, and
 * this is the other half: when the relay sends its challenge, answer it with
 * the account's signer — once per challenge, only with consent, never for a
 * signed-out reader — so the next read gets that relay's events too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, Subject } from "rxjs";
import { relayAuthAllowed, setRelayAuthAllowed } from "@/lib/relayAuthPref";
import { startRelayAuth } from "./relayAuth";

const PK = "a".repeat(64);
const PK2 = "b".repeat(64);
const signed = { id: "s".repeat(64), kind: 22242, pubkey: PK, tags: [], content: "", created_at: 1, sig: "x" };
const account = { pubkey: PK, signEvent: vi.fn(async () => signed) };
const other = { pubkey: PK2, signEvent: vi.fn(async () => ({ ...signed, pubkey: PK2 })) };
type Account = typeof account;

/** A relay as the watcher sees it; `gated` is whether it has refused a read. */
function fakeRelay(url: string, { gated = true } = {}) {
  const relay = {
    url,
    challenge$: new BehaviorSubject<string | null>(null),
    authRequiredForRead$: new BehaviorSubject(gated),
    authenticatedAs: null as string | null,
    authenticate: vi.fn(async (signer: Account) => {
      relay.authenticatedAs = signer.pubkey;
      return { ok: true, from: url };
    }),
  };
  return relay;
}
type FakeRelay = ReturnType<typeof fakeRelay>;
function fakePool() {
  const pool = {
    add$: new Subject<FakeRelay>(),
    remove$: new Subject<FakeRelay>(),
    relays: new Map<string, FakeRelay>(),
    remove: vi.fn((relay: FakeRelay) => {
      pool.relays.delete(relay.url);
      pool.remove$.next(relay);
    }),
  };
  return pool;
}
const tick = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); };

/** A pool with one gated relay already in it, the watcher running over `active$`. */
function setup(active: Account | undefined = account) {
  const pool = fakePool();
  const active$ = new BehaviorSubject<Account | undefined>(active);
  const gated = fakeRelay("wss://gated.example");
  pool.relays.set(gated.url, gated);
  const stop = startRelayAuth({ pool: pool as never, active$ });
  return { pool, active$, gated, stop };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("startRelayAuth", () => {
  it("answers a relay's challenge with the account's signer, when the reader allowed it", async () => {
    setRelayAuthAllowed(PK, true);
    const pool = fakePool();
    const active$ = new BehaviorSubject<Account | undefined>(account);
    startRelayAuth({ pool: pool as never, active$ });

    const gated = fakeRelay("wss://gated.example");
    pool.add$.next(gated);
    gated.challenge$.next("challenge-xyz");
    await tick();

    expect(gated.authenticate).toHaveBeenCalledTimes(1);
    const signer = gated.authenticate.mock.calls[0][0] as { signEvent: (t: unknown) => Promise<unknown> };
    await expect(signer.signEvent({ kind: 22242, tags: [], content: "", created_at: 1 })).resolves.toBe(signed);
  });

  it("stays quiet without consent, and for a signed-out reader", async () => {
    const { active$, gated } = setup();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();

    active$.next(undefined);
    setRelayAuthAllowed(PK, true);
    gated.challenge$.next("c2");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
  });

  it("answers each challenge once, and a relay already in the pool too", async () => {
    setRelayAuthAllowed(PK, true);
    const { gated } = setup();
    gated.challenge$.next("c1");
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("a declined or failed signature is nothing more than that", async () => {
    setRelayAuthAllowed(PK, true);
    const { gated, pool } = setup();
    gated.authenticate.mockRejectedValueOnce(new Error("user declined"));
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1); // and nothing thrown
    expect(pool.remove).not.toHaveBeenCalled();
  });

  // No prompt, and no pubkey handed over, for a relay that never needed it.
  it("leaves a relay that challenges without refusing a read alone, until it refuses one", async () => {
    setRelayAuthAllowed(PK, true);
    const pool = fakePool();
    const polite = fakeRelay("wss://polite.example", { gated: false });
    pool.relays.set(polite.url, polite);
    startRelayAuth({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });
    polite.challenge$.next("c1");
    await tick();
    expect(polite.authenticate).not.toHaveBeenCalled();

    polite.authRequiredForRead$.next(true);
    await tick();
    expect(polite.authenticate).toHaveBeenCalledTimes(1);
  });

  it("turning the switch on answers a challenge already waiting, without a reload", async () => {
    const { gated } = setup();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();

    setRelayAuthAllowed(PK, true);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("a newly active account answers a challenge the previous one saw", async () => {
    setRelayAuthAllowed(PK, true);
    setRelayAuthAllowed(PK2, true);
    const { active$, gated } = setup();
    gated.authenticate.mockRejectedValueOnce(new Error("user declined"));
    gated.challenge$.next("c1");
    await tick();

    active$.next(other);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(2);
    expect(gated.authenticate.mock.calls[1][0]).toBe(other);
  });

  // NIP-42 has no sign-out: a connection signed in as someone who may no
  // longer sign is dropped, and the next read opens an anonymous one.
  it.each([
    ["the switch is turned off", (active$: BehaviorSubject<Account | undefined>) => { void active$; setRelayAuthAllowed(PK, false); }],
    ["the reader signs out", (active$: BehaviorSubject<Account | undefined>) => active$.next(undefined)],
    ["another account becomes active", (active$: BehaviorSubject<Account | undefined>) => { setRelayAuthAllowed(PK2, true); active$.next(other); }],
  ])("drops a relay signed in as the account when %s", async (_when, change) => {
    setRelayAuthAllowed(PK, true);
    const { pool, active$, gated } = setup();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticatedAs).toBe(PK);

    change(active$);
    await tick();
    expect(pool.remove).toHaveBeenCalledWith(gated);
    expect(gated.authenticate).toHaveBeenCalledTimes(1); // the dropped relay is not answered again
  });

  it("stops watching when stopped", async () => {
    setRelayAuthAllowed(PK, true);
    const { gated, stop } = setup();
    stop();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
  });
});

describe("relayAuthAllowed", () => {
  it("is off until the reader turns it on, per account", () => {
    expect(relayAuthAllowed(PK)).toBe(false);
    setRelayAuthAllowed(PK, true);
    expect(relayAuthAllowed(PK)).toBe(true);
    expect(relayAuthAllowed("b".repeat(64))).toBe(false);
    setRelayAuthAllowed(PK, false);
    expect(relayAuthAllowed(PK)).toBe(false);
  });
});
