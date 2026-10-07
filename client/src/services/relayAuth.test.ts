// @vitest-environment jsdom
/**
 * Signing in to relays that ask (NIP-42). A relay answers a read with
 * `auth-required`, or refuses a write; the pool never waits (lib/relayPool),
 * and this is the other half: answer that relay's challenge with the account's
 * signer, without asking — once, never for a signed-out reader — and when the
 * login doesn't happen, keep why (the signer said no, the relay did, or it
 * didn't go through) until the reader asks again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, Subject } from "rxjs";
import {
  askRelayAuthAgain,
  relayAuthProblems,
  setRelayAuthInteractive,
  startRelayAuth as realStartRelayAuth,
} from "./relayAuth";

// Every watcher is stopped after its test: refusals are kept per account across the module.
const stops: (() => void)[] = [];
const startRelayAuth = ((opts) => {
  const stop = realStartRelayAuth(opts);
  stops.push(stop);
  return stop;
}) as typeof realStartRelayAuth;

const PK = "a".repeat(64);
const PK2 = "b".repeat(64);
const GATED = "wss://gated.example/";
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
    authRequiredForPublish$: new BehaviorSubject(false),
    authenticatedAs: null as string | null,
    /** What the relay answers the login with — `false` is the relay's own refusal. */
    accepts: true as boolean,
    /** As applesauce's: the challenge this connection holds, null once it drops. */
    get challenge() {
      return relay.challenge$.value;
    },
    // As applesauce's: the challenge is read before signing, and the login goes out after.
    authenticate: vi.fn(async (signer: Pick<Account, "pubkey" | "signEvent">) => {
      const challenge = relay.challenge$.value;
      await signer.signEvent({ kind: 22242, tags: [["challenge", challenge ?? ""]], content: "", created_at: 1 });
      // A login for a challenge this connection never sent (inbox.nostr.wine's words).
      if (relay.challenge$.value !== challenge)
        return { ok: false, message: "error: unable to validate auth", from: url };
      if (!relay.accepts) return { ok: false, message: "restricted: members only", from: url };
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
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** A pool with one gated relay already in it, the watcher running over `active$`. */
function setup(opts: Partial<Parameters<typeof realStartRelayAuth<Account>>[0]> = {}) {
  const pool = fakePool();
  const active$ = new BehaviorSubject<Account | undefined>(account);
  const gated = fakeRelay(GATED);
  pool.relays.set(gated.url, gated);
  const stop = startRelayAuth({ pool: pool as never, active$, ...opts });
  return { pool, active$, gated, stop };
}

beforeEach(() => {
  while (stops.length) stops.pop()!();
  setRelayAuthInteractive(false);
  vi.clearAllMocks();
});

describe("startRelayAuth", () => {
  it("answers any relay that refused a read, with the account's signer, without asking", async () => {
    const pool = fakePool();
    startRelayAuth({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });
    const gated = fakeRelay("wss://anyone.example");
    pool.add$.next(gated);
    gated.challenge$.next("challenge-xyz");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
    expect(gated.authenticatedAs).toBe(PK);
    expect(account.signEvent).toHaveBeenCalledTimes(1);
  });

  it("answers a relay that refused a write — a recipient's inbox relay, say", async () => {
    const { gated } = setup();
    gated.authRequiredForRead$.next(false);
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
    gated.authRequiredForPublish$.next(true);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  // No prompt, and no pubkey handed over, for a relay that never needed it.
  it("leaves a relay that challenges without refusing anything alone", async () => {
    const pool = fakePool();
    const polite = fakeRelay("wss://polite.example", { gated: false });
    pool.relays.set(polite.url, polite);
    startRelayAuth({ pool: pool as never, active$: new BehaviorSubject<Account | undefined>(account) });
    polite.challenge$.next("c1");
    await tick();
    expect(polite.authenticate).not.toHaveBeenCalled();
  });

  // Our own search relay: answered the moment it challenges, so its first read never
  // waits on a refusal and a login — and still never for a signed-out reader.
  it("answers a relay named up front as soon as it challenges, refusal or not", async () => {
    const pool = fakePool();
    const ours = fakeRelay("wss://search.example/", { gated: false });
    const polite = fakeRelay("wss://polite.example/", { gated: false });
    pool.relays.set(ours.url, ours);
    pool.relays.set(polite.url, polite);
    const active$ = new BehaviorSubject<Account | undefined>(undefined);
    startRelayAuth({ pool: pool as never, active$, upFront: ["wss://search.example"] });
    ours.challenge$.next("c1");
    polite.challenge$.next("c1");
    await tick();
    expect(ours.authenticate).not.toHaveBeenCalled();
    active$.next(account);
    await tick();
    expect(ours.authenticate).toHaveBeenCalledTimes(1);
    expect(ours.authenticatedAs).toBe(PK);
    expect(polite.authenticate).not.toHaveBeenCalled();
  });

  it("asks nobody to unlock for an up-front login: a signer that would prompt waits", async () => {
    const pool = fakePool();
    const ours = fakeRelay("wss://search.example/", { gated: false });
    pool.relays.set(ours.url, ours);
    startRelayAuth({
      pool: pool as never,
      active$: new BehaviorSubject<Account | undefined>(account),
      upFront: ["wss://search.example/"],
      canSignQuietly: async () => false,
    });
    ours.challenge$.next("c1");
    await tick();
    expect(ours.authenticate).not.toHaveBeenCalled();
  });

  it("signs the login through the given signer (signAs, in the app)", async () => {
    const sign = vi.fn(async () => signed);
    const { gated } = setup({ sign });
    gated.challenge$.next("c1");
    await tick();
    expect(sign).toHaveBeenCalledWith(account, expect.objectContaining({ kind: 22242 }));
    expect(account.signEvent).not.toHaveBeenCalled();
  });

  it("drops a login signed for a connection that dropped while signing, and logs in on the new one", async () => {
    const answers: (() => void)[] = [];
    const sign = vi.fn(() => new Promise<typeof signed>((ok) => answers.push(() => ok(signed))));
    const { gated } = setup({ sign });
    gated.challenge$.next("old-connection");
    await tick();
    expect(sign).toHaveBeenCalledTimes(1);
    // The socket drops and comes back with a new challenge before the signer answers.
    gated.challenge$.next(null);
    gated.challenge$.next("new-connection");
    await tick();
    expect(sign).toHaveBeenCalledTimes(2); // the new challenge gets its own login
    answers[0](); // the late answer, for the old challenge
    await tick();
    expect(relayAuthProblems().get(GATED)).toBeUndefined(); // not sent, not kept as a refusal
    answers[1]();
    await tick();
    expect(gated.authenticatedAs).toBe(PK);
    expect(relayAuthProblems().get(GATED)).toBeUndefined();
  });

  it("never reports a stale login that the signer never answers — its fresh one went through", async () => {
    let calls = 0;
    const sign = vi.fn(() => (++calls === 1 ? new Promise<typeof signed>(() => {}) : Promise.resolve(signed)));
    const { gated } = setup({ sign, signTimeoutMs: 30 });
    gated.challenge$.next("old-connection");
    await tick();
    gated.challenge$.next(null); // the socket drops while the signer is (not) answering
    gated.challenge$.next("new-connection");
    await tick();
    expect(gated.authenticatedAs).toBe(PK);
    await new Promise((ok) => setTimeout(ok, 60)); // past the old login's deadline
    expect(relayAuthProblems().get(GATED)).toBeUndefined();
  });

  it("lets a fresh login go at once, not behind a stale one the signer never answers", async () => {
    // As applesauce's Account: one signer request at a time; abortQueue rejects every
    // waiting one and frees the queue.
    let chain: Promise<unknown> = Promise.resolve();
    const waiting = new Set<(reason: unknown) => void>();
    let signerCalls = 0;
    const queued = {
      pubkey: PK,
      abortQueue: vi.fn((reason?: unknown) => {
        for (const reject of waiting) reject(reason);
        waiting.clear();
        chain = Promise.resolve();
      }),
      signEvent: vi.fn((_draft: unknown) => {
        const run = new Promise<typeof signed>((ok, no) => {
          waiting.add(no);
          chain.then(() =>
            // The old request hangs, as an extension's does for 90s; the fresh one is answered.
            ++signerCalls === 1 ? undefined : ok(signed),
          );
        });
        chain = run.catch(() => {});
        return run;
      }),
    };
    const pool = fakePool();
    const gated = fakeRelay(GATED);
    pool.relays.set(gated.url, gated);
    startRelayAuth({
      pool: pool as never,
      active$: new BehaviorSubject<Account | undefined>(queued as never),
      signTimeoutMs: 30,
    });
    gated.challenge$.next("old-connection");
    await tick();
    gated.challenge$.next(null); // dropped: the old login ends, the queue is let go
    expect(queued.abortQueue).toHaveBeenCalledTimes(1);
    gated.challenge$.next("new-connection");
    await tick();
    expect(gated.authenticatedAs).toBe(PK); // not stuck behind the old request
    await new Promise((ok) => setTimeout(ok, 60)); // past every deadline
    expect(queued.abortQueue).toHaveBeenCalledTimes(1); // nothing aborted the fresh login
    expect(relayAuthProblems().get(GATED)).toBeUndefined();
  });

  it("never calls a login stale when its draft carries no challenge to compare", async () => {
    const { gated } = setup();
    gated.authenticate.mockImplementationOnce(async (signer: Pick<Account, "pubkey" | "signEvent">) => {
      await signer.signEvent({ kind: 22242, tags: [], content: "", created_at: 1 });
      gated.authenticatedAs = signer.pubkey;
      return { ok: true, from: GATED };
    });
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticatedAs).toBe(PK);
    expect(relayAuthProblems().get(GATED)).toBeUndefined();
  });

  it("stays quiet for a signed-out reader", async () => {
    const { active$, gated } = setup();
    active$.next(undefined);
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
  });

  it("answers each challenge once", async () => {
    const { gated } = setup();
    gated.challenge$.next("c1");
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("never unlocks a key for a login nobody asked for, until the reader is in Messages", async () => {
    const { gated } = setup({ canSignQuietly: async () => false });
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
    setRelayAuthInteractive(true);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("a newly active account answers a challenge the previous one didn't get through", async () => {
    const { active$, gated } = setup();
    gated.authenticate.mockRejectedValueOnce(new Error("socket closed"));
    gated.challenge$.next("c1");
    await tick();
    active$.next(other);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(2);
    expect(gated.authenticate.mock.calls[1][0].pubkey).toBe(PK2);
  });

  // NIP-42 has no sign-out: a connection signed in as someone no longer active
  // is dropped, and the next read opens an anonymous one.
  it.each([
    ["the reader signs out", (active$: BehaviorSubject<Account | undefined>) => active$.next(undefined)],
    ["another account becomes active", (active$: BehaviorSubject<Account | undefined>) => active$.next(other)],
  ])("drops a relay signed in as the account when %s", async (_when, change) => {
    const { pool, active$, gated } = setup();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticatedAs).toBe(PK);
    change(active$);
    await tick();
    expect(pool.remove).toHaveBeenCalledWith(gated);
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
  });

  it("drops a login that finished for an account no longer active", async () => {
    const { active$, gated, pool } = setup();
    let approve!: () => void;
    account.signEvent.mockImplementationOnce(() => new Promise((resolve) => (approve = () => resolve(signed))));
    gated.challenge$.next("c1");
    await tick();
    active$.next(other);
    await tick();
    approve();
    await tick();
    expect(pool.remove).toHaveBeenCalledWith(gated);
  });

  it("stops watching when stopped", async () => {
    const { gated, stop } = setup();
    stop();
    gated.challenge$.next("c1");
    await tick();
    expect(gated.authenticate).not.toHaveBeenCalled();
  });
});

describe("a login that doesn't happen", () => {
  const refuse = () => account.signEvent.mockRejectedValueOnce(new Error("user rejected"));

  it("by the signer is on record as the signer's, and is asked again only when the reader asks", async () => {
    const { gated } = setup();
    refuse();
    gated.challenge$.next("c1");
    await tick();
    expect(relayAuthProblems().get(GATED)).toEqual({ by: "signer" });

    // Opening Messages, the relay refusing another read, or a reconnect is not "ask again".
    setRelayAuthInteractive(true);
    gated.authRequiredForRead$.next(true);
    gated.challenge$.next(null);
    gated.challenge$.next("c2");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);

    askRelayAuthAgain("wss://gated.example");
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(2);
    expect(gated.authenticatedAs).toBe(PK);
    expect(relayAuthProblems().size).toBe(0);
  });

  it("by the relay is on record as the relay's, with its reason, and tried again only when asked", async () => {
    const { gated } = setup();
    gated.accepts = false;
    gated.challenge$.next("c1");
    await tick();
    expect(relayAuthProblems().get(GATED)).toEqual({ by: "relay", message: "restricted: members only" });

    setRelayAuthInteractive(true);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);

    gated.accepts = true;
    askRelayAuthAgain();
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(2);
    expect(relayAuthProblems().size).toBe(0);
  });

  it("because the signer didn't answer is no rejection: tried again when the reader opens Messages", async () => {
    const { gated } = setup({ isRejection: (error) => !String(error).includes("timed out") });
    account.signEvent.mockRejectedValueOnce(new Error("signer timed out"));
    gated.challenge$.next("c1");
    await tick();
    expect(relayAuthProblems().get(GATED)).toEqual({ by: "error", message: "signer timed out" });

    // The relay refusing the next read is not another go…
    gated.authRequiredForRead$.next(true);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(1);
    // …opening Messages is.
    setRelayAuthInteractive(true);
    await tick();
    expect(gated.authenticate).toHaveBeenCalledTimes(2);
    expect(relayAuthProblems().size).toBe(0);
  });

  it("from a signer that never answers runs out, rather than holding the relay for good", async () => {
    vi.useFakeTimers();
    try {
      const { gated } = setup({ signTimeoutMs: 1000 });
      // An extension popup closed without a choice: the promise never settles.
      account.signEvent.mockImplementationOnce(() => new Promise(() => {}));
      const abortQueue = vi.fn();
      (account as { abortQueue?: unknown }).abortQueue = abortQueue;
      gated.challenge$.next("c1");
      await vi.advanceTimersByTimeAsync(999);
      expect(relayAuthProblems().size).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(relayAuthProblems().get(GATED)).toEqual({ by: "error", message: "your signer didn't answer" });
      // The stuck request is let go, or it would hold every later one in the account's queue.
      expect(abortQueue).toHaveBeenCalledTimes(1);

      // Not a "no": asked again when the reader opens Messages, and this time it answers.
      setRelayAuthInteractive(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(gated.authenticate).toHaveBeenCalledTimes(2);
      expect(gated.authenticatedAs).toBe(PK);
      expect(relayAuthProblems().size).toBe(0);
    } finally {
      delete (account as { abortQueue?: unknown }).abortQueue;
      vi.useRealTimers();
    }
  });

  it("says the relay didn't answer, rather than that it refused, when the library's wait ran out", async () => {
    const { gated } = setup();
    gated.authenticate.mockResolvedValueOnce({ ok: false, message: "Timeout", from: gated.url });
    gated.challenge$.next("c1");
    await tick();
    expect(relayAuthProblems().get(GATED)).toEqual({ by: "error", message: "the relay didn't answer" });
  });

  it("belongs to the account that refused, and comes back with it", async () => {
    const { active$, gated } = setup();
    refuse();
    gated.challenge$.next("c1");
    await tick();
    active$.next(other);
    await tick();
    expect(relayAuthProblems().size).toBe(0);
    gated.authenticatedAs = null; // dropped for B in the real pool; a fresh anonymous socket
    active$.next(account);
    await tick();
    expect(relayAuthProblems().get(GATED)).toEqual({ by: "signer" });
  });

  it("can be asked again after the pool let go of that relay", async () => {
    const { gated, pool } = setup();
    refuse();
    gated.challenge$.next("c1");
    await tick();
    pool.remove(gated);
    askRelayAuthAgain("wss://gated.example");
    expect(relayAuthProblems().size).toBe(0);

    const again = fakeRelay("wss://gated.example");
    pool.add$.next(again);
    again.challenge$.next("c2");
    await tick();
    expect(again.authenticate).toHaveBeenCalledTimes(1);
  });
});
