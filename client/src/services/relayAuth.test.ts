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
const signed = { id: "s".repeat(64), kind: 22242, pubkey: PK, tags: [], content: "", created_at: 1, sig: "x" };
const account = { pubkey: PK, signEvent: vi.fn(async () => signed) };

function fakeRelay(url: string) {
  return { url, challenge$: new BehaviorSubject<string | null>(null), authenticated$: new BehaviorSubject(false), authenticate: vi.fn(async () => ({ ok: true, from: url })) };
}
function fakePool() {
  const add$ = new Subject<ReturnType<typeof fakeRelay>>();
  return { add$, relays: new Map<string, ReturnType<typeof fakeRelay>>() };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("startRelayAuth", () => {
  it("answers a relay's challenge with the account's signer, when the reader allowed it", async () => {
    setRelayAuthAllowed(PK, true);
    const pool = fakePool();
    const active$ = new BehaviorSubject<typeof account | undefined>(account);
    startRelayAuth({ pool: pool as never, active$ });

    const gated = fakeRelay("wss://gated.example");
    pool.add$.next(gated);
    gated.challenge$.next("challenge-xyz");
    await Promise.resolve();

    expect(gated.authenticate).toHaveBeenCalledTimes(1);
    const signer = gated.authenticate.mock.calls[0][0] as { signEvent: (t: unknown) => Promise<unknown> };
    await expect(signer.signEvent({ kind: 22242, tags: [], content: "" })).resolves.toBe(signed);
  });

  it("stays quiet without consent, and for a signed-out reader", async () => {
    const pool = fakePool();
    const active$ = new BehaviorSubject<typeof account | undefined>(account);
    startRelayAuth({ pool: pool as never, active$ });
    const gated = fakeRelay("wss://gated.example");
    pool.add$.next(gated);
    gated.challenge$.next("c1");
    await Promise.resolve();
    expect(gated.authenticate).not.toHaveBeenCalled();

    setRelayAuthAllowed(PK, true);
    active$.next(undefined);
    gated.challenge$.next("c2");
    await Promise.resolve();
    expect(gated.authenticate).not.toHaveBeenCalled();
  });

  it("answers each challenge once, and a relay already in the pool too", async () => {
    setRelayAuthAllowed(PK, true);
    const pool = fakePool();
    const already = fakeRelay("wss://early.example");
    pool.relays.set(already.url, already);
    const active$ = new BehaviorSubject<typeof account | undefined>(account);
    startRelayAuth({ pool: pool as never, active$ });

    already.challenge$.next("c1");
    already.challenge$.next("c1");
    await Promise.resolve();
    expect(already.authenticate).toHaveBeenCalledTimes(1);
  });

  it("a declined or failed signature is nothing more than that", async () => {
    setRelayAuthAllowed(PK, true);
    const pool = fakePool();
    const active$ = new BehaviorSubject<typeof account | undefined>(account);
    startRelayAuth({ pool: pool as never, active$ });
    const gated = fakeRelay("wss://gated.example");
    gated.authenticate.mockRejectedValueOnce(new Error("user declined"));
    pool.add$.next(gated);
    gated.challenge$.next("c1");
    await Promise.resolve();
    await Promise.resolve();
    expect(gated.authenticate).toHaveBeenCalledTimes(1); // and nothing thrown
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
