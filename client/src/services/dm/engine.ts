/**
 * One account's private messages (NIP-17), end to end: what arrives, what is
 * opened, what is kept, what is sent.
 *
 * Two subscriptions, as in Amethyst (amethyst/plans/archive/2026-06-01-dm-live-tail-and-history-slices.md):
 *
 *  A. **Live** — one REQ per inbox relay for wraps since `floor − 2 days`, no
 *     `until`. Opened when the account signs in, so the unread badge and the
 *     newest chats are ready before Messages is. It never widens; scrolling
 *     never touches it.
 *  B. **History** — everything older than the floor, paged backward per relay
 *     by `until`+`limit` (lib/dm/pager), only when something on screen asks.
 *
 * The floor is the last time this device had the live subscription caught up
 * (`lastSeen`), but never more than a week back — a long absence is left to
 * history paging rather than pulled in one burst. A wrap's date can be up to
 * two days before its message, so the live REQ starts two days below the floor.
 *
 * Opening a wrap takes two NIP-44 decrypts by the account's signer. A local key
 * that can unlock silently opens everything as it arrives; an extension or a
 * remote signer waits until the reader opens Messages (`allowDecrypt`), so
 * signing in never sets off a burst of approval prompts.
 */
import type { NostrEvent } from "nostr-tools";
import type { SignerFailure as AnySignerFailure } from "@/accounts/signing";
import { RelayCursors } from "@/lib/dm/cursors";
import { BackwardPager, type PageHandlers, type PagerSnapshot } from "@/lib/dm/pager";
import { GIFT_WRAP_KIND, WRAP_JITTER_SECONDS, type Decrypt, type SealSigner } from "@/lib/dm/giftWrap";
import type { DmStore, Delivery, DmMessage } from "@/lib/dm/store";
import { onAppResume } from "@/lib/appResume";
import type { DmRelayLookup } from "@/lib/dm/inboxRelays";
import type { CustomEmoji } from "@/lib/customEmoji";
import type { DmCacheBackend, Sealer } from "@/lib/dm/cache";
import { makeClock, type Clock } from "./clock";
import { DmCore } from "./core";
import { DeviceCache } from "./deviceCache";
import { WrapOpener } from "./wrapOpener";
import { Outbox } from "./outbox";

/** A week of live tail at most; older is history. */
export const LIVE_TAIL_SECONDS = 7 * 24 * 3600;

export type LiveRelayState = "connecting" | "synced" | "auth";

export interface LiveHandlers {
  onEvent(event: NostrEvent): void;
  onEose(): void;
  /** The relay wants a NIP-42 login before it will answer (true), or has one (false). */
  onAuthRequired(required: boolean): void;
  /** The socket dropped; the subscription comes back (and EOSEs again) on reconnect. */
  onDisconnected?(): void;
}

export type WrapFilter = { kinds: number[]; "#p": string[]; since?: number; until?: number; limit?: number };

export type PublishResult = Pick<Delivery, "message" | "auth" | "unreachable" | "dropped" | "notice"> & { ok: boolean };

export interface DmTransport {
  live(relay: string, filter: WrapFilter, handlers: LiveHandlers): () => void;
  page(relay: string, filter: WrapFilter, handlers: PageHandlers): () => void;
  /** `auth`: refused until the sender signs in (NIP-42). `unreachable`: never connected. */
  publish(relay: string, event: NostrEvent): Promise<PublishResult>;
  /** Calls back each time the relay completes a NIP-42 login. */
  onAuthenticated(relay: string, callback: () => void): () => void;
}

/**
 * accounts/signing's reading of a signer failure, where a missing extension is
 * one more "unreachable". `refused`: the signer said no. `failed`: it threw
 * something that isn't a no, a timeout or a broken payload — Alby locked since
 * this page enabled it ("Password is not set") — so it may never have asked the
 * reader at all.
 */
export type SignerFailure = Exclude<AnySignerFailure, "missing">;

export interface DmAccount {
  pubkey: string;
  /** Undefined when the signer can't do NIP-44 at all. */
  decrypt?: Decrypt;
  sealSigner?: SealSigner;
  /** Whether opening messages can start without the reader asking. */
  canOpenInBackground(): Promise<boolean>;
  classify(error: unknown): SignerFailure;
  /** The signer's own words for a failure, when they are its and not ours. */
  explain?(error: unknown): string | undefined;
}

