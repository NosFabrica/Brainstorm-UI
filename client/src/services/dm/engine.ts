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
import type { PageHandlers, PagerSnapshot } from "@/lib/dm/pager";
import { GIFT_WRAP_KIND, type Decrypt, type SealSigner } from "@/lib/dm/giftWrap";
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
import { InboxLink } from "./inboxLink";

export { LIVE_TAIL_SECONDS } from "./inboxLink";

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

/**
 * The engine: four parts behind one `stopped` flag (DmCore), composed here.
 *
 *  - `DeviceCache` (./deviceCache): what this device keeps, restored at start and
 *    written back as it changes, every write checked against the cache's guard.
 *  - `WrapOpener` (./wrapOpener): the wraps that arrived, opened at the signer's pace.
 *  - `Outbox` (./outbox): what is sent, kept until everyone has it.
 *  - `InboxLink` (./inboxLink): the live subscription and history paging.
 *
 * A wrap from a relay comes in through `ingest`, which hands it to the part it
 * belongs to.
 */
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
  /** The inbox relays: the live subscription and history below it. */
  private readonly link: InboxLink;

  private readonly receivedBy = new Map<string, Set<string>>();
  private stopOnline?: () => void;
  private starting?: Promise<void>;
  private hydrating?: Promise<void>;
  private ticker: unknown;
  private readonly listeners = new Set<() => void>();
  private snap: DmEngineState | null = null;

  constructor(
    account: DmAccount,
    private readonly deps: DmEngineDeps,
  ) {
    this.me = account.pubkey;
    this.clock = makeClock(deps);
    this.core = new DmCore(this.me, this.clock, deps.online ?? onlineNow, () => this.changed());
    this.store = this.core.store;
    this.device = new DeviceCache(this.core, deps.cache ?? null, deps.sealer, {
      ingest: (wrap, relay) => this.ingest(wrap, relay),
      restoreSync: (lastSeen, cursors) => this.link.restoreSync(lastSeen, cursors),
      syncState: () => this.link.syncState(),
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
        onDrained: () => this.link.markSeenIfSynced(),
      },
    );
    this.outbox = new Outbox(this.core, account, deps, {
      status: () => this.link.status,
      whenStarted: () => this.starting,
      inbox: () => this.link.inbox,
      beginSeal: () => this.opener.beginSeal(),
      endSeal: () => this.opener.endSeal(),
      keepOpened: (message) => this.device.keepOpened(message),
      keepFailed: (wrapId, at, reason) => this.device.keepFailed(wrapId, at, reason),
      scheduleState: () => this.device.scheduleState(),
    });
    this.link = new InboxLink(this.core, deps, {
      ingest: (wrap, relay) => this.ingest(wrap, relay),
      unopenedByRelay: () => this.opener.unopenedByRelay(),
      oldestWaiting: (at) => this.opener.oldestWaiting(at),
      scheduleState: () => this.device.scheduleState(),
    });
  }

  private get stopped(): boolean {
    return this.core.stopped;
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
    const connecting = this.link.connect();
    await Promise.all([connecting, this.hydrating]);
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

  /**
   * Sign-out and account switch: the one `stopped` flag is set first, so no part
   * acts after this; then every subscription and timer ends, and what the device
   * cache was waiting to write is flushed once (unless a clear already ended it).
   */
  stop(): void {
    this.core.stopped = true;
    this.link.stop();
    this.outbox.stop();
    this.stopOnline?.();
    this.opener.stop();
    if (this.ticker !== undefined) this.clock.clearRepeat(this.ticker);
    this.device.stop();
    this.changed();
    this.listeners.clear();
  }

  /** Read the account's inbox list again — after setting it up, or changing it in Settings. */
  refreshInbox(): Promise<void> {
    return this.link.refresh();
  }

  private tick() {
    this.link.markSeenIfSynced(true);
    this.flushOutbox();
    const gone = this.store.sweepExpired(this.core.now());
    if (gone.length) this.device.forget(gone);
  }

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

  /** A wrap from a relay, live or paged: counted, then merged, held, or queued to open. */
  private ingest(wrap: NostrEvent, relay: string) {
    if (this.stopped || wrap.kind !== GIFT_WRAP_KIND) return;
    let got = this.receivedBy.get(relay);
    if (!got) this.receivedBy.set(relay, (got = new Set()));
    got.add(wrap.id);
    if (this.core.seen.has(wrap.id)) {
      // Held on the device, its row not read back yet: kept until it is (`settleRow`).
      if (this.device.holdEarly(wrap, relay)) return;
      const id = this.core.wrapToMessage.get(wrap.id);
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
    this.link.refetchHistory();
  }

  /**
   * Page every relay to its end without waiting to be scrolled — the sync
   * view's button. Each relay's next page still waits for the last one to be
   * nearly open, so this runs at the signer's pace; it ends when no relay has
   * more, or on `stopDownload()`. For this visit only.
   */
  downloadAll(): void {
    this.link.downloadAll();
  }

  stopDownload(): void {
    this.link.stopDownload();
  }

  /** Try the wraps set aside this visit again — the sync view's button. */
  retrySetAside(): void {
    this.opener.retrySetAside();
  }

  // ─── history ────────────────────────────────────────────────────────────

  advance(relay: string): boolean {
    return this.link.advance(relay);
  }

  advanceAll(): boolean {
    return this.link.advanceAll();
  }

  retry(relay: string): boolean {
    return this.link.retry(relay);
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
    const link = this.link.state();
    this.snap = {
      status: link.status,
      inboxRelays: link.inboxRelays,
      live: link.live,
      liveSynced: link.liveSynced,
      liveSettled: link.liveSettled,
      sendAuth: this.outbox.sendAuth(),
      floor: link.floor,
      // In flight too: a wrap being opened is still waiting, as far as the reader can tell.
      queued: this.opener.waiting,
      paused: this.opener.pause,
      pauseDetail: this.opener.detail,
      failed: this.opener.failedCount,
      setAside: this.opener.setAside,
      downloading: link.downloading,
      sync: {
        received: Object.fromEntries([...this.receivedBy].map(([url, ids]) => [url, ids.size])),
        opened: this.opener.opened,
      },
      history: link.history,
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
      this.link.keepDownloading();
    };
    if (wait <= 0) flush();
    else this.notifyTimer = setTimeout(flush, wait);
  }
}

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
