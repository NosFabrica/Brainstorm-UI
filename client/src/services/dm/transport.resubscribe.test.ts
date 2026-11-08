// @vitest-environment node
/**
 * The inbox's live REQ against relays that refuse it, through the real pool
 * (lib/relayPool) and the real poolTransport — the loop relay.mwaters.net
 * reported (2026-11-08): one REQ per round trip, thousands a minute, from one
 * open tab. The rule under test: refused before a login, ask again the moment
 * the login lands; refused after one (or CLOSEd for any other reason), back off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { combineLatest, type Subscription } from "rxjs";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";

/** How a fake relay behaves, keyed by its host. */
interface Behaviour {
  /** The CLOSED reason for a REQ it won't serve. */
  reason: string;
  /** Serve the REQ once the connection has logged in (else refuse it regardless). */
  servesAfterLogin?: boolean;
  /** Accept the AUTH (else OK false, as relay.mwaters.net does without a serviceUrl). */
  acceptsLogin?: boolean;
  /** Serve every REQ, then CLOSE it cleanly with this reason. */
  servesThenCloses?: string;
}
const behaviours = new Map<string, Behaviour>();
/** Every frame the client sent, stamped with fake time, per relay host. */
const sent = new Map<string, { at: number; frame: unknown[]; loggedIn: boolean }[]>();

const LATENCY_MS = 5;

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = "blob";
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private loggedIn = false;
  private readonly host: string;
  constructor(url: string) {
    this.host = new URL(url).host;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
      this.reply(["AUTH", "challenge"]);
    }, LATENCY_MS);
  }
  private reply(frame: unknown[]) {
    setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(frame) }), LATENCY_MS);
  }
  send(raw: string) {
    const frame = JSON.parse(raw) as [string, ...unknown[]];
    const b = behaviours.get(this.host)!;
    const log = sent.get(this.host) ?? [];
    sent.set(this.host, log);
    log.push({ at: Date.now(), frame, loggedIn: this.loggedIn });
    const [type, id] = frame;
    if (type === "REQ") {
      if (b.servesThenCloses) {
        this.reply(["EOSE", id]);
        this.reply(["CLOSED", id, b.servesThenCloses]);
      } else if (this.loggedIn && b.servesAfterLogin) this.reply(["EOSE", id]);
      else this.reply(["CLOSED", id, b.reason]);
    } else if (type === "AUTH") {
      const event = id as { id: string };
      this.loggedIn = !!b.acceptsLogin;
      this.reply([
        "OK",
        event.id,
        this.loggedIn,
        this.loggedIn ? "" : "error: relay needs serviceUrl to be configured",
      ]);
    }
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, wasClean: true });
  }
}
(globalThis as { WebSocket: unknown }).WebSocket = FakeSocket;

const { poolTransport } = await import("./transport");
const { pool } = await import("@/lib/relayPool");

const ME = "a".repeat(64);
const sk = generateSecretKey();
let n = 0;
let stops: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  vi.useRealTimers();
});

/**
 * A relay with [b]'s behaviour, and what services/relayAuth does for a reader
 * with a signer: answer the challenge once the relay has refused a read.
 */
function relayWith(b: Behaviour, { signer = true } = {}) {
  const host = `relay${++n}.example`;
  behaviours.set(host, b);
  const url = `wss://${host}/`;
  if (signer) {
    const relay = pool.relay(url);
    // One try per relay, as services/relayAuth keeps a refused login on record rather than re-asking.
    let tried = false;
    const login: Subscription = combineLatest([relay.authRequiredForRead$, relay.challenge$]).subscribe(
      ([needed, challenge]) => {
        if (!needed || !challenge || relay.authenticated || tried) return;
        tried = true;
        relay.authenticate({ signEvent: async (t: never) => finalizeEvent(t, sk) } as never).catch(() => {});
      },
    );
    stops.push(() => login.unsubscribe());
  }
  return { url, host };
}

function live(url: string) {
  const eoses: number[] = [];
  stops.push(
    poolTransport.live(
      url,
      { kinds: [1059], "#p": [ME], since: 0 },
      { onEvent: () => {}, onEose: () => eoses.push(Date.now()), onAuthRequired: () => {} },
    ),
  );
  return eoses;
}

