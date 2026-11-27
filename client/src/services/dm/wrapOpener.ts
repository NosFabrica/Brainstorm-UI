/**
 * Opening wraps: the queue of wraps that arrived, newest first, opened a few at a
 * time by the account's signer at the pace it answers. Part of the DM engine
 * (services/dm/engine), which composes it.
 *
 * Opening a wrap takes two NIP-44 decrypts by the account's signer. A local key
 * that can unlock silently opens everything as it arrives; an extension or a
 * remote signer waits until the reader opens Messages (`permit`), so signing in
 * never sets off a burst of approval prompts.
 */
import type { NostrEvent } from "nostr-tools";
import { UnwrapError, unwrapGiftWrap, type Decrypt } from "@/lib/dm/giftWrap";
import { Heap } from "@/lib/dm/heap";
import { messageFromRumor, type DmMessage } from "@/lib/dm/store";
import type { DmCore } from "./core";
import type { DmAccount, DmPause } from "./engine";

/** A wrap waiting to be opened. */
export interface Queued {
  wrap: NostrEvent;
  relays: Set<string>;
  /** Times the signer turned this one down. */
  refusals: number;
  /** How many wraps had opened when it was last turned down. */
  openedAtRefusal: number;
}

/** Newest first; a wrap the signer has turned down goes behind the rest. */
export const openFirst = (a: Queued, b: Queued) =>
  a.refusals !== b.refusals ? a.refusals < b.refusals : a.wrap.created_at > b.wrap.created_at;

export interface WrapOpenerOptions {
  /** The most wraps open at once (default 2). */
  concurrency?: number;
  /** How long one wrap may take to open before its slot is taken back (default 45s). */
  decryptTimeoutMs?: number;
  /** Give up early on a request the signer seems to have dropped (see DmEngineDeps). */
  dropDetection?: boolean;
}

/** What opening needs from the rest of the engine. */
export interface WrapOpenerHost {
  /** Remembered on the device as given up on, so it isn't asked again. */
  keepFailed(wrapId: string, at: number, reason: "skipped" | "broken"): void;
  /** An opened message, kept on the device. */
  keepOpened(message: DmMessage): Promise<void>;
  /** Nothing queued and nothing opening: the backlog is open. */
  onDrained(): void;
}

export class WrapOpener {
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

  private readonly queue = new Map<string, Queued>();
  /** The queue in opening order; entries no longer in `queue` are skipped. */
  private readonly order = new Heap<Queued>(openFirst);
  /** Wraps being opened right now — a copy arriving meanwhile isn't opened twice. */
  private readonly opening = new Map<string, Queued>();
  private openedCount = 0;
  private running = 0;
  private allowed = false;
  private paused?: DmPause;
  private pauseDetail?: string;
  private failed = 0;
  private readonly setAsideItems = new Map<string, Queued>();
  private resumeTries = 0;
  private resumeTimer: unknown;

  constructor(
    private readonly core: DmCore,
    private readonly account: DmAccount,
    private readonly opts: WrapOpenerOptions,
    private readonly host: WrapOpenerHost,
  ) {
    this.maxConcurrency = opts.concurrency ?? 2;
  }

  private get stopped(): boolean {
    return this.core.stopped;
  }

  /** The device's messages are back: open what arrives unasked, if the signer can. */
  start() {
    if (!this.account.decrypt) this.paused = "no-nip44";
    else void this.account.canOpenInBackground().then((yes) => yes && this.permit());
  }

  /** Wraps waiting (queued or opening now). */
  get waiting(): number {
    return this.queue.size + this.opening.size;
  }

  /** Why opening is on hold, if it is: `waiting` until the reader allows it. */
  get pause(): DmPause | undefined {
    return this.paused ?? (!this.allowed && this.queue.size ? "waiting" : undefined);
  }

  get detail(): string | undefined {
    return this.pauseDetail;
  }

  /** Wraps that can never be opened (a broken payload). */
  get failedCount(): number {
    return this.failed;
  }

  get setAside(): number {
    return this.setAsideItems.size;
  }

  /** Opened this visit. */
  get opened(): number {
    return this.openedCount;
  }

  /**
   * A wrap not seen before arrived from `relay`: queued, or, if it is queued or
   * opening already, the relay joins it.
   */
  enqueue(wrap: NostrEvent, relay: string) {
    const queued = this.queue.get(wrap.id) ?? this.opening.get(wrap.id);
    if (queued) {
      queued.relays.add(relay);
      return;
    }
    const item: Queued = { wrap, relays: new Set([relay]), refusals: 0, openedAtRefusal: 0 };
    this.queue.set(wrap.id, item);
    this.order.push(item);
    this.core.changed();
    this.pump();
  }

  /** Open what waits — the reader's ask, a key that opens unasked, or a resume after a timeout. */
  permit(): void {
    if (!this.account.decrypt) {
      this.paused = "no-nip44";
      this.core.changed();
      return;
    }
    this.allowed = true;
    if (this.paused !== "no-nip44") this.paused = undefined;
    this.pauseDetail = undefined;
    // The reader asked: now, not after whatever back-off was running.
    this.clearPace();
    this.paceTries = 0;
    this.core.changed();
    this.pump();
  }

  /** A message is being sealed to send: nothing new is opened until it is. */
  beginSeal() {
    this.sealing++;
  }

