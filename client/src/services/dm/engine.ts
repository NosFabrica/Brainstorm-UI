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
import { RelayCursors } from "@/lib/dm/cursors";
import { BackwardPager, type PageHandlers, type PagerSnapshot } from "@/lib/dm/pager";
import {
  CHAT_KIND,
  GIFT_WRAP_KIND,
  REACTION_KIND,
  UnwrapError,
  WRAP_JITTER_SECONDS,
  makeRumor,
  unwrapGiftWrap,
  wrapRumor,
  type Decrypt,
  type Rumor,
  type SealSigner,
} from "@/lib/dm/giftWrap";
import { Heap } from "@/lib/dm/heap";
import { DmStore, messageFromRumor, type Delivery, type DmMessage, type OutgoingStatus } from "@/lib/dm/store";
import { chatTags } from "@/lib/dm/rooms";
import { MAX_INBOX_RELAYS, type DmRelayLookup } from "@/lib/dm/inboxRelays";
import {
  FAILED_RULES,
  MAX_CACHED_WRAPS,
  wrapKey,
  type CachedOpen,
  type DmCacheBackend,
  type Sealer,
  type StoredWrap,
} from "@/lib/dm/cache";

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
 * `refused`: the signer said no. `failed`: it threw something that isn't a no,
 * a timeout or a broken payload — Alby locked since this page enabled it
 * ("Password is not set") — so it may never have asked the reader at all.
 */
export type SignerFailure =
  | "cancelled"
  | "unreachable"
  | "refused"
  | "failed"
  | "wrong-account"
  | "broken"
  /** The signer asked us to slow down: not a failure, a pace. */
  | "rate-limited";

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
  /** How long one wrap may take to open before its slot is taken back (default 45s). */
  decryptTimeoutMs?: number;
  /** Milliseconds, for timing how fast the signer answers (default Date.now). */
  clockMs?: () => number;
}

/** A message waiting in the outbox: its signed wraps, so a retry needs no signer. */
interface OutboxEntry {
  rumor: Rumor;
  wrapId: string;
  wrapAt: number;
  wraps: OutgoingWrap[];
  deliveries: Delivery[];
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

interface Queued {
  wrap: NostrEvent;
  relays: Set<string>;
  /** Times the signer turned this one down. */
  refusals: number;
  /** How many wraps had opened when it was last turned down. */
  openedAtRefusal: number;
}

/** Newest first; a wrap the signer has turned down goes behind the rest. */
const openFirst = (a: Queued, b: Queued) =>
  a.refusals !== b.refusals ? a.refusals < b.refusals : a.wrap.created_at > b.wrap.created_at;

interface OutgoingWrap {
  recipient: string;
  wrap: NostrEvent;
  relays: string[];
}

const EMPTY_HISTORY: PagerSnapshot = { floor: 0, relays: [], loading: false, exhausted: true, complete: false };

export class DmEngine {
  readonly store: DmStore;
  private readonly me: string;
  private readonly now: () => number;
  private readonly cache: DmCacheBackend | null;
  /**
   * The ceiling, and how many may be open right now: one until the first opens (a
   * signer that prompts, or wants a permission granted, is asked once), then the
   * ceiling, halved when the signer pushes back.
   */
  private readonly maxConcurrency: number;
  private concurrency = 1;
  private warm = false;
  /** Bumped by each pushback's first word: the rest of that burst's answers echo it. */
  private paceEpoch = 0;
  /** Decrypts asked, in order, and the latest of them the signer has answered. */
  private asked = 0;
  private answeredUpTo = 0;
  /** How long the last wrap took to open (ms): fast means no person is approving each one. */
  private lastOpenMs = Infinity;
  /** A wrap's seal, once open: a retry after a pushback asks only for the rest. */
  private readonly sealOf = new Map<string, NostrEvent>();
  /** Messages being sealed to send: opening waits, so a send isn't the one refused for pace. */
  private sealing = 0;
  /** Opened since the last step up or down: a full round of them earns one more slot. */
  private paceOk = 0;
  /** Set while backing off after "rate limited": nothing new is asked until it fires. */
  private paceTimer: unknown;
  private paceTries = 0;

  private inbox: string[] = [];
  private status: DmEngineState["status"] = "starting";
  private live = new Map<string, LiveRelayState>();
  private liveStops: (() => void)[] = [];
  private pager: BackwardPager | null = null;
  private floor = 0;
  private lastSeen?: number;

  /** Wrap ids already opened (or given up on). */
  private readonly seen = new Set<string>();
  /** wrap id → message id, to merge relays when the same wrap arrives again. */
  private readonly wrapToMessage = new Map<string, string>();
  private readonly queue = new Map<string, Queued>();
  /** The queue in opening order; entries no longer in `queue` are skipped. */
  private readonly order = new Heap<Queued>(openFirst);
  /** Wraps being opened right now — a copy arriving meanwhile isn't opened twice. */
  private readonly opening = new Map<string, Queued>();
  private openedCount = 0;
  private downloading = false;
  private running = 0;
  private allowed = false;
  private paused?: DmPause;
  private pauseDetail?: string;
  private failed = 0;
  private readonly setAsideItems = new Map<string, Queued>();
  private readonly receivedBy = new Map<string, Set<string>>();
  /** Relays whose live subscription has answered (EOSE) since connecting; history waits on it. */
  private readonly liveAnswered = new Set<string>();
  private readonly liveCount = new Map<string, number>();
  private liveSince = 0;
  /** Past this, history stops waiting for slow live answers (see waitingForLive). */
  private liveWaitOver = false;
  /** Bumped by each live connection, so an earlier one's wait timer can't end this one's. */
  private liveGeneration = 0;
  private resumeTries = 0;
  private resumeTimer: unknown;

