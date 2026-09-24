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
import { firstValueFrom, toArray } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { RelayPool } from "applesauce-relay";
import { createPool } from "./relayPool";

/**
 * A relay on a fake socket. `answer` is what it says to any REQ: an event
 * then EOSE (an open relay), or CLOSED auth-required (a gated one).
 */
type Script = (id: string, send: (frame: unknown[]) => void) => void;
const scripts = new Map<string, Script>();

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0;
  binaryType = "blob";
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 0);
  }
  send(data: string) {
    const frame = JSON.parse(data) as unknown[];
    if (frame[0] !== "REQ") return;
    const id = frame[1] as string;
    const script = scripts.get(this.url.replace(/\/$/, ""));
    setTimeout(() => script?.(id, (out) => this.onmessage?.({ data: JSON.stringify(out) })), 0);
  }
  close() { this.readyState = 3; this.onclose?.({ wasClean: true }); }
}

const EVENT: NostrEvent = { id: "1".repeat(64), kind: 10002, pubkey: "a".repeat(64), tags: [["r", "wss://open.example"]], content: "", created_at: 1, sig: "s" } as NostrEvent;
const OPEN = "wss://open.example";
const GATED = "wss://gated.example";
scripts.set(OPEN, (id, send) => { send(["EVENT", id, EVENT]); send(["EOSE", id]); });
scripts.set(GATED, (id, send) => { send(["AUTH", "challenge-xyz"]); send(["CLOSED", id, "auth-required: not authenticated"]); });

const read = (pool: RelayPool) =>
  firstValueFrom(pool.request([OPEN, GATED], { kinds: [10002], authors: ["a".repeat(64)] }, { eventStore: null }).pipe(toArray()));

afterEach(() => vi.useRealTimers());

describe("the app's relay pool", () => {
  it("completes a read as soon as the relays that can answer have — a relay demanding auth is skipped, not waited for", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    const events = await read(pool);
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    expect(Date.now() - started).toBeLessThan(1500);
  }, 4000);

  // The control: what the library does on its own, and what the team saw.
  it("(control) a stock pool holds the same read for the library's 5s fallback", async () => {
    const pool = new RelayPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    await read(pool);
    expect(Date.now() - started).toBeGreaterThan(4500);
  }, 9000);
});