  endSeal() {
    this.sealing--;
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
        this.core.changed();
        this.pump();
        // The backlog is open: caught up to now, not to the oldest wrap that waited.
        if (!this.running && !this.queue.size) this.host.onDrained();
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
    const { me, store, seen } = this.core;
    const seq = ++this.asked;
    const epoch = this.paceEpoch;
    const askedAt = this.core.clock.ms();
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
      seen.add(wrap.id);
      this.openedCount++;
      this.answeredUpTo = Math.max(this.answeredUpTo, seq);
      this.lastOpenMs = this.core.clock.ms() - askedAt;
      this.paceUp();
      const now = this.core.now();
      // NIP-17: a message to the reader names them. One that doesn't would make
      // a room without them in it — it can't be opened or answered.
      const addressed = rumor.pubkey === me || rumor.tags.some((t) => t[0] === "p" && t[1] === me);
      const message = addressed ? messageFromRumor(rumor, wrap, [...item.relays]) : null;
      // A sender's clock in the future would pin their message to the top.
      if (message && message.createdAt > now + FUTURE_SLACK_SECONDS) message.createdAt = now;
      this.resumeTries = 0;
      if (!message || (!store.add(message, now) && !store.message(message.id))) {
        // Not a message, or already expired: remember the wrap, keep nothing of it.
        this.host.keepFailed(wrap.id, wrap.created_at, "skipped");
        return;
      }
      this.core.wrapToMessage.set(wrap.id, message.id);
      void this.host.keepOpened(store.message(message.id) ?? message);
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
        seen.add(wrap.id);
        this.failed++;
        this.host.keepFailed(wrap.id, wrap.created_at, "broken");
        return;
      }
      // Turned down again after the signer opened others in between: it's this
      // wrap, not the signer — a stranger can't hold the whole inbox shut. Set
      // aside for this visit only: a signer's error is not proof the message is
      // unreadable, and remembering it as such would lose it for good.
      const turnedDown = kind === "refused" || kind === "failed";
      if (turnedDown && item.refusals > 0 && this.openedCount > item.openedAtRefusal) {
        seen.add(wrap.id);
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
    const limit = this.opts.decryptTimeoutMs ?? DECRYPT_TIMEOUT_MS;
    const clock = this.core.clock;
    return new Promise<T>((resolve, reject) => {
      let waited = 0;
      let timer: unknown;
      const giveUp = (dropped: boolean) => {
        onOver();
        reject(new DecryptTimeout(dropped));
      };
      const arm = () => {
        const step = Math.min(ANSWERING_TIMEOUT_MS, limit - waited);
        timer = clock.set(() => {
          waited += step;
          if (this.opts.dropDetection && (this.answeredUpTo > seq || this.lastOpenMs < FAST_OPEN_MS)) giveUp(true);
          else if (waited >= limit) giveUp(false);
          else arm();
        }, step);
      };
      arm();
      work.then(
        (v) => {
          clock.clear(timer);
          resolve(v);
        },
        (e) => {
          clock.clear(timer);
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
    this.paceTimer = this.core.clock.set(() => {
      this.paceTimer = undefined;
      if (this.stopped) return;
      this.core.changed();
      this.pump();
    }, ms);
    return true;
  }

  private clearPace() {
    if (this.paceTimer === undefined) return;
    this.core.clock.clear(this.paceTimer);
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
    this.resumeTimer = this.core.clock.set(() => {
      this.resumeTimer = undefined;
      if (!this.stopped && this.paused === "unreachable") this.permit();
    }, wait);
  }

  /** Try the wraps set aside this visit again — the sync view's button. */
  retrySetAside(): void {
    if (!this.setAsideItems.size) return;
    for (const [id, item] of this.setAsideItems) {
      this.core.seen.delete(id);
      this.requeue({ ...item, refusals: 0 });
    }
    this.setAsideItems.clear();
    this.core.changed();
    this.pump();
  }

  /** Wraps waiting to be opened (queued or opening now), by the relays that delivered them. */
  unopenedByRelay(): Map<string, number> {
    const counts = new Map<string, number>();
    const count = (item: Queued) => {
      for (const relay of item.relays) counts.set(relay, (counts.get(relay) ?? 0) + 1);
    };
    for (const item of this.queue.values()) count(item);
    for (const item of this.opening.values()) count(item);
    return counts;
  }

  /**
   * The oldest wrap not opened yet (queued, opening, or set aside), or `at` if none
   * is older: none of them is kept, so the next visit must ask for them again.
   */
  oldestWaiting(at: number): number {
    for (const q of this.queue.values()) if (q.wrap.created_at < at) at = q.wrap.created_at;
    for (const q of this.opening.values()) if (q.wrap.created_at < at) at = q.wrap.created_at;
    // Set aside isn't cached either: the next visit must ask for those again too.
    for (const q of this.setAsideItems.values()) if (q.wrap.created_at < at) at = q.wrap.created_at;
    return at;
  }

  /** The engine stopped: no timer left, nothing more opened. */
  stop() {
    if (this.resumeTimer !== undefined) this.core.clock.clear(this.resumeTimer);
    this.clearPace();
    this.sealOf.clear();
    this.queue.clear();
    this.order.clear();
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
/** How far ahead of our clock a message may claim to be written. */
const FUTURE_SLACK_SECONDS = 600;
