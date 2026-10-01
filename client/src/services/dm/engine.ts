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
import { DmStore, messageFromRumor, type Delivery, type DmMessage, type OutgoingStatus } from "@/lib/dm/store";
import { chatTags } from "@/lib/dm/rooms";
import { MAX_INBOX_RELAYS, type DmRelayLookup } from "@/lib/dm/inboxRelays";
import {
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
}

export type WrapFilter = { kinds: number[]; "#p": string[]; since?: number; until?: number; limit?: number };

export interface DmTransport {
  live(relay: string, filter: WrapFilter, handlers: LiveHandlers): () => void;
  page(relay: string, filter: WrapFilter, handlers: PageHandlers): () => void;
  publish(relay: string, event: NostrEvent): Promise<{ ok: boolean; message?: string }>;
  /** Calls back each time the relay completes a NIP-42 login. */
  onAuthenticated(relay: string, callback: () => void): () => void;
}

export type SignerFailure = "cancelled" | "unreachable" | "refused" | "broken";

export interface DmAccount {
  pubkey: string;
  /** Undefined when the signer can't do NIP-44 at all. */
  decrypt?: Decrypt;
  sealSigner?: SealSigner;
  /** Whether opening messages can start without the reader asking. */
  canOpenInBackground(): Promise<boolean>;
  classify(error: unknown): SignerFailure;
}

export interface DmEngineDeps {
  transport: DmTransport;
  loadInbox(pubkey: string, opts?: { fresh?: boolean }): Promise<DmRelayLookup>;
  cache?: DmCacheBackend | null;
  sealer?: Sealer;
  now?: () => number;
  /** How many wraps open at once. A remote signer answers one at a time anyway. */
  concurrency?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  setRepeating?: (fn: () => void, ms: number) => unknown;
  clearRepeating?: (handle: unknown) => void;
}

export type DmPause = "waiting" | "cancelled" | "unreachable" | "refused" | "no-nip44";