export interface DmEngineDeps {
  transport: DmTransport;
  loadInbox(pubkey: string, opts?: { fresh?: boolean }): Promise<DmRelayLookup>;
  cache?: DmCacheBackend | null;
  sealer?: Sealer;
  now?: () => number;
  /**
   * The most wraps open at once. Default 2; more for a NIP-46 signer, which answers
   * many at a time. The engine runs below it whenever the signer pushes back.
   */
  concurrency?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  setRepeating?: (fn: () => void, ms: number) => unknown;
  clearRepeating?: (handle: unknown) => void;
  /** Whether the device has a connection (navigator.onLine). */
  online?: () => boolean;
  /** Calls back when the connection comes back; returns a stop function. */
  onOnline?: (callback: () => void) => () => void;
  /** Calls back when the app comes back to the foreground; returns a stop function. */
  onResume?: (callback: () => void) => () => void;
  /** How long one wrap may take to open before its slot is taken back (default 45s). */
  decryptTimeoutMs?: number;
  /**
   * Give up early on a request the signer seems to have dropped (it answered a later
   * one, or has been answering fast and this one sat a whole check). For NIP-46, where
   * Amethyst drops requests past its rate limit. Never for an extension: its requests
   * run one at a time behind the one still out, so asking again only queues behind it,
   * and the extension's own verdict on the wrap (accounts/extension) would land on a
   * request already abandoned — the wrap stalled the inbox on every visit.
   */
  dropDetection?: boolean;
  /** Milliseconds, for timing how fast the signer answers (default Date.now). */
  clockMs?: () => number;
}

export type DmPause = "waiting" | "cancelled" | "unreachable" | "refused" | "failed" | "wrong-account" | "no-nip44";

export interface DmEngineState {
  status: "starting" | "no-inbox" | "ready" | "stopped";
  inboxRelays: string[];
  live: Record<string, LiveRelayState>;
  /** Every inbox relay has answered the live subscription at least once. */
  liveSynced: boolean;
  /**
   * Enough to show what's here: a relay has answered, and the rest have too,
   * or are waiting on a login, or stopped responding. One dead relay doesn't
   * keep a chat "loading" forever.
   */
  liveSettled: boolean;
  /** Relays that refused a message until the reader signs in to them. */
  sendAuth: string[];
  floor: number;
  /** Wraps waiting to be opened. */
  queued: number;
  /** Why opening is on hold, if it is. */
  paused?: DmPause;
  /**
   * What the signer said when it stopped opening (`refused`, `failed`) — "permission
   * denied", "Password is not set": the one clue to a signer that never prompted.
   */
  pauseDetail?: string;
  /** Wraps that can never be opened (a broken payload). */
  failed: number;
  /**
   * Wraps the signer kept turning down while it opened others — left for this
   * visit, not forgotten: `retrySetAside()` (or the next visit) tries again.
   */
  setAside: number;
  /** What each inbox relay has delivered this visit, and how much this visit opened — the sync view. */
  sync: { received: Record<string, number>; opened: number };
  /** Paging every relay to its end on its own (`downloadAll`), not waiting to be scrolled. */
  downloading: boolean;
  history: PagerSnapshot;
}

export interface SendResult {
  ok: boolean;
  message?: DmMessage;
  /** Recipients with no inbox relays — NIP-17 says not to send to them. */
  missing?: string[];
  error?: string;
}

const EMPTY_HISTORY: PagerSnapshot = { floor: 0, relays: [], loading: false, exhausted: true, complete: false };

export class DmEngine {
  readonly store: DmStore;
  private readonly me: string;
  /** What the parts share, the one `stopped` flag among it. */
  private readonly core: DmCore;
  private readonly clock: Clock;
  /** What this device keeps: restored at start, written back as it changes. */
  private readonly device: DeviceCache;
  /** The wraps that arrived, opened at the signer's pace. */
  private readonly opener: WrapOpener;
  /** What is sent, and kept until everyone has it. */
  private readonly outbox: Outbox;

