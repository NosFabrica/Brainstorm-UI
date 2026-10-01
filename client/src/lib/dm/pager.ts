/**
 * Pages one account's gift-wrap history backward, each relay on its own — a
 * port of Amethyst's `BackwardRelayPager` + `PerRelayLoadTracker`.
 *
 * The live subscription (lib/dm/engine) covers everything after the floor and
 * never widens. Everything older comes through here: only relays something has
 * asked for carry a REQ, a relay that finishes its page parks until asked again,
 * and no relay waits for another. A fast relay can race to the bottom while a
 * slow, login-walled one catches up at its own pace.
 *
 * States a relay can be in:
 *  - `idle`    parked: has more, waiting for its marker
 *  - `loading` a page is in flight
 *  - `done`    answered an empty page with EOSE: nothing older on it
 *  - `stalled` went silent for `silenceMs`, or closed the REQ — retry to resume
 *  - `auth`    wants a NIP-42 login before it will answer
 *
 * The transport is injected so the state machine can be tested without sockets.
 */
import type { NostrEvent } from "nostr-tools";
import { RelayCursors } from "./cursors";

export type RelayPagingState = "idle" | "loading" | "done" | "stalled" | "auth";

export interface RelayProgress {
  url: string;
  state: RelayPagingState;
  /** Oldest wrap time delivered (the floor before the first page). */
  reachedUntil: number;
  /** Every message written after this moment has arrived from this relay. 0 when done. */
  completeTo: number;
  /** The `until` of the page in flight, while loading. */
  requestedUntil?: number;
  pages: number;
  /** Why it stalled, when it did. */
  reason?: string;
  /**
   * Wraps this relay delivered that aren't opened yet (services/dm/engine).
   * Paging waits on them: a page isn't loaded until it can be read.
   */
  opening?: number;
}

export interface PagerSnapshot {
  floor: number;
  relays: RelayProgress[];
  /** Some page is in flight. */
  loading: boolean;
  /** Nothing more is reachable right now: every relay is done, stalled or waiting for a login. */
  exhausted: boolean;
  /** Every relay is done — the whole history is in. */
  complete: boolean;
}

export interface PageHandlers {
  onEvent(event: NostrEvent): void;
  onEose(): void;
  /** The relay closed the REQ; `authRequired` when it asked for a login. */
  onClosed(reason: string, authRequired: boolean): void;
}

/** Start one page on one relay; returns a function that cancels it. */
export type FetchPage = (relay: string, filter: { until: number; limit: number }, handlers: PageHandlers) => () => void;

