// @vitest-environment jsdom
/**
 * Signing in to the reader's own relays when they ask (NIP-42). A relay in
 * Benjamin's own relay list answers reads with `auth-required`; the pool skips
 * it (lib/relayPool) so nothing waits, and this is the other half: when the
 * relay sends its challenge, answer it with the account's signer — once per
 * challenge, without asking, never for a signed-out reader, and never on
 * someone else's relay — so the next read gets that relay's events too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, Subject } from "rxjs";
import { isOwnRelay, setRelayAuthInteractive, startRelayAuth } from "./relayAuth";

const PK = "a".repeat(64);
const PK2 = "b".repeat(64);
const signed = { id: "s".repeat(64), kind: 22242, pubkey: PK, tags: [], content: "", created_at: 1, sig: "x" };
const account = { pubkey: PK, signEvent: vi.fn(async () => signed) };
const other = { pubkey: PK2, signEvent: vi.fn(async () => ({ ...signed, pubkey: PK2 })) };
type Account = typeof account;

const GATED = "wss://gated.example/";
const INBOX = "wss://inbox.example/";
const NOTES = "wss://notes.example/";
const POLITE = "wss://polite.example/";
const LOCKED = "wss://locked.example/";
const THEIRS = "wss://theirs.example/";

/** Each account's own relays (kind 10002 + 10050), as the store would hand them over. */
let lists: Map<string, BehaviorSubject<ReadonlySet<string>>>;
const listOf = (pubkey: string) => {
  if (!lists.has(pubkey)) lists.set(pubkey, new BehaviorSubject<ReadonlySet<string>>(new Set()));
  return lists.get(pubkey)!;
};
const ownRelays = (pubkey: string) => listOf(pubkey).asObservable();
const own = (pubkey: string, ...urls: string[]) => listOf(pubkey).next(new Set(urls));

/** A relay as the watcher sees it; `gated` is whether it has refused a read. */
function fakeRelay(url: string, { gated = true } = {}) {
  const relay = {
    url,
    challenge$: new BehaviorSubject<string | null>(null),
    authRequiredForRead$: new BehaviorSubject(gated),
    authRequiredForPublish$: new BehaviorSubject(false),
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
const tick = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

/** A pool with one gated relay already in it, the watcher running over `active$`. */
function setup() {
  const pool = fakePool();
  const active$ = new BehaviorSubject<Account | undefined>(account);
  const gated = fakeRelay(GATED);
  pool.relays.set(gated.url, gated);
  const stop = startRelayAuth({ pool: pool as never, active$, ownRelays });
  return { pool, active$, gated, stop };
}

let stops: (() => void)[] = [];
function start(opts: Omit<Parameters<typeof startRelayAuth<Account>>[0], "ownRelays">) {
  const stop = startRelayAuth({ ...opts, ownRelays });
  stops.push(stop);
  return stop;
}

beforeEach(() => {
  for (const stop of stops) stop();
  stops = [];
  lists = new Map();
  vi.clearAllMocks();
});

describe("startRelayAuth", () => {
  it("answers a challenge from one of the account's own relays with its signer, without asking", async () => {
    own(PK, GATED);
    const pool = fakePool();
    start({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });

    const gated = fakeRelay(GATED);
    pool.add$.next(gated);
    gated.challenge$.next("challenge-xyz");
    await tick();

    expect(gated.authenticate).toHaveBeenCalledTimes(1);
    const signer = gated.authenticate.mock.calls[0][0] as { signEvent: (t: unknown) => Promise<unknown> };
    await expect(signer.signEvent({ kind: 22242, tags: [], content: "", created_at: 1 })).resolves.toBe(signed);
  });

  it("never signs in to someone else's relay", async () => {
    own(PK, GATED);
    const pool = fakePool();
    const theirs = fakeRelay(THEIRS);
    theirs.authRequiredForPublish$.next(true);
    pool.relays.set(theirs.url, theirs);
    start({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });
    theirs.challenge$.next("c1");
    await tick();
    expect(theirs.authenticate).not.toHaveBeenCalled();
    expect(isOwnRelay(THEIRS)).toBe(false);
    expect(isOwnRelay("wss://GATED.example")).toBe(true);
  });

  it("stays quiet for a signed-out reader", async () => {
    own(PK, GATED);
    const { active$, gated } = setup();
    active$.next(undefined);
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
  });

  it("answers each challenge once, and a relay already in the pool too", async () => {
    own(PK, GATED);
    const { gated } = setup();
    gated.challenge$.next("c1");
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("a declined or failed signature is nothing more than that", async () => {
    own(PK, GATED);
    const { gated, pool } = setup();
    gated.authenticate.mockRejectedValueOnce(new Error("user declined"));
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1); // and nothing thrown
    expect(pool.remove).not.toHaveBeenCalled();
  });

  // No prompt for a login nothing needed.
  it("leaves a relay that challenges without refusing anything alone, until it refuses a read", async () => {
    own(PK, POLITE);
    const pool = fakePool();
    const polite = fakeRelay(POLITE, { gated: false });
    pool.relays.set(polite.url, polite);
    start({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });
    polite.challenge$.next("c1");
    await tick();
    expect(polite.authenticate).not.toHaveBeenCalled();

    polite.authRequiredForRead$.next(true);
    await tick();
    expect(polite.authenticate).toHaveBeenCalledTimes(1);
  });

  it("signs in to one of its own relays that refused a write, as it does for a refused read", async () => {
    own(PK, INBOX, NOTES);
    const pool = fakePool();
    const inbox = fakeRelay(INBOX, { gated: false });
    pool.relays.set(inbox.url, inbox);
    start({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });
    inbox.challenge$.next("c1");
    await tick();
    expect(inbox.authenticate).not.toHaveBeenCalled();

    inbox.authRequiredForPublish$.next(true);
    await tick();
    expect(inbox.authenticate).toHaveBeenCalledTimes(1);
  });

  it("answers a waiting challenge once the account's list comes to name that relay", async () => {
    const { gated } = setup();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();

    own(PK, GATED);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("never unlocks a key for a login nobody asked for, until the reader is in Messages", async () => {
    own(PK, LOCKED);
    const pool = fakePool();
    const inbox = fakeRelay(LOCKED);
    pool.relays.set(inbox.url, inbox);
    start({
      pool: pool as never,
      active$: new BehaviorSubject<Account | undefined>(account),
      canSignQuietly: async () => false,
    });
    inbox.challenge$.next("c1");
    await tick();
    expect(inbox.authenticate).not.toHaveBeenCalled();
    setRelayAuthInteractive(true);
    await tick();
    expect(inbox.authenticate).toHaveBeenCalledTimes(1);
    setRelayAuthInteractive(false);
  });

  it("a newly active account answers a challenge the previous one saw, on its own relays", async () => {
    own(PK, GATED);
    own(PK2, GATED);
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
    ["the reader signs out", (active$: BehaviorSubject<Account | undefined>) => active$.next(undefined)],
    ["another account becomes active", (active$: BehaviorSubject<Account | undefined>) => active$.next(other)],
  ])("drops a relay signed in as the account when %s", async (_when, change) => {
    own(PK, GATED);
    own(PK2, GATED);
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
    own(PK, GATED);
    const { gated, stop } = setup();
    stop();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
    expect(isOwnRelay(GATED)).toBe(false);
  });
});
