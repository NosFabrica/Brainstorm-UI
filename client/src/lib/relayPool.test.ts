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
import { BehaviorSubject, combineLatest, filter, firstValueFrom, from, take, toArray } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { RelayPool } from "applesauce-relay";
import { normalizeURL } from "applesauce-core/helpers/url";
import {
  createPool,
  keepRelayAlive,
  profileIndexAnswers,
  relayWake$,
  standaloneRelay,
  wakeableBackoff,
  wakeRelays,
  warmRelay,
} from "./relayPool";
import { PROFILE_RELAYS, SEARCH_RELAY } from "./relays";

/**
 * A relay on a fake socket. `answer` is what it says to any REQ: an event
 * then EOSE (an open relay), or CLOSED auth-required (a gated one).
 */
type Script = (id: string, send: (frame: unknown[]) => void, socket: FakeSocket, filters: unknown[]) => void;
const scripts = new Map<string, Script>();

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
  /** Set once the relay has accepted this socket's NIP-42 AUTH. */
  authed = false;
  constructor(public url: string) {
    setTimeout(() => {
      if (this.url.startsWith(FLAKY) && flakyDropsLeft > 0) {
        flakyDropsLeft--;
        this.readyState = 3;
        this.onerror?.({ type: "error" });
        this.onclose?.({ wasClean: false, code: 1006 });
        return;
      }
      if (this.url.startsWith(DEAD)) {
        this.readyState = 3;
        this.onerror?.({ type: "error" });
        this.onclose?.({ wasClean: false, code: 1006 });
        return;
      }
      this.readyState = 1;
      this.onopen?.({});
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
    setTimeout(() => script?.(id, reply, this, frame.slice(2)), 0);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ wasClean: true });
  }
}

const EVENT: NostrEvent = {
  id: "1".repeat(64),
  kind: 10002,
  pubkey: "a".repeat(64),
  tags: [["r", "wss://open.example"]],
  content: "",
  created_at: 1,
  sig: "s",
} as NostrEvent;
/** What the gated relay serves once a socket has signed in. */
const GATED_EVENT: NostrEvent = { ...EVENT, id: "2".repeat(64) };
const OPEN = "wss://open.example";
const GATED = "wss://gated.example";
/** A relay whose socket never connects — an author's `umbrel.local`, seen 2026-09-24. */
const DEAD = "wss://dead.example";
/** A relay that connects and then says nothing — no event, no EOSE. */
const SLOW = "wss://slow.example";
/**
 * A relay whose next `flakyDropsLeft` connections drop. After a drop the
 * library waits out a reconnect backoff (2s after the first) before the relay
 * is ready to take a REQ again.
 */
const FLAKY = "wss://flaky.example";
let flakyDropsLeft = 0;
/** The open relay answers in the kind it was asked for, so a read of any kind gets its one event. */
scripts.set(OPEN, (id, send, _socket, filters) => {
  const kind = (filters[0] as { kinds?: number[] } | undefined)?.kinds?.[0] ?? EVENT.kind;
  send(["EVENT", id, { ...EVENT, kind }]);
  send(["EOSE", id]);
});
scripts.set(FLAKY, (id, send) => {
  send(["EVENT", id, EVENT]);
  send(["EOSE", id]);
});
scripts.set(GATED, (id, send, socket) => {
  if (socket.authed) {
    send(["EVENT", id, GATED_EVENT]);
    send(["EOSE", id]);
    return;
  }
  send(["AUTH", "challenge-xyz"]);
  send(["CLOSED", id, "auth-required: not authenticated"]);
});

/** The account's signer, as services/relayAuth hands it to the relay. */
const signer = {
  signEvent: async (template: object) =>
    ({ ...template, id: "f".repeat(64), pubkey: "a".repeat(64), sig: "s" }) as NostrEvent,
};

/** Once the gated relay has refused a REQ and sent its challenge, sign in to it. */
async function signInWhenGated(pool: RelayPool) {
  const relay = pool.relay(GATED);
  await firstValueFrom(
    combineLatest([relay.challenge$, relay.authRequiredForRead$]).pipe(
      filter(([challenge, gated]) => !!challenge && gated),
    ),
  );
  await relay.authenticate(signer);
}