  private inbox: string[] = [];
  private status: DmEngineState["status"] = "starting";
  private live = new Map<string, LiveRelayState>();
  private liveStops: (() => void)[] = [];
  private pager: BackwardPager | null = null;
  private floor = 0;
  private lastSeen?: number;

  /** Wrap ids already opened (or given up on). */
  private readonly seen: Set<string>;
  /** wrap id → message id, to merge relays when the same wrap arrives again. */
  private readonly wrapToMessage: Map<string, string>;
  private downloading = false;
  private readonly receivedBy = new Map<string, Set<string>>();
  /** Relays whose live subscription has answered (EOSE) since connecting; history waits on it. */
  private readonly liveAnswered = new Set<string>();
  private readonly liveCount = new Map<string, number>();
  private liveSince = 0;
  /** Past this, history stops waiting for slow live answers (see waitingForLive). */
  private liveWaitOver = false;
  /** Bumped by each live connection, so an earlier one's wait timer can't end this one's. */
  private liveGeneration = 0;

  private stopOnline?: () => void;
  private starting?: Promise<void>;
  private hydrating?: Promise<void>;
  private connecting?: Promise<void>;
  private connectGen = 0;
  private noInboxRetries = 0;
  /** Live relays' oldest wrap before their first EOSE: a capped REQ leaves a band to page. */
  private readonly liveOldest = new Map<string, number>();
  private ticker: unknown;
  private readonly listeners = new Set<() => void>();
  private snap: DmEngineState | null = null;
  constructor(
    private readonly account: DmAccount,
    private readonly deps: DmEngineDeps,
  ) {
    this.me = account.pubkey;
    this.clock = makeClock(deps);
    this.core = new DmCore(this.me, this.clock, deps.online ?? onlineNow, () => this.changed());
    this.store = this.core.store;
    this.seen = this.core.seen;
    this.wrapToMessage = this.core.wrapToMessage;
    this.device = new DeviceCache(this.core, deps.cache ?? null, deps.sealer, {
      ingest: (wrap, relay) => this.ingest(wrap, relay),
      restoreSync: (lastSeen, cursors) => {
        this.lastSeen = lastSeen;
        this.savedCursors = cursors;
      },
      syncState: () => ({
        lastSeen: this.lastSeen,
        cursors: this.pager?.cursors.snapshot() ?? this.savedCursors,
      }),
      restoreOutbox: (sealed) => this.outbox.restore(sealed),
      sealOutbox: () => this.outbox.seal(),
    });
    this.opener = new WrapOpener(
      this.core,
      account,
      { concurrency: deps.concurrency, decryptTimeoutMs: deps.decryptTimeoutMs, dropDetection: deps.dropDetection },
      {
        keepFailed: (wrapId, at, reason) => this.device.keepFailed(wrapId, at, reason),
        keepOpened: (message) => this.device.keepOpened(message),
        onDrained: () => this.markSeenIfSynced(),
      },
    );
    this.outbox = new Outbox(this.core, account, deps, {
      status: () => this.status,
      whenStarted: () => this.starting,
      inbox: () => this.inbox,
      beginSeal: () => this.opener.beginSeal(),
      endSeal: () => this.opener.endSeal(),
      keepOpened: (message) => this.device.keepOpened(message),
      keepFailed: (wrapId, at, reason) => this.device.keepFailed(wrapId, at, reason),
      scheduleState: () => this.device.scheduleState(),
    });
  }

  private get stopped(): boolean {
    return this.core.stopped;
  }

  private now(): number {
    return this.clock.now();
  }

  get pubkey(): string {
    return this.me;
  }

  // ─── lifecycle ──────────────────────────────────────────────────────────

  start(): Promise<void> {
    this.starting ??= this.run();
    return this.starting;
  }

  /**
   * Resolves once the newest messages kept on this device are back in the store
   * — the inbox's top and anything recent. Older ones follow when Messages
   * opens; they predate this visit, so nothing counts them as news.
   */
  hydrated(): Promise<void> {
    return this.hydrating ?? Promise.resolve();
  }

