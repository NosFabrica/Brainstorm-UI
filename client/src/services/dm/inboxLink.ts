/**
 * The link to the account's inbox relays: the live subscription, and history
 * paged backward below it. Part of the DM engine (services/dm/engine), which
 * composes it.
 *
 *  A. **Live** — one REQ per inbox relay for wraps since `floor − 2 days`, no
 *     `until`. Opened when the account signs in, so the unread badge and the
 *     newest chats are ready before Messages is. It never widens; scrolling
 *     never touches it.
 *  B. **History** — everything older than the floor, paged backward per relay
 *     by `until`+`limit` (lib/dm/pager), only when something on screen asks.
 */
import type { NostrEvent } from "nostr-tools";
import { RelayCursors, type CursorSnapshot } from "@/lib/dm/cursors";
import { BackwardPager, type PagerSnapshot } from "@/lib/dm/pager";
import { GIFT_WRAP_KIND, WRAP_JITTER_SECONDS } from "@/lib/dm/giftWrap";
import type { DmRelayLookup } from "@/lib/dm/inboxRelays";
import type { DmCore } from "./core";
import type { DmEngineState, DmTransport, LiveRelayState } from "./engine";

/** A week of live tail at most; older is history. */
export const LIVE_TAIL_SECONDS = 7 * 24 * 3600;

export interface InboxLinkDeps {
  transport: Pick<DmTransport, "live" | "page" | "onAuthenticated">;
  loadInbox(pubkey: string, opts?: { fresh?: boolean }): Promise<DmRelayLookup>;
}

/** What the link needs from the rest of the engine. */
export interface InboxLinkHost {
  /** A wrap a relay delivered, live or paged. */
  ingest(wrap: NostrEvent, relay: string): void;
  /** Wraps not opened yet, by the relays that delivered them (WrapOpener). */
  unopenedByRelay(): Map<string, number>;
  /** The oldest wrap not opened yet, or `at` (WrapOpener). */
  oldestWaiting(at: number): number;
  /** The paging state changed: save it soon. */
  scheduleState(): void;
}

/** The link's part of the engine's state. */
export type InboxLinkState = Pick<
  DmEngineState,
  "status" | "inboxRelays" | "live" | "liveSynced" | "liveSettled" | "floor" | "downloading" | "history"
>;

const EMPTY_HISTORY: PagerSnapshot = { floor: 0, relays: [], loading: false, exhausted: true, complete: false };

export class InboxLink {
  /** Read by the engine; only the link sets it (and `stop`). */
  status: DmEngineState["status"] = "starting";
  /** The account's inbox relays, as last looked up. Read by the engine. */
  inbox: string[] = [];
  private readonly me: string;
  private live = new Map<string, LiveRelayState>();
  private liveStops: (() => void)[] = [];
  private pager: BackwardPager | null = null;
  private floor = 0;
  private lastSeen?: number;
  private savedCursors?: CursorSnapshot;
  private downloading = false;
  /** Relays whose live subscription has answered (EOSE) since connecting; history waits on it. */
  private readonly liveAnswered = new Set<string>();
  private readonly liveCount = new Map<string, number>();
  private liveSince = 0;
  /** Past this, history stops waiting for slow live answers (see waitingForLive). */
  private liveWaitOver = false;
  /** Bumped by each live connection, so an earlier one's wait timer can't end this one's. */
  private liveGeneration = 0;
  private connectGen = 0;
  private noInboxRetries = 0;
  /** Live relays' oldest wrap before their first EOSE: a capped REQ leaves a band to page. */
  private readonly liveOldest = new Map<string, number>();

  constructor(
    private readonly core: DmCore,
    private readonly deps: InboxLinkDeps,
    private readonly host: InboxLinkHost,
  ) {
    this.me = core.me;
  }

  private get stopped(): boolean {
    return this.core.stopped;
  }

  private changed() {
    this.core.changed();
  }

