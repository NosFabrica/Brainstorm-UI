// @vitest-environment-options {"url": "https://brainstorm.world/"}
/**
 * On brainstorm.world, a relay list naming `ws://localhost:4869` (Citrine, a
 * relay on its owner's phone) names the READER's own device. Connecting made
 * Chrome ask the reader to let brainstorm.world "access other apps and
 * services on this device". Nothing may connect there unless the reader chose
 * it: relay lists drop it, and the pool refuses the socket however the URL
 * arrived.
 */
import { describe, expect, it } from "vitest";
import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { dedupeRelays, parseRelayList } from "./relayList";
import { allowLocalRelay, isUnreachableLocalRelay } from "./localNetwork";
import { createPool } from "./relayPool";

const LOCALS = [
  "ws://localhost:4869",
  "ws://127.0.0.1:7777",
  "ws://umbrel.local:4848",
  "ws://192.168.1.10:4848",
  "ws://[::1]:4869",
];
const PUBLIC = "wss://nos.lol";

const EVENT: NostrEvent = {
  id: "1".repeat(64),
  kind: 1,
  pubkey: "a".repeat(64),
  tags: [],
  content: "",
  created_at: 1,
  sig: "s",
} as NostrEvent;

/** Every socket the pool tried to open, and a relay that answers anything asked. */
const opened: string[] = [];
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = "blob";
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    opened.push(url);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }
  send(data: string) {
    const frame = JSON.parse(data) as unknown[];
    const reply = (out: unknown[]) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(out) }), 0);
    if (frame[0] === "REQ") {
      reply(["EVENT", frame[1], EVENT]);
      reply(["EOSE", frame[1]]);
    } else if (frame[0] === "EVENT") {
      reply(["OK", (frame[1] as NostrEvent).id, true, ""]);
    }
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ wasClean: true });
  }
}

function freshPool() {
  opened.length = 0;
  return createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
}

describe("on a public page, relays on the reader's own device or network", () => {
  it("are unreachable", () => {
    expect(location.hostname).toBe("brainstorm.world");
    for (const url of LOCALS) expect(isUnreachableLocalRelay(url)).toBe(true);
    expect(isUnreachableLocalRelay(PUBLIC)).toBe(false);
  });

  it("are dropped from a set of relays", () => {
    expect(dedupeRelays([...LOCALS, PUBLIC])).toEqual(["wss://nos.lol/"]);
  });

  it("are dropped from a NIP-65 relay list, both halves", () => {
    const list = parseRelayList({
      ...EVENT,
      id: "2".repeat(64),
      kind: 10002,
      tags: [
        ["r", "ws://localhost:4869"],
        ["r", "ws://192.168.1.10:4848", "write"],
        ["r", "ws://umbrel.local:4848", "read"],
        ["r", PUBLIC],
      ],
    });
    expect(list).toEqual({ write: ["wss://nos.lol/"], read: ["wss://nos.lol/"] });
  });

  it("are never connected to by a read, even one handed the raw URLs", async () => {
    const pool = freshPool();
    const events = await lastValueFrom(pool.request([...LOCALS, PUBLIC], { kinds: [1] }).pipe(toArray()));
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    expect(opened).toEqual(["wss://nos.lol/"]);
  });

  it("are never connected to by a subscription or a REQ", async () => {
    const pool = freshPool();
    await firstValueFrom(pool.subscription([...LOCALS, PUBLIC], { kinds: [1] }, { eventStore: null }));
    await firstValueFrom(pool.req([...LOCALS, PUBLIC], { kinds: [1] }));
    expect(new Set(opened)).toEqual(new Set(["wss://nos.lol/"]));
  });

  it("are never published to, and don't hold a publish", async () => {
    const pool = freshPool();
    const started = Date.now();
    const responses = await pool.publish([...LOCALS, PUBLIC], EVENT);
    expect(responses.map((r) => r.from)).toEqual(["wss://nos.lol/"]);
    expect(opened).toEqual(["wss://nos.lol/"]);
    expect(await pool.publish(LOCALS, EVENT)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("are never connected to through pool.relay(), as a kind-10040's provider relay is read", async () => {
    const pool = freshPool();
    await lastValueFrom(pool.relay("ws://localhost:4869").request({ kinds: [1] }), { defaultValue: undefined }).catch(
      () => undefined,
    );
    expect(opened).toEqual([]);
  });

  it("don't hold a read that asked only them: it finishes empty at once, not at its timeout", async () => {
    const pool = freshPool();
    const started = Date.now();
    const events = await lastValueFrom(pool.request(LOCALS, { kinds: [1] }, { timeout: 5000 }).pipe(toArray()));
    expect(events).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(opened).toEqual([]);
  });

  it("don't hold a read beside a public relay past the public relay's answer", async () => {
    const pool = freshPool();
    const started = Date.now();
    const events = await lastValueFrom(pool.request([...LOCALS, PUBLIC], { kinds: [1] }).pipe(toArray()));
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    // Under the straggler grace: every relay asked was accounted for, none waited on.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  // Last: consent is session-wide, so it would leak into the cases above.
  it("are reached when the reader chose them — a typed relay, a pasted bunker:// link", async () => {
    allowLocalRelay(["ws://192.168.1.10:4848/"]);
    expect(isUnreachableLocalRelay("ws://192.168.1.10:4848")).toBe(false);
    // Consent is for that host and port, not the whole LAN.
    expect(isUnreachableLocalRelay("ws://192.168.1.10:9999")).toBe(true);
    expect(isUnreachableLocalRelay("ws://localhost:4869")).toBe(true);
    expect(dedupeRelays(["ws://192.168.1.10:4848", "ws://localhost:4869"])).toEqual(["ws://192.168.1.10:4848/"]);

    const pool = freshPool();
    await lastValueFrom(pool.request(["ws://192.168.1.10:4848"], { kinds: [1] }).pipe(toArray()));
    expect(opened).toEqual(["ws://192.168.1.10:4848/"]);
  });
});