export interface PagerOptions {
  cursors: RelayCursors;
  fetchPage: FetchPage;
  /** Every wrap delivered by a page, for the caller to open and store. */
  onWrap: (event: NostrEvent, relay: string) => void;
  limit?: number;
  silenceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** A browser tab has no use for Amethyst's 10,000-event pages. */
export const PAGE_LIMIT = 500;
/** No event and no EOSE for this long: the relay is stalled (per relay, unlike Amethyst's global clock). */
export const SILENCE_MS = 15_000;

interface Live {
  cancel: () => void;
  timer?: unknown;
}

export class BackwardPager {
  private relays: string[] = [];
  private readonly state = new Map<string, { state: RelayPagingState; pages: number; reason?: string }>();
  private readonly live = new Map<string, Live>();
  private readonly listeners = new Set<() => void>();
  private snap: PagerSnapshot | null = null;
  private disposed = false;
  private readonly limit: number;
  private readonly silenceMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly opts: PagerOptions) {
    this.limit = opts.limit ?? PAGE_LIMIT;
    this.silenceMs = opts.silenceMs ?? SILENCE_MS;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get cursors(): RelayCursors {
    return this.opts.cursors;
  }

  /** The relays history comes from — the account's inbox relays. */
  setRelays(urls: string[]): void {
    const next = [...new Set(urls)];
    for (const url of this.relays) if (!next.includes(url)) this.stop(url);
    this.relays = next;
    this.changed();
  }

  private entry(url: string) {
    let e = this.state.get(url);
    if (!e) {
      e = { state: this.opts.cursors.isDone(url) ? "done" : "idle", pages: 0 };
      this.state.set(url, e);
    }
    return e;
  }

  /** Load the next page on one relay. False when it is busy, finished, stalled or waiting for a login. */
  advance(url: string): boolean {
    if (this.disposed || !this.relays.includes(url)) return false;
    const e = this.entry(url);
    if (e.state !== "idle") return false;
    if (!this.opts.cursors.advance(url)) {
      e.state = "done";
      this.changed();
      return false;
    }
    const until = this.opts.cursors.requestedUntil(url)!;
    e.state = "loading";
    e.pages++;
    e.reason = undefined;
    const live: Live = { cancel: () => {} };
    this.live.set(url, live);
    const arm = () => {
      if (live.timer !== undefined) this.clearTimer(live.timer);
      live.timer = this.setTimer(() => this.finish(url, live, "stalled", "no answer"), this.silenceMs);
    };
    arm();
    live.cancel = this.opts.fetchPage(
      url,
      { until, limit: this.limit },
      {
        onEvent: (event) => {
          if (this.live.get(url) !== live) return;
          arm();
          this.opts.cursors.onEvent(url, event.created_at);
          this.opts.onWrap(event, url);
        },
        onEose: () => {
          if (this.live.get(url) !== live) return;
          const { done } = this.opts.cursors.onEose(url);
          this.finish(url, live, done ? "done" : "idle");
        },
        onClosed: (reason, authRequired) => {
          if (this.live.get(url) !== live) return;
          this.finish(url, live, authRequired ? "auth" : "stalled", reason);
        },
      },
    );
    this.changed();
    return true;
  }

  /** One page from every relay that can take one — for an empty feed, or "Keep looking". */
  advanceAll(): boolean {
    let any = false;
    for (const url of this.relays) any = this.advance(url) || any;
    return any;
  }

  /** Try a stalled or login-walled relay again. */
  retry(url: string): boolean {
    const e = this.entry(url);
    if (e.state !== "stalled" && e.state !== "auth") return false;
    e.state = "idle";
    e.reason = undefined;
    return this.advance(url);
  }

  /** Every relay waiting on a login, retried — call when a relay has just signed in. */
  retryAuth(): void {
    for (const url of this.relays) if (this.entry(url).state === "auth") this.retry(url);
  }

  private finish(url: string, live: Live, state: RelayPagingState, reason?: string) {
    if (this.live.get(url) !== live) return;
    if (live.timer !== undefined) this.clearTimer(live.timer);
    this.live.delete(url);
    live.cancel();
    const e = this.entry(url);
    e.state = state;
    e.reason = reason;
    this.changed();
  }

  private stop(url: string) {
    const live = this.live.get(url);
    if (!live) return;
    if (live.timer !== undefined) this.clearTimer(live.timer);
    this.live.delete(url);
    live.cancel();
    const e = this.entry(url);
    if (e.state === "loading") e.state = "idle";
  }

  snapshot(): PagerSnapshot {
    if (this.snap) return this.snap;
    const cursors = this.opts.cursors;
    const relays = this.relays.map((url): RelayProgress => {
      const e = this.entry(url);
      return {
        url,
        state: e.state,
        reachedUntil: cursors.reachedUntil(url),
        completeTo: cursors.completeTo(url),
        requestedUntil: e.state === "loading" ? cursors.requestedUntil(url) : undefined,
        pages: e.pages,
        reason: e.reason,
      };
    });
    this.snap = {
      floor: cursors.floor,
      relays,
      loading: relays.some((r) => r.state === "loading"),
      exhausted: relays.every((r) => r.state !== "idle" && r.state !== "loading"),
      complete: relays.length > 0 && relays.every((r) => r.state === "done"),
    };
    return this.snap;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    this.snap = null;
    for (const l of [...this.listeners]) l();
  }

  dispose(): void {
    this.disposed = true;
    for (const url of [...this.live.keys()]) this.stop(url);
    this.listeners.clear();
  }
}