  /** The paging state the device kept (DeviceCache.restore). */
  restoreSync(lastSeen: number | undefined, cursors: CursorSnapshot | undefined) {
    this.lastSeen = lastSeen;
    this.savedCursors = cursors;
  }

  /** The paging state to keep (DeviceCache.persistState). */
  syncState(): { lastSeen?: number; cursors?: CursorSnapshot } {
    return { lastSeen: this.lastSeen, cursors: this.pager?.cursors.snapshot() ?? this.savedCursors };
  }

  /** Read the account's inbox list again — after setting it up, or changing it in Settings. */
  async refresh(): Promise<void> {
    if (this.stopped) return;
    await this.connect({ fresh: true });
  }

  /** The engine stopped: every subscription closed, history's position kept for the final save. */
  stop() {
    this.status = "stopped";
    this.disconnect();
  }

  private disconnect() {
    for (const stop of this.liveStops) stop();
    this.liveStops = [];
    this.live.clear();
    this.liveOldest.clear();
    this.liveAnswered.clear();
    this.liveCount.clear();
    // Keep how far history got, for the next connect and for what's saved.
    if (this.pager) this.savedCursors = this.pager.cursors.snapshot();
    this.pager?.dispose();
    this.pager = null;
  }

  async connect(opts: { fresh?: boolean } = {}) {
    // Only the latest lookup counts: a slower, older one must not undo a newer list.
    const gen = ++this.connectGen;
    const lookup = await this.deps.loadInbox(this.me, opts).catch((): DmRelayLookup => ({ relays: [], found: false }));
    if (this.stopped || gen !== this.connectGen) return;
    this.disconnect();
    this.inbox = lookup.relays;
    if (!this.inbox.length) {
      this.status = "no-inbox";
      this.changed();
      // Not found may be not found *yet* (relays slow at sign-in): look again, twice, before believing it.
      if (this.noInboxRetries < NO_INBOX_RETRY_MS.length) {
        const wait = NO_INBOX_RETRY_MS[this.noInboxRetries++];
        this.core.clock.set(() => {
          if (!this.stopped && this.status === "no-inbox") void this.refresh();
        }, wait);
      }
      return;
    }
    this.startHistory();
    this.startLive();
    this.status = "ready";
    this.changed();
  }

  /** Where history starts, and how the history cursors are restored. */
  private startHistory(saved?: CursorSnapshot) {
    const now = this.core.now();
    const tail = now - LIVE_TAIL_SECONDS;
    const caughtUp = this.lastSeen !== undefined && this.lastSeen > tail && this.core.seen.size > 0;
    this.floor = caughtUp ? this.lastSeen! : tail;
    const snapshot = saved ?? this.savedCursors;
    // Saved cursors only hold if nothing fell between the last visit and now:
    // otherwise the band since `lastSeen` was never loaded, and resuming below
    // it would skip it for good.
    const cursors = caughtUp && snapshot ? RelayCursors.restore(snapshot) : new RelayCursors(this.floor);
    this.pager = new BackwardPager({
      cursors,
      fetchPage: (relay, f, h) =>
        this.deps.transport.page(
          relay,
          { kinds: [GIFT_WRAP_KIND], "#p": [this.me], until: f.until, limit: f.limit },
          h,
        ),
      onWrap: (wrap, relay) => this.host.ingest(wrap, relay),
      setTimer: this.core.clock.set,
      clearTimer: this.core.clock.clear,
    });
    this.pager.setRelays(this.inbox);
    this.pager.subscribe(() => {
      this.host.scheduleState();
      this.changed();
    });
  }