export interface DmEngineState {
  status: "starting" | "no-inbox" | "ready" | "stopped";
  inboxRelays: string[];
  live: Record<string, LiveRelayState>;
  /** Every inbox relay has answered the live subscription at least once. */
  liveSynced: boolean;
  floor: number;
  /** Wraps waiting to be opened. */
  queued: number;
  /** Why opening is on hold, if it is. */
  paused?: DmPause;
  /** Wraps that could not be opened (not for us, or broken). */
  failed: number;
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
}

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
  private readonly concurrency: number;

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
  private running = 0;
  private allowed = false;
  private paused?: DmPause;
  private failed = 0;

  private readonly outgoing = new Map<string, OutgoingWrap[]>();
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
    this.concurrency = deps.concurrency ?? 2;
  }

  get pubkey(): string {
    return this.me;
  }

  // ─── lifecycle ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.hydrate();
    if (this.stopped) return;
    if (!this.account.decrypt) this.paused = "no-nip44";
    else void this.account.canOpenInBackground().then((yes) => yes && this.allowDecrypt());
    await this.connect();
    const repeat = this.deps.setRepeating ?? ((fn, ms) => setInterval(fn, ms));
    this.ticker = repeat(() => this.tick(), 60_000);
  }

  stop(): void {
    this.stopped = true;
    this.status = "stopped";
    this.disconnect();
    const clearRepeat = this.deps.clearRepeating ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    if (this.ticker !== undefined) clearRepeat(this.ticker);
    this.flushWrites();
    this.persistState();
    this.changed();
    this.listeners.clear();
  }

  /** Read the account's inbox list again — after setting it up, or changing it in Settings. */
  async refreshInbox(): Promise<void> {
    this.disconnect();
    await this.connect({ fresh: true });
  }

  private disconnect() {
    for (const stop of this.liveStops) stop();
    this.liveStops = [];
    this.live.clear();
    this.pager?.dispose();
    this.pager = null;
  }

  private async connect(opts: { fresh?: boolean } = {}) {
    const lookup = await this.deps.loadInbox(this.me, opts).catch((): DmRelayLookup => ({ relays: [], found: false }));
    if (this.stopped) return;
    this.inbox = lookup.relays;
    if (!this.inbox.length) {
      this.status = "no-inbox";
      this.changed();
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
    for (const relay of this.inbox) {
      this.live.set(relay, "connecting");
      const stop = this.deps.transport.live(
        relay,
        { kinds: [GIFT_WRAP_KIND], "#p": [this.me], since },
        {
          onEvent: (event) => this.ingest(event, relay),
          onEose: () => {
            this.live.set(relay, "synced");
            this.markSeenIfSynced();
            this.changed();
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

  private get liveSynced(): boolean {
    return this.inbox.length > 0 && this.inbox.every((r) => this.live.get(r) === "synced");
  }

  private markSeenIfSynced() {
    if (!this.liveSynced) return;
    this.lastSeen = this.now();
    this.scheduleState();
  }

  private tick() {
    this.markSeenIfSynced();
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
      this.lastSeen = state?.lastSeen;
      this.savedCursors = state?.cursors;
      rows = stored;
    } catch {
      return;
    }
    if (rows.length > MAX_CACHED_WRAPS) {
      rows.sort((a, b) => b.at - a.at);
      const evicted = rows.splice(MAX_CACHED_WRAPS);
      void this.cache.deleteWraps(evicted.map((r) => r.key)).catch(() => {});
    }
    const sealer = this.deps.sealer;
    const opened = await Promise.all(
      rows.map(async (row) => {
        this.seen.add(row.wrapId);
        if (!row.envelope || !sealer?.supported()) return null;
        try {
          return JSON.parse(await sealer.open(row.envelope, this.me)) as CachedOpen;
        } catch {
          // A sealed copy this device can no longer open: forget it, and the wrap is opened again if met.
          this.seen.delete(row.wrapId);
          return null;
        }
      }),
    );
    const now = this.now();
    this.store.batch(() => {
      for (const o of opened) {
        if (!o) continue;
        const message = messageFromRumor(o.rumor, { id: o.wrapId, created_at: o.wrapAt }, o.relays);
        if (!message) continue;
        this.wrapToMessage.set(o.wrapId, message.id);
        this.store.add(message, now);
      }
    });
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

  private persistState() {
    if (!this.cache) return;
    void this.cache
      .putState({
        owner: this.me,
        lastSeen: this.lastSeen,
        cursors: this.pager?.cursors.snapshot() ?? this.savedCursors,
      })
      .catch(() => {});
  }

  // ─── opening wraps ──────────────────────────────────────────────────────

  private ingest(wrap: NostrEvent, relay: string) {
    if (this.stopped || wrap.kind !== GIFT_WRAP_KIND) return;
    if (this.seen.has(wrap.id)) {
      const id = this.wrapToMessage.get(wrap.id);
      const held = id ? this.store.message(id) : undefined;
      if (held && !held.relays.includes(relay)) this.store.add({ ...held, relays: [relay] });
      return;
    }
    const queued = this.queue.get(wrap.id);
    if (queued) {
      queued.relays.add(relay);
      return;
    }
    this.queue.set(wrap.id, { wrap, relays: new Set([relay]) });
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
    this.changed();
    this.pump();
  }

  private pump() {
    if (!this.allowed || this.paused || !this.account.decrypt) return;
    while (this.running < this.concurrency && this.queue.size) {
      // Newest first, so the latest messages appear before the backlog.
      let next: Queued | undefined;
      for (const q of this.queue.values()) if (!next || q.wrap.created_at > next.wrap.created_at) next = q;
      if (!next) break;
      this.queue.delete(next.wrap.id);
      this.running++;
      void this.open(next).finally(() => {
        this.running--;
        this.changed();
        this.pump();
      });
    }
  }

  private async open(item: Queued) {
    const { wrap } = item;
    try {
      const { rumor } = await unwrapGiftWrap(wrap, this.account.decrypt!);
      if (this.stopped) return;
      this.seen.add(wrap.id);
      const message = messageFromRumor(rumor, wrap, [...item.relays]);
      if (!message) {
        this.keep({
          key: wrapKey(this.me, wrap.id),
          owner: this.me,
          wrapId: wrap.id,
          at: wrap.created_at,
          failed: true,
        });
        return;
      }
      this.wrapToMessage.set(wrap.id, message.id);
      this.store.add(message, this.now());
      void this.keepOpened(message);
    } catch (error) {
      if (this.stopped) return;
      const kind = error instanceof UnwrapError ? "broken" : this.account.classify(error);
      if (kind === "broken") {
        this.seen.add(wrap.id);
        this.failed++;
        this.keep({
          key: wrapKey(this.me, wrap.id),
          owner: this.me,
          wrapId: wrap.id,
          at: wrap.created_at,
          failed: true,
        });
        return;
      }
      // The signer said no, or went quiet: hold everything until the reader acts.
      this.queue.set(wrap.id, item);
      this.paused = kind;
    }
  }

  // ─── history ────────────────────────────────────────────────────────────

  advance(relay: string): boolean {
    return this.pager?.advance(relay) ?? false;
  }

  advanceAll(): boolean {
    return this.pager?.advanceAll() ?? false;
  }

  retry(relay: string): boolean {
    return this.pager?.retry(relay) ?? false;
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
    const now = this.now();
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

  /** React to a message (NIP-25 inside a wrap). "+" is a like. */
  async react(target: DmMessage, content: string): Promise<SendResult> {
    const others = target.room.split(",").filter((pk) => pk && pk !== this.me);
    // NIP-25 names the author; the other p tags keep the reaction in the same room.
    const named = [...new Set([target.author, ...others])].filter((pk) => pk !== this.me);
    const rumor = makeRumor({
      pubkey: this.me,
      kind: REACTION_KIND,
      created_at: this.now(),
      tags: [["e", target.id], ...named.map((pk) => ["p", pk]), ["k", String(target.kind)]],
      content: content || "+",
    });
    return this.deliver(rumor, others, undefined);
  }

  private async deliver(rumor: Rumor, others: string[], expiration: number | undefined): Promise<SendResult> {
    const signer = this.account.sealSigner;
    if (!signer) return { ok: false, error: "Your signer can't encrypt private messages (NIP-44)." };
    if (!this.inbox.length) return { ok: false, error: "Set up your inbox relays first." };

    const lookups = await Promise.all(
      others.map((pk) => this.deps.loadInbox(pk).catch(() => ({ relays: [], found: false }))),
    );
    const missing = others.filter((_, i) => !lookups[i].relays.length);
    if (missing.length) return { ok: false, missing, error: "Some people have no inbox relays yet." };

    const placeholder = messageFromRumor(rumor, { id: "", created_at: this.now() }, [])!;
    placeholder.outgoing = { status: "sending", deliveries: [] };
    this.store.add(placeholder, this.now());

    const targets = [
      ...others.map((pk, i) => ({ pk, relays: lookups[i].relays })),
      { pk: this.me, relays: this.inbox },
    ];
    const wraps: OutgoingWrap[] = [];
    try {
      for (const target of targets) {
        const wrap = await wrapRumor(rumor, target.pk, signer, { expiration });
        wraps.push({ recipient: target.pk, wrap, relays: target.relays.slice(0, MAX_INBOX_RELAYS) });
      }
    } catch (error) {
      const reason = this.account.classify(error);
      if (reason === "cancelled") {
        this.store.remove([rumor.id]);
        return { ok: false, error: "Cancelled" };
      }
      this.store.patch(rumor.id, {
        outgoing: {
          status: "failed",
          deliveries: [],
          error: error instanceof Error ? error.message : "Signing failed",
        },
      });
      return { ok: false, error: error instanceof Error ? error.message : "Signing failed" };
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
    const message = await this.publishWraps(messageId, wraps, true);
    return { ok: message?.outgoing?.status !== "failed", message };
  }

  private async publishWraps(messageId: string, wraps: OutgoingWrap[], onlyFailed = false) {
    const previous = this.store.message(messageId)?.outgoing?.deliveries ?? [];
    const accepted = (recipient: string, relay: string) =>
      previous.some((d) => d.recipient === recipient && d.relay === relay && d.ok);
    const deliveries: Delivery[] = [];
    const update = (status: OutgoingStatus) =>
      this.store.patch(messageId, { outgoing: { status, deliveries: [...deliveries] } });

    await Promise.all(
      wraps.flatMap((w) =>
        w.relays.map(async (relay) => {
          if (onlyFailed && accepted(w.recipient, relay)) {
            deliveries.push({ recipient: w.recipient, relay, ok: true });
            return;
          }
          const result = await this.deps.transport
            .publish(relay, w.wrap)
            .catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
          deliveries.push({ recipient: w.recipient, relay, ok: result.ok, message: result.message });
          update("sending");
        }),
      ),
    );

    const recipients = wraps.filter((w) => w.recipient !== this.me || wraps.length === 1).map((w) => w.recipient);
    const reached = recipients.filter((r) => deliveries.some((d) => d.recipient === r && d.ok));
    const status: OutgoingStatus =
      reached.length === recipients.length ? "sent" : reached.length ? "partial" : "failed";
    const relays = deliveries.filter((d) => d.ok && d.recipient === this.me).map((d) => d.relay);
    this.store.patch(messageId, {
      outgoing: { status, deliveries },
      relays,
    });
    return this.store.message(messageId);
  }

  // ─── state ──────────────────────────────────────────────────────────────

  state(): DmEngineState {
    if (this.snap) return this.snap;
    this.snap = {
      status: this.status,
      inboxRelays: this.inbox,
      live: Object.fromEntries(this.live),
      liveSynced: this.liveSynced,
      floor: this.floor,
      queued: this.queue.size,
      paused: this.paused ?? (!this.allowed && this.queue.size ? "waiting" : undefined),
      failed: this.failed,
      history: this.pager?.snapshot() ?? EMPTY_HISTORY,
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
    };
    if (wait <= 0) flush();
    else this.notifyTimer = setTimeout(flush, wait);
  }
}