const read = (pool: RelayPool, relays = [OPEN, GATED]) =>
  firstValueFrom(
    pool.request(relays, { kinds: [10002], authors: ["a".repeat(64)] }, { eventStore: null }).pipe(toArray()),
  );

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

  // A gated relay or a dead one now fails in milliseconds. A relay waiting out
  // its reconnect backoff has not reported anything yet, so the library's own
  // rule took that one failure as "every relay is done" and the read came back
  // empty. The read must count every relay it asked.
  it("waits for a relay that is reconnecting, even when another has already failed", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    flakyDropsLeft = 1;
    await read(pool, [FLAKY]); // its socket drops; the relay now waits out its backoff
    const events = await read(pool, [DEAD, FLAKY]);
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
  }, 6000);

  // Only one-shot reads skip a gated relay. A live subscription (the NIP-46
  // signer's, for one) waits for the login and then gets that relay's events.
  it.each([
    ["subscription", (pool: RelayPool) => pool.subscription([OPEN, GATED], { kinds: [10002] }, { eventStore: null })],
    // A live filter map, as a subscription holds one (a plain object ends the
    // REQs once sent); keyed by the pool's own spelling of each URL.
    [
      "subscriptionMap",
      (pool: RelayPool) =>
        pool.subscriptionMap(
          new BehaviorSubject({ [normalizeURL(OPEN)]: { kinds: [10002] }, [normalizeURL(GATED)]: { kinds: [10002] } }),
          { eventStore: null },
        ),
    ],
  ])(
    "a live %s waits for a gated relay's login, then receives its events",
    async (_name, subscribe) => {
      const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
      const received = firstValueFrom(subscribe(pool).pipe(take(2), toArray()));
      await signInWhenGated(pool);
      const events = await received;
      expect(events.map((e) => e.id).sort()).toEqual([EVENT.id, GATED_EVENT.id]);
    },
    4000,
  );

  // The control: what the library does on its own, and what the team saw.
  it("(control) a stock pool holds the same reads for the library's 5s fallback", async () => {
    const pool = new RelayPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const started = Date.now();
    await Promise.all([read(pool), read(pool, [OPEN, DEAD]), read(pool, [OPEN, SLOW])]);
    expect(Date.now() - started).toBeGreaterThan(4500);
  }, 9000);
});

/**
 * A relay sends whatever it likes. applesauce-relay passes every EVENT on a
 * REQ's subscription id through, matched or not, so a relay asked for
 * `{ authors: [me], kinds: [3] }` could answer with someone else's contact
 * list, and the app's "newest wins" reads would take it for the user's own
 * (services/socialActions re-signed it). The pool drops what was not asked for.
 */
describe("events a relay sends that the filter didn't ask for", () => {
  const ME = "a".repeat(64);
  const STRANGER = "b".repeat(64);
  const LIAR = "wss://liar.example";
  const mine = { ...EVENT, id: "3".repeat(64), kind: 3, pubkey: ME, created_at: 10 } as NostrEvent;
  const foreign = { ...EVENT, id: "4".repeat(64), kind: 3, pubkey: STRANGER, created_at: 99 } as NostrEvent;
  const wrongKind = { ...EVENT, id: "5".repeat(64), kind: 1, pubkey: ME, created_at: 99 } as NostrEvent;
  scripts.set(LIAR, (id, send) => {
    send(["EVENT", id, foreign]);
    send(["EVENT", id, wrongKind]);
    send(["EVENT", id, { kind: 3, pubkey: ME }]);
    send(["EVENT", id, mine]);
    send(["EOSE", id]);
  });
  const asked = { kinds: [3], authors: [ME] };

  it("are dropped from a one-shot read", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const events = await firstValueFrom(pool.request([LIAR], asked, { eventStore: null }).pipe(toArray()));
    expect(events.map((e) => e.id)).toEqual([mine.id]);
  }, 4000);

  it("are dropped from a live subscription", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const events = await firstValueFrom(
      // The pool's subscription carries events only: the group drops EOSE before it.
      pool.subscription([LIAR], asked, { eventStore: null }).pipe(take(1), toArray()),
    );
    expect(events.map((e) => e.id)).toEqual([mine.id]);
  }, 4000);

  it("are dropped from the raw frames pool.req and relay.req hand out", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    for (const req of [pool.req([LIAR], asked), pool.relay(LIAR).req(asked, { waitForAuth: false })]) {
      const frames = await firstValueFrom(
        req.pipe(
          filter((m) => m.type === "EVENT" || m.type === "EOSE"),
          take(2),
          toArray(),
        ),
      );
      expect(frames.map((m) => (m.type === "EVENT" ? m.event.id : m.type))).toEqual([mine.id, "EOSE"]);
    }
  }, 4000);

  it("are dropped on a socket of its own, outside the pool (the search page's side socket)", async () => {
    const relay = standaloneRelay(LIAR, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    const events = await firstValueFrom(relay.request(asked).pipe(toArray()));
    expect(events.map((e) => e.id)).toEqual([mine.id]);
    relay.close();
  }, 4000);

  it("a NIP-50 search term is the relay's to judge: an event that matches the rest of the filter is kept", async () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const events = await firstValueFrom(
      pool.request([LIAR], { ...asked, search: "anything" }, { eventStore: null }).pipe(toArray()),
    );
    expect(events.map((e) => e.id)).toEqual([mine.id]);
  }, 4000);
});