  private startLive() {
    const since = this.floor - WRAP_JITTER_SECONDS;
    this.liveSince = since;
    this.liveWaitOver = false;
    const generation = ++this.liveGeneration;
    // History waits for each relay's live answer (canPage); after a while, not any more.
    this.core.clock.set(() => {
      if (generation !== this.liveGeneration) return;
      this.liveWaitOver = true;
      this.changed();
    }, LIVE_ANSWER_WAIT_MS);
    for (const relay of this.inbox) {
      this.live.set(relay, "connecting");
      const stop = this.deps.transport.live(
        relay,
        { kinds: [GIFT_WRAP_KIND], "#p": [this.me], since },
        {
          onEvent: (event) => {
            if (!this.liveAnswered.has(relay)) {
              const oldest = this.liveOldest.get(relay);
              if (oldest === undefined || event.created_at < oldest) this.liveOldest.set(relay, event.created_at);
              this.liveCount.set(relay, (this.liveCount.get(relay) ?? 0) + 1);
            }
            this.host.ingest(event, relay);
          },
          onEose: () => {
            if (!this.liveAnswered.has(relay)) this.liveWindowAnswered(relay);
            this.live.set(relay, "synced");
            this.markSeenIfSynced();
            this.changed();
          },
          onDisconnected: () => {
            // Not caught up while the socket is down: `lastSeen` must not move on.
            if (this.live.get(relay) === "synced") {
              this.live.set(relay, "connecting");
              this.changed();
            }
          },
          onAuthRequired: (required) => {
            const current = this.live.get(relay);
            if (required && current !== "synced") this.live.set(relay, "auth");
            else if (!required && current === "auth") this.live.set(relay, "connecting");
            this.changed();
          },
        },
      );
      const stopAuth = this.deps.transport.onAuthenticated(relay, () => this.pager?.retryAuth());
      this.liveStops.push(stop, stopAuth);
    }
  }

  /**
   * A relay's live window has answered. If it came back capped — many wraps,
   * the oldest well above where it asked from — the band below them is
   * history's to fetch: start there. Cursors restored from the last visit
   * sit below that band, so they start over from it (opened wraps are skipped).
   */
  private liveWindowAnswered(relay: string) {
    this.liveAnswered.add(relay);
    const oldest = this.liveOldest.get(relay);
    const count = this.liveCount.get(relay) ?? 0;
    this.liveOldest.delete(relay);
    this.liveCount.delete(relay);
    const pager = this.pager;
    if (!pager || oldest === undefined) return;
    if (!pager.cursors.hasPosition(relay)) {
      pager.startBelow(relay, oldest);
      return;
    }
    const capped = count >= CAPPED_LIVE_AT && oldest > this.liveSince + 3600;
    if (capped) pager.restartBelow(relay, oldest);
  }

  private get liveSynced(): boolean {
    return this.inbox.length > 0 && this.inbox.every((r) => this.live.get(r) === "synced");
  }

  private get liveSettled(): boolean {
    if (!this.inbox.some((r) => this.live.get(r) === "synced")) return false;
    const history = new Map(this.pager?.snapshot().relays.map((r) => [r.url, r.state]) ?? []);
    return this.inbox.every((r) => {
      const page = history.get(r);
      return this.live.get(r) === "synced" || this.live.get(r) === "auth" || page === "stalled" || page === "auth";
    });
  }

  /**
   * Caught up as of now — except for wraps that arrived but aren't opened yet
   * (an extension waits for the reader): the queue isn't kept, so the next
   * visit must ask for them again, and `lastSeen` stays at the oldest.
   */
  markSeenIfSynced(throttle = false) {
    if (!this.liveSynced) return;
    const at = this.host.oldestWaiting(this.core.now());
    // Saved every few minutes, not on every tick: a minute here is lost to the 2-day overlap anyway.
    if (throttle && this.lastSeen !== undefined && at >= this.lastSeen && at - this.lastSeen < 300) return;
    this.lastSeen = at;
    this.host.scheduleState();
  }