  private async run(): Promise<void> {
    // Connecting waits for which wraps the device holds, not for their contents
    // (see `restore`): the newest messages open beside the connect.
    const restoring = this.device.restore();
    this.hydrating = restoring.then(() => this.device.hydrateRows());
    await restoring;
    if (this.stopped) return;
    this.opener.start();
    this.connecting = this.connect();
    await Promise.all([this.connecting, this.hydrating]);
    // Stopped during the lookup (an account switch): register nothing that would outlive it.
    if (this.stopped) return;
    this.flushOutbox();
    const stopOnline = (this.deps.onOnline ?? onWindowOnline)(() => {
      this.outbox.resetAttempts();
      this.flushOutbox();
    });
    // Back in front: send what waited, within each message's retry budget — a tab
    // switch is not the connection coming back, and must not reset it.
    const stopResume = (this.deps.onResume ?? onComeBack)(() => this.flushOutbox());
    this.stopOnline = () => {
      stopOnline();
      stopResume();
    };
    this.ticker = this.clock.repeat(() => this.tick(), 60_000);
  }

  stop(): void {
    this.core.stopped = true;
    this.status = "stopped";
    this.disconnect();
    this.outbox.stop();
    this.stopOnline?.();
    this.opener.stop();
    if (this.ticker !== undefined) this.clock.clearRepeat(this.ticker);
    this.device.stop();
    this.changed();
    this.listeners.clear();
  }