describe("purplepag.es, the profile index", () => {
  const PURPLE = "wss://purplepag.es";
  /** The filters each REQ that reached it carried. */
  const received: unknown[][] = [];
  scripts.set(PURPLE, (id, send) => send(["EOSE", id]));
  class RecordingSocket extends FakeSocket {
    send(data: string) {
      const frame = JSON.parse(data) as unknown[];
      if (frame[0] === "REQ" && this.url.startsWith(PURPLE)) received.push(frame.slice(2));
      super.send(data);
    }
  }

  it("is asked only what it serves: profiles, contact lists and replaceable lists, by kind", () => {
    expect(profileIndexAnswers({ kinds: [0] })).toBe(true);
    expect(profileIndexAnswers({ kinds: [3, 10002, 10040, 10050] })).toBe(true);
    expect(profileIndexAnswers({ kinds: [0, 1] })).toBe(false);
    expect(profileIndexAnswers({ kinds: [30078] })).toBe(false);
    expect(profileIndexAnswers({ ids: ["1".repeat(64)] })).toBe(false);
  });

  it("gets no REQ for a read it can't answer, and the read doesn't wait on it", async () => {
    received.length = 0;
    const pool = createPool({ WebSocket: RecordingSocket as unknown as typeof WebSocket });
    const started = Date.now();
    const events = await firstValueFrom(
      pool.request([OPEN, PURPLE], { kinds: [1], authors: ["a".repeat(64)] }, { eventStore: null }).pipe(toArray()),
    );
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    expect(received).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  }, 4000);

  it("gets only the filters it can answer from a mixed read", async () => {
    received.length = 0;
    const pool = createPool({ WebSocket: RecordingSocket as unknown as typeof WebSocket });
    await firstValueFrom(
      pool
        .request(
          [PURPLE],
          [
            { kinds: [0], authors: ["a".repeat(64)] },
            { kinds: [30078], authors: ["a".repeat(64)] },
          ],
          { eventStore: null },
        )
        .pipe(toArray()),
    );
    expect(received).toEqual([[{ kinds: [0], authors: ["a".repeat(64)] }]]);
  }, 4000);
});

describe("how long an idle socket stays open", () => {
  it("minutes for the relays the app comes back to, the library's 30s for the rest", () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    expect(pool.relay(SEARCH_RELAY).keepAlive).toBe(5 * 60_000);
    for (const url of PROFILE_RELAYS) expect(pool.relay(url).keepAlive).toBe(5 * 60_000);
    expect(pool.relay("wss://someones-outbox.example/").keepAlive).toBe(30_000);
  });

  it("minutes for an inbox relay too, whether its socket is open yet or not", () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const open = pool.relay("wss://inbox-open.example/");
    keepRelayAlive("wss://inbox-open.example", pool);
    keepRelayAlive("wss://inbox-later.example/", pool);
    expect(open.keepAlive).toBe(5 * 60_000);
    expect(pool.relay("wss://inbox-later.example/").keepAlive).toBe(5 * 60_000);
  });
});

describe("warming a relay", () => {
  it("opens the socket before any REQ, and the first read rides it", async () => {
    const opened: string[] = [];
    const sent: unknown[][] = [];
    class CountingSocket extends FakeSocket {
      constructor(url: string) {
        super(url);
        opened.push(url);
      }
      send(data: string) {
        sent.push(JSON.parse(data) as unknown[]);
        super.send(data);
      }
    }
    const pool = createPool({ WebSocket: CountingSocket as unknown as typeof WebSocket });
    const relay = pool.relay(OPEN);
    warmRelay(relay);
    await firstValueFrom(relay.connected$.pipe(filter(Boolean)));
    expect(opened).toHaveLength(1);
    expect(sent).toEqual([]);

    // Warming again while connected does nothing.
    warmRelay(relay);
    const events = await read(pool, [OPEN]);
    expect(events.map((e) => e.id)).toEqual([EVENT.id]);
    expect(opened).toHaveLength(1);
    // Still open after the read: the keep-alive holds it for the next one.
    expect(relay.connected).toBe(true);
  });
});

describe("the app coming back", () => {
  it("cuts a dropped relay's reconnect backoff short", () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const relay = pool.relay("wss://asleep.example/");
    // Dropped while away, many times over: the library's next try is minutes out.
    relay.attempts$.next(12);
    (relay as unknown as { startReconnectTimer(e: Error): void }).startReconnectTimer(new Error("suspended"));
    expect(relay.ready).toBe(false);
    wakeRelays(pool);
    expect(relay.ready).toBe(true);
    expect(relay.attempts$.value).toBe(0);
  });

  it("leaves a relay that is ready alone", () => {
    const pool = createPool({ WebSocket: FakeSocket as unknown as typeof WebSocket });
    const relay = pool.relay("wss://awake.example/");
    relay.attempts$.next(2);
    wakeRelays(pool);
    expect(relay.ready).toBe(true);
    expect(relay.attempts$.value).toBe(2);
  });

  it("ends a live subscription's wait to retry", () => {
    const delay = wakeableBackoff(30_000);
    let fired = false;
    // The 25th retry would wait 25s.
    const sub = from(delay(new Error("down"), 25)).subscribe(() => (fired = true));
    expect(fired).toBe(false);
    relayWake$.next();
    expect(fired).toBe(true);
    sub.unsubscribe();
  });
});
