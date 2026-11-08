// @vitest-environment node
/**
 * A live inbox subscription must not resubscribe as fast as a relay refuses it.
 * The real pool (lib/relayPool) and the real poolTransport.live(), against a fake
 * socket that answers like relay.mwaters.net (strfry 0.9.3, 2026-11-08): every REQ
 * naming kind 1059 is CLOSED with "ERROR: auth-required: ..." — the machine-readable
 * prefix NOT at the start — and AUTH is refused ("relay needs serviceUrl ...").
 */
import { afterEach, describe, expect, it } from "vitest";

const RTT_MS = 20;
let REASON = "";
let reqs = 0;

class StrfryLikeSocket {
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
  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
      this.reply(["AUTH", "challenge"]);
    }, RTT_MS);
  }
  private reply(m: unknown[]) {
    setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(m) }), RTT_MS / 2);
  }
  send(raw: string) {
    const m = JSON.parse(raw);
    if (m[0] === "REQ") {
      reqs++;
      this.reply(["CLOSED", m[1], REASON]);
    } else if (m[0] === "AUTH") {
      this.reply(["OK", m[1].id, false, "error: relay needs serviceUrl to be configured before AUTH can work"]);
    }
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, wasClean: true });
  }
}
(globalThis as { WebSocket: unknown }).WebSocket = StrfryLikeSocket;

const { poolTransport } = await import("./transport");

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
});

/** REQs one open inbox subscription sends in [ms], with the relay CLOSEing each with [reason]. */
async function reqsIn(url: string, reason: string, ms: number) {
  REASON = reason;
  reqs = 0;
  let flagged = 0;
  stop = poolTransport.live(
    url,
    { kinds: [1059], "#p": ["a".repeat(64)], since: 0 },
    { onEvent: () => {}, onEose: () => {}, onAuthRequired: (r) => r && flagged++ },
  );
  await new Promise((r) => setTimeout(r, ms));
  return { reqs, flagged };
}

describe("poolTransport.live against a relay that refuses the REQ", () => {
  it("waits for a login when strfry buries auth-required behind ERROR:", async () => {
    const got = await reqsIn(
      "wss://strfry.example/",
      "ERROR: auth-required: requested filter requires authentication",
      1500,
    );
    expect(got.reqs).toBe(1);
    expect(got.flagged).toBe(1);
  });

  it("waits for a login on a well-formed auth-required too", async () => {
    const got = await reqsIn("wss://wellformed.example/", "auth-required: sign in", 1500);
    expect(got.reqs).toBe(1);
    expect(got.flagged).toBe(1);
  });

  it("backs off on any other close instead of asking again at once", async () => {
    // Before the backoff: ~100 REQs a second here, one per reply.
    const got = await reqsIn("wss://other.example/", "ERROR: something went wrong", 2500);
    expect(got.reqs).toBeLessThanOrEqual(3);
    expect(got.flagged).toBe(0);
  });
});