const reqs = (host: string) => (sent.get(host) ?? []).filter((s) => s.frame[0] === "REQ");
const authAt = (host: string) => (sent.get(host) ?? []).find((s) => s.frame[0] === "AUTH")?.at;
const gaps = (times: number[]) => times.slice(1).map((t, i) => t - times[i]);

const SPELLINGS = [
  ["NIP-01's", "auth-required: requested filter requires authentication"],
  ["strfry's", "ERROR: auth-required: requested filter requires authentication"],
  ["a lowercase error:", "error: auth-required: sign in first"],
] as const;

describe("poolTransport.live: refused before a login", () => {
  it.each(SPELLINGS)("asks again the moment the login lands, on %s refusal", async (_, reason) => {
    const { url, host } = relayWith({ reason, servesAfterLogin: true, acceptsLogin: true });
    const eoses = live(url);
    await vi.advanceTimersByTimeAsync(5_000);
    const asked = reqs(host);
    expect(asked.map((r) => r.loggedIn)).toEqual([false, true]);
    // No backoff stands between the login and the second ask.
    expect(asked[1].at - authAt(host)!).toBeLessThan(50);
    expect(eoses).toHaveLength(1);
  });

  it("sends nothing more while no login happens (no signer)", async () => {
    const { url, host } = relayWith({ reason: SPELLINGS[1][1] }, { signer: false });
    live(url);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reqs(host)).toHaveLength(1);
  });

  it("sends nothing more when the relay refuses the login (relay.mwaters.net today)", async () => {
    const { url, host } = relayWith({ reason: SPELLINGS[1][1], acceptsLogin: false });
    live(url);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reqs(host)).toHaveLength(1);
    expect((sent.get(host) ?? []).filter((s) => s.frame[0] === "AUTH")).toHaveLength(1);
  });
});

describe("poolTransport.live: refused again after a login", () => {
  it.each(SPELLINGS)("backs off on %s refusal instead of re-asking every round trip", async (_, reason) => {
    const { url, host } = relayWith({ reason, servesAfterLogin: false, acceptsLogin: true });
    live(url);
    await vi.advanceTimersByTimeAsync(20_000);
    const after = reqs(host).filter((r) => r.loggedIn);
    // 1s, 2s, 3s, 4s, 5s apart: six asks in 20s, where the library sent one per round trip.
    expect(after.length).toBeGreaterThanOrEqual(5);
    expect(after.length).toBeLessThanOrEqual(7);
    const spacing = gaps(after.map((r) => r.at));
    expect(Math.min(...spacing)).toBeGreaterThanOrEqual(1_000);
    expect(spacing).toEqual([...spacing].sort((a, b) => a - b));
  });
});

describe("poolTransport.live: closed for any other reason", () => {
  it("backs off rather than resubscribing at once", async () => {
    const { url, host } = relayWith({ reason: "ERROR: something went wrong" });
    live(url);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reqs(host).length).toBeLessThanOrEqual(7);
    expect(Math.min(...gaps(reqs(host).map((r) => r.at)))).toBeGreaterThanOrEqual(1_000);
  });

  it("starts the backoff over each time the relay answers", async () => {
    const { url, host } = relayWith({ reason: "", servesThenCloses: "closed: subscription lifetime reached" });
    const eoses = live(url);
    await vi.advanceTimersByTimeAsync(10_000);
    // Every cycle EOSEs, so every wait is the first step (1s), never growing toward 30s.
    const spacing = gaps(reqs(host).map((r) => r.at));
    expect(spacing.length).toBeGreaterThanOrEqual(7);
    expect(Math.max(...spacing)).toBeLessThan(1_100);
    expect(eoses.length).toBe(reqs(host).length);
  });
});

describe("poolTransport.page", () => {
  it.each(SPELLINGS)("reports %s refusal as needing a login, not a stall", async (_, reason) => {
    const { url } = relayWith({ reason }, { signer: false });
    const closed: [string, boolean][] = [];
    stops.push(
      poolTransport.page(
        url,
        { kinds: [1059], "#p": [ME], until: 1, limit: 10 },
        { onEvent: () => {}, onEose: () => {}, onClosed: (r, auth) => closed.push([r, auth]) },
      ),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(closed).toEqual([[reason, true]]);
  });
});