  private readonly outgoing = new Map<string, OutgoingWrap[]>();
  /** Relay → stop watching for its login; sends refused there resend on login. */
  private readonly sendAuthWaits = new Map<string, () => void>();
  /** Messages not yet delivered to everyone; kept across reloads and retried. */
  private readonly outbox = new Set<string>();
  /**
   * Message → its publish, until every relay has answered. Only one at a time per
   * message: two would publish the same wraps and overwrite each other's results.
   */
  private readonly publishing = new Map<string, Promise<void>>();
  /** The newest `created_at` this engine gave a rumor (see `stamp`). */
  private lastStamp = 0;
  /** Automatic tries per message since the connection last came back. */
  private readonly attempts = new Map<string, number>();
  private stopOnline?: () => void;
  private starting?: Promise<void>;
  private hydrating?: Promise<void>;
  private connecting?: Promise<void>;
  private connectGen = 0;
  private noInboxRetries = 0;
  /** Live relays' oldest wrap before their first EOSE: a capped REQ leaves a band to page. */
  private readonly liveOldest = new Map<string, number>();
  private persistChain: Promise<void> = Promise.resolve();
  private writes: StoredWrap[] = [];
  private writeTimer: unknown;
  private stateTimer: unknown;
  private ticker: unknown;
  private readonly listeners = new Set<() => void>();
  private snap: DmEngineState | null = null;
  private stopped = false;

  constructor(
    private readonly account: DmAccount,
    private readonly deps: DmEngineDeps,
  ) {
    this.me = account.pubkey;
    this.store = new DmStore(this.me);
    this.now = deps.now ?? (() => Math.floor(Date.now() / 1000));
    this.cache = deps.cache ?? null;
    this.maxConcurrency = deps.concurrency ?? 2;
  }

  get pubkey(): string {
    return this.me;
  }

  // ─── lifecycle ──────────────────────────────────────────────────────────

  start(): Promise<void> {
    this.starting ??= this.run();
    return this.starting;
  }

  /** Resolves once messages kept on this device are back in the store. */
  hydrated(): Promise<void> {
    return this.hydrating ?? Promise.resolve();
  }

  private async run(): Promise<void> {
    this.hydrating = this.hydrate();
    await this.hydrating;
    if (this.stopped) return;
    if (!this.account.decrypt) this.paused = "no-nip44";
    else void this.account.canOpenInBackground().then((yes) => yes && this.allowDecrypt());
    this.connecting = this.connect();
    await this.connecting;
    // Stopped during the lookup (an account switch): register nothing that would outlive it.
    if (this.stopped) return;
    this.flushOutbox();
    this.stopOnline = (this.deps.onOnline ?? onWindowOnline)(() => {
      this.attempts.clear();
      this.flushOutbox();
    });
    const repeat = this.deps.setRepeating ?? ((fn, ms) => setInterval(fn, ms));
    this.ticker = repeat(() => this.tick(), 60_000);
  }

  stop(): void {
    this.stopped = true;
    this.status = "stopped";
    this.disconnect();
    for (const stop of this.sendAuthWaits.values()) stop();
    this.sendAuthWaits.clear();
    this.stopOnline?.();
    if (this.resumeTimer !== undefined)
      (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.resumeTimer);
    this.clearPace();
    this.sealOf.clear();
    const clearTimer = this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    if (this.stateTimer !== undefined) clearTimer(this.stateTimer);
    this.stateTimer = undefined;
    this.queue.clear();
    this.order.clear();
    const clearRepeat = this.deps.clearRepeating ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    if (this.ticker !== undefined) clearRepeat(this.ticker);
    this.flushWrites();
    this.persistState();
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
        (this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => {
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
      setTimer: this.deps.setTimer,
      clearTimer: this.deps.clearTimer,
    });
    this.pager.setRelays(this.inbox);
    this.pager.subscribe(() => {
      this.scheduleState();
      this.changed();
    });
  }