  /** Read the account's inbox list again — after setting it up, or changing it in Settings. */
  async refreshInbox(): Promise<void> {
    if (this.stopped) return;
    this.connecting = this.connect({ fresh: true });
    await this.connecting;
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

  private async connect(opts: { fresh?: boolean } = {}) {
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
        this.clock.set(() => {
          if (!this.stopped && this.status === "no-inbox") void this.refreshInbox();
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
  private startHistory(saved?: import("@/lib/dm/cursors").CursorSnapshot) {
    const now = this.now();
    const tail = now - LIVE_TAIL_SECONDS;
    const caughtUp = this.lastSeen !== undefined && this.lastSeen > tail && this.seen.size > 0;
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
      onWrap: (wrap, relay) => this.ingest(wrap, relay),
      setTimer: this.clock.set,
      clearTimer: this.clock.clear,
    });
    this.pager.setRelays(this.inbox);
    this.pager.subscribe(() => {
      this.device.scheduleState();
      this.changed();
    });
  }

  private startLive() {
    const since = this.floor - WRAP_JITTER_SECONDS;
    this.liveSince = since;
    this.liveWaitOver = false;
    const generation = ++this.liveGeneration;
    // History waits for each relay's live answer (canPage); after a while, not any more.
    this.clock.set(() => {
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
            this.ingest(event, relay);
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
  private markSeenIfSynced(throttle = false) {
    if (!this.liveSynced) return;
    const at = this.opener.oldestWaiting(this.now());
    // Saved every few minutes, not on every tick: a minute here is lost to the 2-day overlap anyway.
    if (throttle && this.lastSeen !== undefined && at >= this.lastSeen && at - this.lastSeen < 300) return;
    this.lastSeen = at;
    this.device.scheduleState();
  }

  private tick() {
    this.markSeenIfSynced(true);
    this.flushOutbox();
    const gone = this.store.sweepExpired(this.now());
    if (gone.length) this.device.forget(gone);
  }

  private savedCursors?: import("@/lib/dm/cursors").CursorSnapshot;

  // ─── the outbox ─────────────────────────────────────────────────────────

  /** Send again whatever the outbox holds — on start, every minute, and when the connection returns. */
  flushOutbox(): void {
    this.outbox.flushOutbox();
  }

  /** Give up on an undelivered message: gone from here, and from the outbox. */
  discard(messageId: string): void {
    this.outbox.discard(messageId);
  }

  // ─── opening wraps ──────────────────────────────────────────────────────

  private ingest(wrap: NostrEvent, relay: string) {
    if (this.stopped || wrap.kind !== GIFT_WRAP_KIND) return;
    let got = this.receivedBy.get(relay);
    if (!got) this.receivedBy.set(relay, (got = new Set()));
    got.add(wrap.id);
    if (this.seen.has(wrap.id)) {
      // Held on the device, its row not read back yet: kept until it is (`settleRow`).
      if (this.device.holdEarly(wrap, relay)) return;
      const id = this.wrapToMessage.get(wrap.id);
      const held = id ? this.store.message(id) : undefined;
      if (held && !held.relays.includes(relay)) this.store.add({ ...held, relays: [relay] });
      return;
    }
    this.opener.enqueue(wrap, relay);
  }

  /** The reader opened Messages: open everything waiting, prompting the signer if it must. */
  allowDecrypt(): void {
    // …and everything this device kept, read and opened now.
    this.device.hydrateRest();
    this.opener.permit();
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
  private keepDownloading(): void {
    if (!this.downloading || this.stopped || !this.pager) return;
    const relays = this.pager.snapshot().relays;
    if (!relays.some((r) => r.state === "idle" || r.state === "loading" || r.retrying)) {
      this.downloading = false;
      this.changed();
      return;
    }
    this.advanceAll();
  }

  /** Try the wraps set aside this visit again — the sync view's button. */
  retrySetAside(): void {
    this.opener.retrySetAside();
  }

  // ─── history ────────────────────────────────────────────────────────────

  /**
   * Fetching runs ahead of opening otherwise: a marker on screen asks for page
   * after page while the wraps of the last one are still sealed — no rows
   * arrive to push it off screen — and the relay reaches "all history loaded"
   * with thousands unread. A relay waits until its last page is nearly open.
   */
  private canPage(relay: string, unopened = this.opener.unopenedByRelay()): boolean {
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
    const unopened = this.opener.unopenedByRelay();
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
    const unopened = this.opener.unopenedByRelay();
    return {
      ...snap,
      relays: snap.relays.map((r) => ({
        ...r,
        opening: unopened.get(r.url) ?? 0,
        ...(this.waitingForLive(r.url) ? { waiting: true } : {}),
      })),
    };
  }

  // ─── sending ────────────────────────────────────────────────────────────

  /**
   * Send a chat message to everyone in `room` (a room key: sorted participants,
   * the sender among them). One wrap per recipient, to their own inbox relays,
   * plus one to the sender's, so their other devices see it too.
   */
  send(
    room: string,
    content: string,
    opts: { replyTo?: string; subject?: string; timer?: number; kind?: number; tags?: string[][] } = {},
  ): Promise<SendResult> {
    return this.outbox.send(room, content, opts);
  }

  /** React to a message (NIP-25 inside a wrap). "+" is a like; a custom emoji carries its NIP-30 tag. */
  react(target: DmMessage, content: string, emoji?: CustomEmoji): Promise<SendResult> {
    return this.outbox.react(target, content, emoji);
  }

  /** Publish again to every relay that hasn't accepted yet. */
  resend(messageId: string): Promise<SendResult> {
    return this.outbox.resend(messageId);
  }

  // ─── state ──────────────────────────────────────────────────────────────

  state(): DmEngineState {
    if (this.snap) return this.snap;
    this.snap = {
      status: this.status,
      inboxRelays: this.inbox,
      live: Object.fromEntries(this.live),
      liveSynced: this.liveSynced,
      liveSettled: this.liveSettled,
      sendAuth: this.outbox.sendAuth(),
      floor: this.floor,
      // In flight too: a wrap being opened is still waiting, as far as the reader can tell.
      queued: this.opener.waiting,
      paused: this.opener.pause,
      pauseDetail: this.opener.detail,
      failed: this.opener.failedCount,
      setAside: this.opener.setAside,
      downloading: this.downloading,
      sync: {
        received: Object.fromEntries([...this.receivedBy].map(([url, ids]) => [url, ids.size])),
        opened: this.opener.opened,
      },
      history: this.historyWithBacklog(),
    };
    return this.snap;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyTimer: unknown = null;
  private lastNotify = 0;

  /** Same coalescing as the store: a burst of arrivals is one re-render, not hundreds. */
  private changed() {
    this.snap = null;
    if (this.notifyTimer !== null) return;
    const wait = this.lastNotify + 80 - Date.now();
    const flush = () => {
      this.notifyTimer = null;
      this.lastNotify = Date.now();
      for (const l of [...this.listeners]) l();
      this.keepDownloading();
    };
    if (wait <= 0) flush();
    else this.notifyTimer = setTimeout(flush, wait);
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

const onlineNow = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

function onWindowOnline(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  return () => window.removeEventListener("online", callback);
}

/** Back in front: an installed app's sends wait out a suspension too. */
function onComeBack(callback: () => void): () => void {
  return onAppResume(() => callback());
}