  /**
   * Page every inbox relay's history again from the top — the sync view's
   * button, for when something looks missing. Wraps already opened are
   * skipped without asking the signer, so this costs downloads, not prompts.
   */
  refetchHistory(): void {
    if (this.stopped || !this.inbox.length) return;
    this.pager?.dispose();
    this.pager = null;
    this.savedCursors = undefined;
    this.startHistory();
    // Below the live window's oldest on each relay, as on a first visit.
    this.downloadAll();
  }

  /**
   * Page every relay to its end without waiting to be scrolled — the sync
   * view's button. Each relay's next page still waits for the last one to be
   * nearly open (canPage), so this runs at the signer's pace; it ends when no
   * relay has more, or on `stopDownload()`. For this visit only.
   */
  downloadAll(): void {
    if (this.stopped || !this.pager) return;
    this.downloading = true;
    this.changed();
    this.keepDownloading();
  }

  stopDownload(): void {
    if (!this.downloading) return;
    this.downloading = false;
    this.changed();
  }

  /** Runs with every (throttled) state change while downloading. */
  keepDownloading(): void {
    if (!this.downloading || this.stopped || !this.pager) return;
    const relays = this.pager.snapshot().relays;
    if (!relays.some((r) => r.state === "idle" || r.state === "loading" || r.retrying)) {
      this.downloading = false;
      this.changed();
      return;
    }
    this.advanceAll();
  }

  /**
   * Fetching runs ahead of opening otherwise: a marker on screen asks for page
   * after page while the wraps of the last one are still sealed — no rows
   * arrive to push it off screen — and the relay reaches "all history loaded"
   * with thousands unread. A relay waits until its last page is nearly open.
   */
  private canPage(relay: string, unopened = this.host.unopenedByRelay()): boolean {
    return !this.waitingForLive(relay) && (unopened.get(relay) ?? 0) < PAGE_BACKLOG;
  }

  /**
   * History starts below what the live window brought, so it waits for that
   * answer — unless the relay is slow to give it, or wants a login first (its
   * history pages will ask for the same login).
   */
  private waitingForLive(relay: string): boolean {
    return !this.liveWaitOver && !this.liveAnswered.has(relay) && this.live.get(relay) !== "auth";
  }

  advance(relay: string): boolean {
    if (!this.canPage(relay)) return false;
    return this.pager?.advance(relay) ?? false;
  }

  advanceAll(): boolean {
    if (!this.pager) return false;
    const unopened = this.host.unopenedByRelay();
    let any = false;
    for (const relay of this.inbox) if (this.canPage(relay, unopened)) any = this.pager.advance(relay) || any;
    return any;
  }

  retry(relay: string): boolean {
    return this.pager?.retry(relay) ?? false;
  }

  private historyWithBacklog(): PagerSnapshot {
    const snap = this.pager?.snapshot();
    if (!snap) return EMPTY_HISTORY;
    const unopened = this.host.unopenedByRelay();
    return {
      ...snap,
      relays: snap.relays.map((r) => ({
        ...r,
        opening: unopened.get(r.url) ?? 0,
        ...(this.waitingForLive(r.url) ? { waiting: true } : {}),
      })),
    };
  }

  state(): InboxLinkState {
    return {
      status: this.status,
      inboxRelays: this.inbox,
      live: Object.fromEntries(this.live),
      liveSynced: this.liveSynced,
      liveSettled: this.liveSettled,
      floor: this.floor,
      downloading: this.downloading,
      history: this.historyWithBacklog(),
    };
  }
}

/** A live window this full whose oldest wrap is well above where it asked from was probably capped. */
const CAPPED_LIVE_AT = 200;
/** How long history waits for a relay's live answer before going ahead without it. */
const LIVE_ANSWER_WAIT_MS = 20_000;
/** A relay's next history page waits until fewer than this many of its wraps are still unopened. */
const PAGE_BACKLOG = 50;
/** When to look for an inbox list again after finding none. */
const NO_INBOX_RETRY_MS = [20_000, 120_000];
