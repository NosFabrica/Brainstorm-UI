/**
 * Per-relay `until`+`limit` cursors for one account's gift-wrap history — a
 * port of Amethyst's `RelayLoadingCursors` (quartz, nip01Core/relay/client/paging).
 *
 * Why `until`+`limit` and not a time window: a `since`/`until` slice that comes
 * back empty can't tell "nothing older here" from "a quiet stretch". `until`
 * plus `limit` returns the newest N events older than `until`, skipping gaps,
 * so an empty page with EOSE is a gap-proof "this relay has nothing older".
 *
 * Two cursors per relay, deliberately apart:
 *  - `requested` — the `until` the REQ carries. Moves only in `advance`, so a
 *    relay that finished a page parks on the same filter until something on
 *    screen asks for more. This is what makes paging demand-driven.
 *  - `reached` — the oldest wrap `created_at` delivered. Moves on EOSE; the
 *    next page starts just below it.
 *
 * The cursors are wrap times, not message times. A wrap is back-dated up to two
 * days (NIP-59), so a relay that reached D has delivered every message written
 * after D + 2 days — `completeTo` — and maybe some older ones too.
 */
import { WRAP_JITTER_SECONDS } from "./giftWrap";

interface Cursor {
  requested?: number;
  reached?: number;
  done: boolean;
  pageCount: number;
  pageOldest: number;
}

/** What survives a reload: how far each relay got, and which ones are finished. */
export interface CursorSnapshot {
  floor: number;
  relays: Record<string, { reached?: number; done?: boolean }>;
}

export class RelayCursors {
  private readonly cursors = new Map<string, Cursor>();

  /**
   * Where history starts: the live subscription covers everything after it.
   * Pinned once per scope so it doesn't drift with the clock — a relay that
   * hasn't delivered yet reports the floor as its reached point, and a moving
   * floor would make an on-screen marker re-fire on a static screen.
   */
  constructor(readonly floor: number) {}

  private cursor(relay: string): Cursor {
    let c = this.cursors.get(relay);
    if (!c) {
      c = { done: false, pageCount: 0, pageOldest: Number.POSITIVE_INFINITY };
      this.cursors.set(relay, c);
    }
    return c;
  }

  requestedUntil(relay: string): number | undefined {
    return this.cursor(relay).requested;
  }

  /** The oldest wrap time this relay has delivered, or the floor before its first page. */
  reachedUntil(relay: string): number {
    return this.cursor(relay).reached ?? this.floor;
  }

  /** Every message written after this moment is in, as far as this relay goes. */
  completeTo(relay: string): number {
    const c = this.cursor(relay);
    if (c.done) return 0;
    if (c.reached === undefined) return this.floor;
    return Math.min(this.floor, c.reached + WRAP_JITTER_SECONDS);
  }

  /**
   * The live subscription's first answer reached down only to `at`, above the
   * floor — a relay that caps an unlimited REQ. History starts there instead,
   * so the band between is paged rather than skipped. Only before any page.
   */
  startBelow(relay: string, at: number): void {
    const c = this.cursor(relay);
    if (c.requested !== undefined || c.reached !== undefined || c.done || at <= this.floor) return;
    c.reached = at;
  }

  isDone(relay: string): boolean {
    return this.cursor(relay).done;
  }

  /** Point the relay's REQ at its next, older page. False once it has hit the bottom. */
  advance(relay: string): boolean {
    const c = this.cursor(relay);
    if (c.done) return false;
    // Inclusive: a full page cut in the middle of a second leaves the rest of
    // that second for the next one. A relay with nothing older answers only
    // what we already have, and `onEose` calls it done.
    c.requested = c.reached !== undefined ? c.reached : this.floor;
    c.pageCount = 0;
    c.pageOldest = Number.POSITIVE_INFINITY;
    return true;
  }

  onEvent(relay: string, createdAt: number): void {
    const c = this.cursor(relay);
    c.pageCount++;
    if (createdAt < c.pageOldest) c.pageOldest = createdAt;
  }

  /**
   * Close the page on EOSE. An empty page means the relay is done. So does a
   * page that brought nothing older than we had — a relay echoing its newest
   * events would otherwise pin the cursor and be asked for the same window
   * forever.
   */
  onEose(relay: string): { done: boolean; count: number } {
    const c = this.cursor(relay);
    const count = c.pageCount;
    if (count === 0) c.done = true;
    else if (c.reached === undefined || c.pageOldest < c.reached) c.reached = c.pageOldest;
    else c.done = true;
    return { done: c.done, count };
  }

  /** Relays asked at least once and not finished. */
  armed(relays: Iterable<string>): string[] {
    return [...relays].filter((r) => {
      const c = this.cursor(r);
      return c.requested !== undefined && !c.done;
    });
  }

  /** How far back every relay in `relays` has got — the conservative "loaded to here". */
  deepestReached(relays: string[]): number {
    const open = relays.filter((r) => !this.isDone(r));
    if (!open.length) return 0;
    return Math.max(...open.map((r) => this.reachedUntil(r)));
  }

  snapshot(): CursorSnapshot {
    const relays: CursorSnapshot["relays"] = {};
    for (const [url, c] of this.cursors) {
      if (c.reached !== undefined || c.done) relays[url] = { reached: c.reached, done: c.done || undefined };
    }
    return { floor: this.floor, relays };
  }

  /** Rebuild from a snapshot. Nothing is armed: paging resumes only when asked. */
  static restore(snapshot: CursorSnapshot): RelayCursors {
    const cursors = new RelayCursors(snapshot.floor);
    for (const [url, saved] of Object.entries(snapshot.relays ?? {})) {
      const c = cursors.cursor(url);
      if (typeof saved.reached === "number" && saved.reached <= snapshot.floor) c.reached = saved.reached;
      c.done = !!saved.done;
    }
    return cursors;
  }
}