  private startLive() {
    const since = this.floor - WRAP_JITTER_SECONDS;
    this.liveSince = since;
    this.liveWaitOver = false;
    const generation = ++this.liveGeneration;
    // History waits for each relay's live answer (canPage); after a while, not any more.
    (this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => {
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
    let at = this.now();
    for (const q of this.queue.values()) if (q.wrap.created_at < at) at = q.wrap.created_at;
    for (const q of this.opening.values()) if (q.wrap.created_at < at) at = q.wrap.created_at;
    // Set aside isn't cached either: the next visit must ask for those again too.
    for (const q of this.setAsideItems.values()) if (q.wrap.created_at < at) at = q.wrap.created_at;
    // Saved every few minutes, not on every tick: a minute here is lost to the 2-day overlap anyway.
    if (throttle && this.lastSeen !== undefined && at >= this.lastSeen && at - this.lastSeen < 300) return;
    this.lastSeen = at;
    this.scheduleState();
  }

  private tick() {
    this.markSeenIfSynced(true);
    this.flushOutbox();
    const gone = this.store.sweepExpired(this.now());
    if (gone.length && this.cache)
      void this.cache.deleteWraps(gone.map((m) => wrapKey(this.me, m.wrapId))).catch(() => {});
  }

  // ─── the cache ──────────────────────────────────────────────────────────

  private savedCursors?: import("@/lib/dm/cursors").CursorSnapshot;

  private async hydrate() {
    if (!this.cache) return;
    let rows: StoredWrap[] = [];
    try {
      const [state, stored] = await Promise.all([this.cache.state(this.me), this.cache.wraps(this.me)]);
      // Made by an older version: its cursors may sit past a band it skipped,
      // so history is fetched again from the top (opened wraps are skipped).
      const current = state?.syncVersion === SYNC_VERSION;
      this.lastSeen = current ? state?.lastSeen : undefined;
      this.savedCursors = current ? state?.cursors : undefined;
      rows = stored;
      if (state?.outbox) await this.restoreOutbox(state.outbox);
    } catch {
      return;
    }
    // Newest first, so the inbox fills from the top.
    rows.sort((a, b) => b.at - a.at);
    if (rows.length > MAX_CACHED_WRAPS) {
      const evicted = rows.splice(MAX_CACHED_WRAPS);
      void this.cache.deleteWraps(evicted.map((r) => r.key)).catch(() => {});
    }
    // Open once more: "failed" rows from before failures carried a reason (maybe a
    // signer's hiccup, not a broken message), and failures judged by older, stricter
    // unwrap rules (FAILED_RULES) — a seal with tags used to count as broken.
    const retry = (r: StoredWrap) => !!r.failed && (!r.reason || r.rules !== FAILED_RULES);
    const legacy = rows.filter(retry);
    if (legacy.length) {
      rows = rows.filter((r) => !retry(r));
      void this.cache.deleteWraps(legacy.map((r) => r.key)).catch(() => {});
    }
    const sealer = this.deps.sealer;
    const expired: string[] = [];
    // In slices, yielding between them: thousands of AES-GCM opens and JSON
    // parses at once would hold the main thread on every page load.
    for (let i = 0; i < rows.length; i += HYDRATE_SLICE) {
      const slice = rows.slice(i, i + HYDRATE_SLICE);
      const opened = await Promise.all(
        slice.map(async (row) => {
          this.seen.add(row.wrapId);
          if (!row.envelope || !sealer?.supported()) return null;
          try {
            return { row, open: JSON.parse(await sealer.open(row.envelope, this.me)) as CachedOpen };
          } catch {
            // A sealed copy this device can no longer open: forget it, and the wrap is opened again if met.
            this.seen.delete(row.wrapId);
            return null;
          }
        }),
      );
      if (this.stopped) return;
      const now = this.now();
      this.store.batch(() => {
        for (const o of opened) {
          if (!o) continue;
          const { open } = o;
          const tags = open.expiresAt ? [["expiration", String(open.expiresAt)]] : undefined;
          const message = messageFromRumor(open.rumor, { id: open.wrapId, created_at: open.wrapAt, tags }, open.relays);
          if (!message) continue;
          // Expired while the app was closed: gone from disk too.
          if (message.expiresAt && message.expiresAt <= now) {
            expired.push(o.row.key);
            continue;
          }
          this.wrapToMessage.set(open.wrapId, message.id);
          this.store.add(message, now);
        }
      });
      if (i + HYDRATE_SLICE < rows.length) await yieldToMain();
    }
    if (expired.length) void this.cache.deleteWraps(expired).catch(() => {});
  }

  private keep(row: StoredWrap) {
    if (!this.cache || this.stopped) return;
    this.writes.push(row);
    if (this.writeTimer !== undefined) return;
    const set = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.writeTimer = set(() => this.flushWrites(), 1000);
  }

  private flushWrites() {
    if (this.writeTimer !== undefined) {
      (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.writeTimer);
      this.writeTimer = undefined;
    }
    const rows = this.writes;
    this.writes = [];
    if (rows.length && this.cache) void this.cache.putWraps(rows).catch(() => {});
  }

  private async keepOpened(message: DmMessage) {
    if (!this.cache) return;
    const sealer = this.deps.sealer;
    const base = { key: wrapKey(this.me, message.wrapId), owner: this.me, wrapId: message.wrapId, at: message.wrapAt };
    if (!sealer?.supported()) {
      // No way to keep it sealed: remember only that the wrap was seen.
      return;
    }
    try {
      const payload: CachedOpen = {
        rumor: message.rumor,
        wrapId: message.wrapId,
        wrapAt: message.wrapAt,
        relays: message.relays,
        expiresAt: message.expiresAt,
      };
      this.keep({ ...base, envelope: await sealer.seal(JSON.stringify(payload), this.me) });
    } catch {
      /* not kept; opened again next visit */
    }
  }

  private scheduleState() {
    if (!this.cache || this.stateTimer !== undefined) return;
    const set = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.stateTimer = set(() => {
      this.stateTimer = undefined;
      this.persistState();
    }, 1500);
  }

  /**
   * Writes go one after another, so a slow seal can't land an older state over
   * a newer one; and a write asked for before sign-out cleared the cache is
   * dropped, not replayed into the next account's session.
   */
  private persistState() {
    if (!this.cache) return;
    const cache = this.cache;
    const stillValid = cache.guard?.();
    const base = {
      owner: this.me,
      lastSeen: this.lastSeen,
      cursors: this.pager?.cursors.snapshot() ?? this.savedCursors,
      syncVersion: SYNC_VERSION,
    };
    this.persistChain = this.persistChain
      .then(async () => {
        const outbox = await this.sealOutbox().catch(() => undefined);
        if (stillValid && !stillValid()) return;
        await cache.putState({ ...base, ...(outbox ? { outbox } : {}) });
      })
      .catch(() => {});
  }

  // ─── the outbox ─────────────────────────────────────────────────────────

  private get online(): boolean {
    return (this.deps.online ?? onlineNow)();
  }

  /** The outbox, sealed like opened messages. Nothing kept where the device can't seal. */
  private async sealOutbox(): Promise<string | undefined> {
    const sealer = this.deps.sealer;
    if (!this.outbox.size || !sealer?.supported()) return undefined;
    const entries: OutboxEntry[] = [];
    for (const id of this.outbox) {
      const message = this.store.message(id);
      const wraps = this.outgoing.get(id);
      if (!message || !wraps) continue;
      entries.push({
        rumor: message.rumor,
        wrapId: message.wrapId,
        wrapAt: message.wrapAt,
        wraps,
        deliveries: message.outgoing?.deliveries ?? [],
      });
    }
    return entries.length ? sealer.seal(JSON.stringify(entries), this.me) : undefined;
  }

  private async restoreOutbox(sealed: string) {
    const sealer = this.deps.sealer;
    if (!sealer?.supported()) return;
    let entries: OutboxEntry[];
    try {
      entries = JSON.parse(await sealer.open(sealed, this.me)) as OutboxEntry[];
    } catch {
      return;
    }
    const now = this.now();
    this.store.batch(() => {
      for (const e of entries) {
        const message = messageFromRumor(e.rumor, { id: e.wrapId, created_at: e.wrapAt }, []);
        if (!message) continue;
        message.outgoing = { status: this.online ? "failed" : "queued", deliveries: e.deliveries };
        this.store.add(message, now);
        this.seen.add(e.wrapId);
        this.wrapToMessage.set(e.wrapId, message.id);
        this.outgoing.set(message.id, e.wraps);
        this.outbox.add(message.id);
      }
    });
  }

  /** After a send settles: in the outbox until everyone has it. */
  private settleOutbox(messageId: string) {
    const out = this.store.message(messageId)?.outgoing;
    const before = this.outbox.has(messageId);
    // "Sent" is about the recipients; the copy for the reader's other devices is retried too.
    const mineMissing =
      !!out?.deliveries.some((d) => d.recipient === this.me) &&
      !out.deliveries.some((d) => d.recipient === this.me && d.ok);
    if (!out || (out.status === "sent" && !mineMissing)) {
      this.outbox.delete(messageId);
      this.attempts.delete(messageId);
      // Every relay took it: nothing will ever be resent.
      if (out?.deliveries.every((d) => d.ok)) this.outgoing.delete(messageId);
    } else this.outbox.add(messageId);
    if (before || this.outbox.has(messageId)) this.scheduleState();
  }

  /** Send again whatever the outbox holds — on start, every minute, and when the connection returns. */
  flushOutbox(): void {
    if (this.stopped || this.status !== "ready" || !this.online) return;
    for (const id of this.outbox) {
      if (this.publishing.has(id) || this.store.message(id)?.outgoing?.status === "sending") continue;
      // A relay that keeps refusing isn't asked forever; Retry, or the connection coming back, starts over.
      const tries = this.attempts.get(id) ?? 0;
      if (tries >= MAX_AUTO_RETRIES) continue;
      this.attempts.set(id, tries + 1);
      void this.resend(id);
    }
  }

  /** Give up on an undelivered message: gone from here, and from the outbox. */
  discard(messageId: string): void {
    const message = this.store.message(messageId);
    const status = message?.outgoing?.status;
    if (!message || (status !== "failed" && status !== "queued")) return;
    // A retry is on its way out: it can't be called back now.
    if (this.publishing.has(messageId)) return;
    this.outbox.delete(messageId);
    this.attempts.delete(messageId);
    this.outgoing.delete(messageId);
    this.store.remove([messageId]);
    // The reader's own copy may already sit on their relays, and would come back
    // on the next load looking sent. A wrap can't be deleted (a throwaway key
    // signed it), so it is remembered as skipped, like a wrap that isn't a message.
    if (message.wrapId)
      this.keep({
        key: wrapKey(this.me, message.wrapId),
        owner: this.me,
        wrapId: message.wrapId,
        at: message.wrapAt,
        failed: true,
        reason: "skipped",
        rules: FAILED_RULES,
      });
    this.scheduleState();
  }

  // ─── opening wraps ──────────────────────────────────────────────────────

  private ingest(wrap: NostrEvent, relay: string) {
    if (this.stopped || wrap.kind !== GIFT_WRAP_KIND) return;
    let got = this.receivedBy.get(relay);
    if (!got) this.receivedBy.set(relay, (got = new Set()));
    got.add(wrap.id);
    if (this.seen.has(wrap.id)) {
      const id = this.wrapToMessage.get(wrap.id);
      const held = id ? this.store.message(id) : undefined;
      if (held && !held.relays.includes(relay)) this.store.add({ ...held, relays: [relay] });
      return;
    }
    const queued = this.queue.get(wrap.id) ?? this.opening.get(wrap.id);
    if (queued) {
      queued.relays.add(relay);
      return;
    }
    const item: Queued = { wrap, relays: new Set([relay]), refusals: 0, openedAtRefusal: 0 };
    this.queue.set(wrap.id, item);
    this.order.push(item);
    this.changed();
    this.pump();
  }

  /** The reader opened Messages: open everything waiting, prompting the signer if it must. */
  allowDecrypt(): void {
    if (!this.account.decrypt) {
      this.paused = "no-nip44";
      this.changed();
      return;
    }
    this.allowed = true;
    if (this.paused !== "no-nip44") this.paused = undefined;
    this.pauseDetail = undefined;
    // The reader asked: now, not after whatever back-off was running.
    this.clearPace();
    this.paceTries = 0;
    this.changed();
    this.pump();
  }

  private pump() {
    if (this.stopped || !this.allowed || this.paused || !this.account.decrypt) return;
    if (this.paceTimer !== undefined || this.sealing) return;
    while (this.running < this.concurrency) {
      // Newest first, so the latest messages appear before the backlog.
      const next = this.takeNext();
      if (!next) break;
      this.opening.set(next.wrap.id, next);
      this.running++;
      void this.open(next).finally(() => {
        this.opening.delete(next.wrap.id);
        this.running--;
        if (this.stopped) return;
        this.changed();
        this.pump();
        // The backlog is open: caught up to now, not to the oldest wrap that waited.
        if (!this.running && !this.queue.size) this.markSeenIfSynced();
      });
    }
  }

  private takeNext(): Queued | undefined {
    for (;;) {
      const top = this.order.pop();
      if (!top) return undefined;
      if (this.queue.get(top.wrap.id) !== top) continue; // superseded or gone
      this.queue.delete(top.wrap.id);
      return top;
    }
  }

  private requeue(item: Queued) {
    this.queue.set(item.wrap.id, item);
    this.order.push(item);
  }

  private async open(item: Queued) {
    const { wrap } = item;
    const seq = ++this.asked;
    const epoch = this.paceEpoch;
    const askedAt = this.clockMs();
    let over = false;
    // Past its deadline a wrap asks nothing more: a late "yes" to its first step must
    // not bring a second prompt (Amber, one approval per request) or spend the budget.
    const decrypt: Decrypt = (from, text) =>
      over ? Promise.reject(new DecryptTimeout()) : this.account.decrypt!(from, text);
    try {
      const { rumor } = await this.withDeadline(
        unwrapGiftWrap(wrap, decrypt, {
          seal: this.sealOf.get(wrap.id),
          onSeal: (seal) => this.sealOf.set(wrap.id, seal),
        }),
        seq,
        () => (over = true),
      );
      if (this.stopped) return;
      this.sealOf.delete(wrap.id);
      this.seen.add(wrap.id);
      this.openedCount++;
      this.answeredUpTo = Math.max(this.answeredUpTo, seq);
      this.lastOpenMs = this.clockMs() - askedAt;
      this.paceUp();
      const now = this.now();
      // NIP-17: a message to the reader names them. One that doesn't would make
      // a room without them in it — it can't be opened or answered.
      const addressed = rumor.pubkey === this.me || rumor.tags.some((t) => t[0] === "p" && t[1] === this.me);
      const message = addressed ? messageFromRumor(rumor, wrap, [...item.relays]) : null;
      // A sender's clock in the future would pin their message to the top.
      if (message && message.createdAt > now + FUTURE_SLACK_SECONDS) message.createdAt = now;
      this.resumeTries = 0;
      if (!message || (!this.store.add(message, now) && !this.store.message(message.id))) {
        // Not a message, or already expired: remember the wrap, keep nothing of it.
        this.keep({
          key: wrapKey(this.me, wrap.id),
          owner: this.me,
          wrapId: wrap.id,
          at: wrap.created_at,
          failed: true,
          reason: "skipped",
          rules: FAILED_RULES,
        });
        return;
      }
      this.wrapToMessage.set(wrap.id, message.id);
      void this.keepOpened(this.store.message(message.id) ?? message);
    } catch (error) {
      if (this.stopped) return;
      const kind =
        error instanceof UnwrapError
          ? "broken"
          : error instanceof DecryptTimeout
            ? "unreachable"
            : this.account.classify(error);
      const dropped = error instanceof DecryptTimeout && error.dropped;
      if (kind === "rate-limited" || dropped) {
        // Asked too fast — said so, or dropped while the signer answered later ones:
        // this wrap goes back as it was, no refusal counted and the reader never
        // bothered, and opening slows down and carries on by itself.
        this.requeue(item);
        if (this.paceDown(epoch, true)) return;
        // Every wait run through and still nothing opens: the reader should know.
        this.paused = "unreachable";
        this.pauseDetail = dropped ? undefined : this.account.explain?.(error);
        this.scheduleResume();
        return;
      }
      // A request the signer never answered, with others in flight: likely the same
      // pushback, without the words. Fewer at once when opening resumes.
      if (kind === "unreachable") this.paceDown(epoch, false);
      if (kind === "broken") {
        this.sealOf.delete(wrap.id);
        // The payload itself can't open, ever: remembered, so it isn't asked again.
        this.seen.add(wrap.id);
        this.failed++;
        this.keep({
          key: wrapKey(this.me, wrap.id),
          owner: this.me,
          wrapId: wrap.id,
          at: wrap.created_at,
          failed: true,
          reason: "broken",
          rules: FAILED_RULES,
        });
        return;
      }
      // Turned down again after the signer opened others in between: it's this
      // wrap, not the signer — a stranger can't hold the whole inbox shut. Set
      // aside for this visit only: a signer's error is not proof the message is
      // unreadable, and remembering it as such would lose it for good.
      const turnedDown = kind === "refused" || kind === "failed";
      if (turnedDown && item.refusals > 0 && this.openedCount > item.openedAtRefusal) {
        this.seen.add(wrap.id);
        this.setAsideItems.set(wrap.id, item);
        return;
      }
      // The signer said no, or went quiet: hold everything until the reader acts,
      // and try this one after the rest next time.
      this.requeue({
        ...item,
        refusals: item.refusals + (turnedDown ? 1 : 0),
        openedAtRefusal: this.openedCount,
      });
      this.paused = kind;
      this.pauseDetail = turnedDown ? this.account.explain?.(error) : undefined;
      // Didn't answer in time (a busy bunker, an extension's own timeout): try
      // again by itself, waiting longer each time, before asking the reader.
      if (kind === "unreachable") this.scheduleResume();
    }
  }

  /**
   * An extension can drop a request and never answer it. Opening runs a few at
   * a time, so two such calls would hold every slot for good — wraps keep
   * arriving and nothing opens. Past the deadline the slot is taken back, the
   * wrap goes back in the queue, and opening resumes after a pause.
   *
   * Sooner for a request the signer dropped, as Amethyst does past its rate limit
   * (it answers a burst, then nothing). Checked every ANSWERING_TIMEOUT_MS, a
   * request is dropped once the signer has answered one asked *after* it, or when
   * it has been answering in seconds (no person approving each one) and this one
   * has sat a whole check. A person tapping "allow" in order is slower than that,
   * and keeps the full deadline — asked twice, they'd see two prompts. `onOver`
   * hears when the wrap is given up.
   */
  private withDeadline<T>(work: Promise<T>, seq: number, onOver: () => void): Promise<T> {
    const limit = this.deps.decryptTimeoutMs ?? DECRYPT_TIMEOUT_MS;
    const set = this.deps.setTimer ?? ((fn, wait) => setTimeout(fn, wait));
    const clear = this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    return new Promise<T>((resolve, reject) => {
      let waited = 0;
      let timer: unknown;
      const giveUp = (dropped: boolean) => {
        onOver();
        reject(new DecryptTimeout(dropped));
      };
      const arm = () => {
        const step = Math.min(ANSWERING_TIMEOUT_MS, limit - waited);
        timer = set(() => {
          waited += step;
          if (this.answeredUpTo > seq || this.lastOpenMs < FAST_OPEN_MS) giveUp(true);
          else if (waited >= limit) giveUp(false);
          else arm();
        }, step);
      };
      arm();
      work.then(
        (v) => {
          clear(timer);
          resolve(v);
        },
        (e) => {
          clear(timer);
          reject(e);
        },
      );
    });
  }

  /**
   * The signer pushed back. Its first word halves how many are asked at once; the
   * rest of that burst's answers echo it and change nothing. With `wait` (it said
   * "rate limited", or skipped a request), nothing is asked until a pause passes —
   * longer each time it repeats with nothing opening in between. False once every
   * pause has been tried: time to tell the reader.
   */
  private paceDown(epoch: number, wait: boolean): boolean {
    if (epoch === this.paceEpoch) {
      this.paceEpoch++;
      this.concurrency = Math.max(1, Math.floor(this.concurrency / 2));
      this.paceOk = 0;
    }
    if (!wait || this.paceTimer !== undefined) return true;
    if (this.paceTries >= RATE_LIMIT_WAIT_MS.length) return false;
    const ms = RATE_LIMIT_WAIT_MS[this.paceTries++];
    this.paceTimer = (this.deps.setTimer ?? ((fn, t) => setTimeout(fn, t)))(() => {
      this.paceTimer = undefined;
      if (this.stopped) return;
      this.changed();
      this.pump();
    }, ms);
    return true;
  }

  private clockMs(): number {
    return (this.deps.clockMs ?? Date.now)();
  }

  private clearPace() {
    if (this.paceTimer === undefined) return;
    (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.paceTimer);
    this.paceTimer = undefined;
  }

  /**
   * A message opened. The first proves the signer answers without a person in the
   * way: the ceiling at once. After that a full round at this pace earns one more.
   * Not while backing off — those were asked before the signer pushed back.
   */
  private paceUp() {
    if (this.paceTimer !== undefined) return;
    this.paceTries = 0;
    if (!this.warm) {
      this.warm = true;
      if (this.paceEpoch === 0) {
        this.concurrency = this.maxConcurrency;
        return;
      }
    }
    if (this.concurrency >= this.maxConcurrency) return;
    if (++this.paceOk < this.concurrency) return;
    this.concurrency++;
    this.paceOk = 0;
  }

  private scheduleResume() {
    if (this.resumeTimer !== undefined || this.resumeTries >= RESUME_AFTER_MS.length) return;
    const wait = RESUME_AFTER_MS[this.resumeTries++];
    this.resumeTimer = (this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => {
      this.resumeTimer = undefined;
      if (!this.stopped && this.paused === "unreachable") this.allowDecrypt();
    }, wait);
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
    if (!this.setAsideItems.size) return;
    for (const [id, item] of this.setAsideItems) {
      this.seen.delete(id);
      this.requeue({ ...item, refusals: 0 });
    }
    this.setAsideItems.clear();
    this.changed();
    this.pump();
  }

  // ─── history ────────────────────────────────────────────────────────────

  /** Wraps waiting to be opened (queued or opening now), by the relays that delivered them. */
  private unopenedByRelay(): Map<string, number> {
    const counts = new Map<string, number>();
    const count = (item: Queued) => {
      for (const relay of item.relays) counts.set(relay, (counts.get(relay) ?? 0) + 1);
    };
    for (const item of this.queue.values()) count(item);
    for (const item of this.opening.values()) count(item);
    return counts;
  }

  /**
   * Fetching runs ahead of opening otherwise: a marker on screen asks for page
   * after page while the wraps of the last one are still sealed — no rows
   * arrive to push it off screen — and the relay reaches "all history loaded"
   * with thousands unread. A relay waits until its last page is nearly open.
   */
  private canPage(relay: string, unopened = this.unopenedByRelay()): boolean {
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
    const unopened = this.unopenedByRelay();
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
    const unopened = this.unopenedByRelay();
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
  async send(
    room: string,
    content: string,
    opts: { replyTo?: string; subject?: string; timer?: number; kind?: number; tags?: string[][] } = {},
  ): Promise<SendResult> {
    const text = content.trim();
    if (!text) return { ok: false, error: "Nothing to send" };
    const others = room.split(",").filter((pk) => pk && pk !== this.me);
    const now = this.stamp();
    const expiration = opts.timer ? now + opts.timer : undefined;
    const rumor = makeRumor({
      pubkey: this.me,
      kind: opts.kind ?? CHAT_KIND,
      created_at: now,
      tags: [...chatTags(others, { replyTo: opts.replyTo, subject: opts.subject, expiration }), ...(opts.tags ?? [])],
      content: text,
    });
    return this.deliver(rumor, others, expiration);
  }

  /**
   * A `created_at` for a rumor of ours: now, but always past the last one. Seconds
   * are coarse: two sends in one would sort by hash, so out of order half the time
   * (here and for them), and the same text twice would be one rumor id — one bubble,
   * whose second signing, turned down, would take the first one away with it.
   */
  private stamp(): number {
    this.lastStamp = Math.max(this.now(), this.lastStamp + 1);
    return this.lastStamp;
  }

  /** React to a message (NIP-25 inside a wrap). "+" is a like. */
  async react(target: DmMessage, content: string): Promise<SendResult> {
    const others = target.room.split(",").filter((pk) => pk && pk !== this.me);
    // NIP-25 names the author; the other p tags keep the reaction in the same room.
    const named = [...new Set([target.author, ...others])].filter((pk) => pk !== this.me);
    const rumor = makeRumor({
      pubkey: this.me,
      kind: REACTION_KIND,
      created_at: this.stamp(),
      tags: [["e", target.id], ...named.map((pk) => ["p", pk]), ["k", String(target.kind)]],
      content: content || "+",
    });
    return this.deliver(rumor, others, undefined);
  }

  private async deliver(rumor: Rumor, others: string[], expiration: number | undefined): Promise<SendResult> {
    // Sent while the cache or the inbox list is still loading: wait for them.
    if (this.status === "starting") await this.starting?.catch(() => undefined);
    const signer = this.account.sealSigner;
    if (!signer) return { ok: false, error: "Your signer can't encrypt private messages (NIP-44)." };
    if (!this.inbox.length) return { ok: false, error: "Set up your inbox relays first." };

    const lookups = await Promise.all(
      others.map((pk) => this.deps.loadInbox(pk).catch(() => ({ relays: [], found: false }))),
    );
    const missing = others.filter((_, i) => !lookups[i].relays.length);
    if (missing.length && !this.online)
      return { ok: false, error: "You're offline, and this chat's inbox relays aren't known yet." };
    if (missing.length) return { ok: false, missing, error: "Some people have no inbox relays yet." };

    const placeholder = messageFromRumor(rumor, { id: "", created_at: this.now() }, [])!;
    placeholder.outgoing = { status: "sending", deliveries: [] };
    this.store.add(placeholder, this.now());

    const targets = [
      ...others.map((pk, i) => ({ pk, relays: lookups[i].relays })),
      { pk: this.me, relays: this.inbox },
    ];
    const wraps: OutgoingWrap[] = [];
    // Opening pauses while this is sealed: a signer that limits its rate spends its
    // budget on the message being sent, not on the backlog.
    this.sealing++;
    try {
      for (const target of targets) {
        const wrap = await wrapRumor(rumor, target.pk, signer, { expiration });
        wraps.push({ recipient: target.pk, wrap, relays: target.relays.slice(0, MAX_INBOX_RELAYS) });
      }
    } catch (error) {
      // Nothing was signed, so there is nothing to resend: a bubble kept here would
      // offer a Retry that can't do anything, beside the draft the composer keeps.
      // The draft is the retry — sent again, it asks the signer again.
      this.store.remove([rumor.id]);
      if (this.account.classify(error) === "cancelled") return { ok: false, error: "Cancelled" };
      return { ok: false, error: error instanceof Error ? error.message : "Signing failed" };
    } finally {
      this.sealing--;
      this.pump();
    }

    const mine = wraps[wraps.length - 1].wrap;
    this.seen.add(mine.id);
    this.wrapToMessage.set(mine.id, rumor.id);
    this.store.patch(rumor.id, { wrapId: mine.id, wrapAt: mine.created_at });
    this.outgoing.set(rumor.id, wraps);
    const message = await this.publishWraps(rumor.id, wraps);
    const held = this.store.message(rumor.id);
    if (held) void this.keepOpened(held);
    return { ok: message?.outgoing?.status !== "failed", message };
  }

  /** Publish again to every relay that hasn't accepted yet. */
  async resend(messageId: string): Promise<SendResult> {
    const wraps = this.outgoing.get(messageId);
    if (!wraps) return { ok: false, error: "Nothing to resend" };
    if (this.publishing.has(messageId)) return { ok: false, error: "Already sending" };
    const message = await this.publishWraps(messageId, wraps, true);
    return { ok: message?.outgoing?.status !== "failed", message };
  }

  /**
   * Publish every wrap to its relays. Answers as soon as each recipient has a
   * relay that took theirs (or every relay has answered): a dead relay's
   * timeout shouldn't hold the composer. The rest land in the store as they come.
   */
  private async publishWraps(messageId: string, wraps: OutgoingWrap[], onlyFailed = false) {
    const out = this.store.message(messageId)?.outgoing;
    const previous = out?.deliveries ?? [];
    // A retry shows as sending from the start, not once the first relay answers: until
    // then its bubble would still read failed, offering a Discard that can't call it back.
    if (out && out.status !== "sending") this.store.patch(messageId, { outgoing: { ...out, status: "sending" } });
    const accepted = (recipient: string, relay: string) =>
      previous.some((d) => d.recipient === recipient && d.relay === relay && d.ok);
    const deliveries: Delivery[] = [];
    const recipients = wraps.filter((w) => w.recipient !== this.me || wraps.length === 1).map((w) => w.recipient);
    const allReached = () => recipients.every((r) => deliveries.some((d) => d.recipient === r && d.ok));
    const update = (final: boolean) => {
      const reached = recipients.filter((r) => deliveries.some((d) => d.recipient === r && d.ok));
      const status: OutgoingStatus =
        reached.length === recipients.length
          ? "sent"
          : !final
            ? "sending"
            : reached.length
              ? "partial"
              : this.online
                ? "failed"
                : "queued";
      const relays = deliveries.filter((d) => d.ok && d.recipient === this.me).map((d) => d.relay);
      this.store.patch(messageId, { outgoing: { status, deliveries: [...deliveries] }, relays });
    };

    let reachedAll!: () => void;
    const early = new Promise<void>((resolve) => (reachedAll = resolve));
    const settled = Promise.all(
      wraps.flatMap((w) =>
        w.relays.map(async (relay) => {
          if (onlyFailed && accepted(w.recipient, relay)) {
            deliveries.push({ recipient: w.recipient, relay, ok: true });
            return;
          }
          const result: PublishResult = await this.deps.transport
            .publish(relay, w.wrap)
            .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
          // A failure keeps everything the transport learned about it.
          deliveries.push({
            recipient: w.recipient,
            relay,
            ...(result.ok ? { ok: true, message: result.message } : result),
          });
          if (!result.ok && result.auth) this.awaitSendAuth(relay);
          update(false);
          if (allReached()) reachedAll();
        }),
      ),
    ).then(() => {
      update(true);
      this.settleOutbox(messageId);
    });
    // Held until the last relay answers, not just until the early return below.
    this.publishing.set(messageId, settled);
    const done = () => {
      if (this.publishing.get(messageId) === settled) this.publishing.delete(messageId);
    };
    settled.then(done, done);
    await Promise.race([early, settled]);
    return this.store.message(messageId);
  }

  /** Once `relay` signs us in, send again whatever it refused for want of a login. */
  private awaitSendAuth(relay: string) {
    if (this.sendAuthWaits.has(relay) || this.stopped) return;
    let fired = false;
    const stop = this.deps.transport.onAuthenticated(relay, () => {
      if (fired) return;
      fired = true;
      queueMicrotask(() => {
        stop();
        this.sendAuthWaits.delete(relay);
        this.changed();
        for (const id of this.outgoing.keys()) {
          const refused = this.store
            .message(id)
            ?.outgoing?.deliveries.some((d) => d.relay === relay && !d.ok && d.auth);
          // Still out on its first try: resend once that has heard from every relay.
          if (refused) void (this.publishing.get(id) ?? Promise.resolve()).then(() => this.resend(id));
        }
      });
    });
    if (fired) return;
    this.sendAuthWaits.set(relay, stop);
    this.changed();
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
      sendAuth: [...this.sendAuthWaits.keys()],
      floor: this.floor,
      // In flight too: a wrap being opened is still waiting, as far as the reader can tell.
      queued: this.queue.size + this.opening.size,
      paused: this.paused ?? (!this.allowed && this.queue.size ? "waiting" : undefined),
      pauseDetail: this.pauseDetail,
      failed: this.failed,
      setAside: this.setAsideItems.size,
      downloading: this.downloading,
      sync: {
        received: Object.fromEntries([...this.receivedBy].map(([url, ids]) => [url, ids.size])),
        opened: this.openedCount,
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

/** One wrap's two decrypts may take this long; then the signer is taken to be stuck. */
const DECRYPT_TIMEOUT_MS = 45_000;

class DecryptTimeout extends Error {
  /** Skipped: the signer answered later requests, so it dropped this one rather than waiting on a person. */
  constructor(readonly dropped = false) {
    super("The signer didn't answer in time");
  }
}

/** Bumped when saved cursors can't be trusted (a paging fix): they're dropped once and history refetched. */
const SYNC_VERSION = 2;
/** A live window this full whose oldest wrap is well above where it asked from was probably capped. */
const CAPPED_LIVE_AT = 200;
/** How long history waits for a relay's live answer before going ahead without it. */
const LIVE_ANSWER_WAIT_MS = 20_000;
/** After a signer timeout, opening resumes by itself after these waits, then waits for the reader. */
const RESUME_AFTER_MS = [5_000, 15_000, 45_000];
/**
 * How often an unanswered wrap checks whether the signer has answered a later one
 * (and so dropped it). Well past a NIP-46 round trip (~0.7s) times the two a wrap
 * takes, far short of the 45s a person unlocking an extension gets.
 */
const ANSWERING_TIMEOUT_MS = 10_000;
/** A wrap that opened this fast had no person approving it: the signer answers by itself. */
const FAST_OPEN_MS = 3_000;
/** After a signer says "rate limited", asking again waits this long — the last one repeats. */
const RATE_LIMIT_WAIT_MS = [2_000, 5_000, 10_000, 30_000];

/** A relay's next history page waits until fewer than this many of its wraps are still unopened. */
const PAGE_BACKLOG = 50;

/** When to look for an inbox list again after finding none. */
const NO_INBOX_RETRY_MS = [20_000, 120_000];

/** Opened from the cache this many at a time, yielding between. */
const HYDRATE_SLICE = 250;
/** How far ahead of our clock a message may claim to be written. */
const FUTURE_SLACK_SECONDS = 600;

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** About ten minutes of once-a-minute retries. */
const MAX_AUTO_RETRIES = 10;

const onlineNow = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

function onWindowOnline(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  return () => window.removeEventListener("online", callback);
}
