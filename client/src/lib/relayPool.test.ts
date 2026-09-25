/**
 * The app's one pool, and the one rule every read through it obeys: a relay
 * that demands NIP-42 auth never holds a read.
 *
 * The team found it (2026-09-24): a relay in Benjamin's own relay list
 * answers every REQ with `CLOSED auth-required`. applesauce parks such a REQ
 * waiting for a login the app never performs, the group request then only
 * completes on its "first EOSE + 5s" fallback, and every screen that waited
 * on routing reads rendered ~7s late. The read must complete when the relays
 * that can answer have answered.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, combineLatest, filter, firstValueFrom, take, toArray } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { RelayPool } from "applesauce-relay";
import { normalizeURL } from "applesauce-core/helpers/url";
import { createPool } from "./relayPool";

/**
 * A relay on a fake socket. `answer` is what it says to any REQ: an event
 * then EOSE (an open relay), or CLOSED auth-required (a gated one).
 */
type Script = (id: string, send: (frame: unknown[]) => void, socket: FakeSocket) => void;
const scripts = new Map<string, Script>();

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0;
  binaryType = "blob";
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  /** Set once the relay has accepted this socket's NIP-42 AUTH. */
  authed = false;
  constructor(public url: string) {
    setTimeout(() => {
      if (this.url.startsWith(DEAD)) { this.readyState = 3; this.onerror?.({ type: "error" }); this.onclose?.({ wasClean: false, code: 1006 }); return; }
      this.readyState = 1; this.onopen?.({});
    }, 0);
  }
  send(data: string) {
    const frame = JSON.parse(data) as unknown[];
    const reply = (out: unknown[]) => this.onmessage?.({ data: JSON.stringify(out) });
    if (frame[0] === "AUTH") {
      const auth = frame[1] as { id: string };
      this.authed = true;
      setTimeout(() => reply(["OK", auth.id, true, ""]), 0);
      return;
    }
    if (frame[0] !== "REQ") return;
    const id = frame[1] as string;
    const script = scripts.get(this.url.replace(/\/$/, ""));
    setTimeout(() => script?.(id, reply, this), 0);
  }
  close() { this.readyState = 3; this.onclose?.({ wasClean: true }); }
}

const EVENT: NostrEvent = { id: "1".repeat(64), kind: 10002, pubkey: "a".repeat(64), tags: [["r", "wss://open.example"]], content: "", created_at: 1, sig: "s" } as NostrEvent;
/** What the gated relay serves once a socket has signed in. */
const GATED_EVENT: NostrEvent = { ...EVENT, id: "2".repeat(64) };
const OPEN = "wss://open.example";
const GATED = "wss://gated.example";
/** A relay whose socket never connects — an author's `umbrel.local`, seen 2026-09-24. */
const DEAD = "wss://dead.example";
/** A relay that connects and then says nothing — no event, no EOSE. */
const SLOW = "wss://slow.example";
scripts.set(OPEN, (id, send) => { send(["EVENT", id, EVENT]); send(["EOSE", id]); });
scripts.set(GATED, (id, send, socket) => {
  if (socket.authed) { send(["EVENT", id, GATED_EVENT]); send(["EOSE", id]); return; }
  send(["AUTH", "challenge-xyz"]);
  send(["CLOSED", id, "auth-required: not authenticated"]);
});

/** The account's signer, as services/relayAuth hands it to the relay. */
const signer = { signEvent: async (template: object) => ({ ...template, id: "f".repeat(64), pubkey: "a".repeat(64), sig: "s" }) as NostrEvent };

/** Once the gated relay has refused a REQ and sent its challenge, sign in to it. */
async function signInWhenGated(pool: RelayPool) {
  const relay = pool.relay(GATED);
  await firstValueFrom(combineLatest([relay.challenge$, relay.authRequiredForRead$]).pipe(filter(([challenge, gated]) => !!challenge && gated)));
  await relay.authenticate(signer);
}

const read = (pool: RelayPool, relays = [OPEN, GATED]) =>
  firstValueFrom(pool.request(relays, { kinds: [10002], authors: ["a".repeat(64)] }, { eventStore: null }).pipe(toArray()));

afterEach(() => vi.useRealTimers());

describe("the app's relay pool", () => {
  it("completes a read as soon as the relays that can answer have — a relay demanding auth is skipped, not waited for", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    const events = await read(pool);
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    expect(Date.now() - started).toBeLessThan(1500);
  }, 4000);

  // An author's relay list names a relay nobody can reach (`umbrel.local`).
  // The library retries its connection three times, with backoff, before
  // the relay counts as done — and the article waited on it (2026-09-24).
  it("completes a read at once past a relay whose socket never connects — a one-shot read does not retry a dead relay", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    const events = await read(pool, [OPEN, DEAD]);
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    expect(Date.now() - started).toBeLessThan(1500);
  }, 4000);

  // A relay that connects and never answers used to hold a read for the
  // library's 5s fallback. No single relay decides when a read is done: once
  // one relay has answered, the rest get a short grace, then the read completes.
  it("gives the other relays a short grace after the first answer, then completes", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    const events = await read(pool, [OPEN, SLOW]);
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    const took = Date.now() - started;
    expect(took).toBeGreaterThan(500); // it did wait for the straggler a moment
    expect(took).toBeLessThan(2500);
  }, 4000);

  // Only one-shot reads skip a gated relay. A live subscription (the NIP-46
  // signer's, for one) waits for the login and then gets that relay's events.
  it.each([
    ["subscription", (pool: RelayPool) => pool.subscription([OPEN, GATED], { kinds: [10002] }, { eventStore: null })],
    // A live filter map, as a subscription holds one (a plain object ends the
    // REQs once sent); keyed by the pool's own spelling of each URL.
    ["subscriptionMap", (pool: RelayPool) => pool.subscriptionMap(new BehaviorSubject({ [normalizeURL(OPEN)]: { kinds: [10002] }, [normalizeURL(GATED)]: { kinds: [10002] } }), { eventStore: null })],
  ])("a live %s waits for a gated relay's login, then receives its events", async (_name, subscribe) => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const received = firstValueFrom(subscribe(pool).pipe(take(2), toArray()));
    await signInWhenGated(pool);
    const events = await received;
    expect(events.map((e) => e.id).sort()).toEqual([EVENT.id, GATED_EVENT.id]);
  }, 4000);

  // The control: what the library does on its own, and what the team saw.
  it("(control) a stock pool holds the same reads for the library's 5s fallback", async () => {
    const pool = new RelayPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    await Promise.all([read(pool), read(pool, [OPEN, DEAD]), read(pool, [OPEN, SLOW])]);
    expect(Date.now() - started).toBeGreaterThan(4500);
  }, 9000);
});
