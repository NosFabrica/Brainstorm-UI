/**
 * What one account's private messages keep on this device: which wraps it
 * holds, the opened messages sealed at rest, the paging state and the outbox —
 * restored at start, written back as they change. Part of the DM engine
 * (services/dm/engine), which composes it.
 *
 * Every write is checked against one guard, taken from the cache when the
 * engine is built: a clear (sign-out) after that ends every write this would
 * make — its stop-time flush, and a send settling after it stopped.
 */
import type { NostrEvent } from "nostr-tools";
import type { CursorSnapshot } from "@/lib/dm/cursors";
import { messageFromRumor, type DmMessage } from "@/lib/dm/store";
import {
  FAILED_RULES,
  MAX_CACHED_WRAPS,
  wrapKey,
  type CachedOpen,
  type DmCacheBackend,
  type Sealer,
  type StoredWrap,
} from "@/lib/dm/cache";
import type { DmCore } from "./core";

/** What the cache needs from the rest of the engine. */
export interface DeviceCacheHost {
  /** A wrap that arrived while its row was read back, and the row turned out not to hold it. */
  ingest(wrap: NostrEvent, relay: string): void;
  /** The paging state the device kept: when it last caught up, and where history stood. */
  restoreSync(lastSeen: number | undefined, cursors: CursorSnapshot | undefined): void;
  /** The paging state to keep now. */
  syncState(): { lastSeen?: number; cursors?: CursorSnapshot };
  /** The outbox the device kept, sealed. */
  restoreOutbox(sealed: string): Promise<void>;
  /** The outbox to keep, sealed; undefined when there is nothing to keep. */
  sealOutbox(): Promise<string | undefined>;
}

export class DeviceCache {
  private readonly me: string;
  private readonly cache: DmCacheBackend | null;
  /**
   * Whether the device cache is still this engine's to write: taken once, when the
   * engine starts, so a clear (sign-out) after that ends every write it would make —
   * its stop-time flush, and a send settling after it stopped.
   */
  private readonly cacheLive: () => boolean;

  /** Wraps the device holds (by its keys) whose rows aren't read back yet — see `restore`. */
  private readonly unhydrated = new Set<string>();
  /** Copies of those that came from a relay meanwhile, with the relays they came from. */
  private readonly arrivedEarly = new Map<string, { wrap: NostrEvent; relays: Set<string> }>();
  /** Rows sealed on the device, waiting to be opened, newest first. */
  private pendingRows: StoredWrap[] = [];
  /** The rows, when the cache could only hand them over whole (no `wrapKeys`). */
  private rowsRead?: StoredWrap[];
  private restored = false;
  private draining?: Promise<void>;
  /**
   * Where the next page of kept rows starts (newest first), for a cache that reads
   * them by page (`wrapsPage`); null once every row has been read.
   */
  private nextPage: { at: number; key: string } | null | undefined;
  /** Messages is open: the rest of the device's messages are read and opened. */
  private restNow = false;
  /** Ids of the rows read so far, for `releaseMissing` once the last page is in. */
  private readonly rowsHeld = new Set<string>();
  private persistChain: Promise<void> = Promise.resolve();
  private writes: StoredWrap[] = [];
  private writeTimer: unknown;
  private stateTimer: unknown;

  constructor(
    private readonly core: DmCore,
    cache: DmCacheBackend | null,
    private readonly sealer: Sealer | undefined,
    private readonly host: DeviceCacheHost,
  ) {
    this.me = core.me;
    this.cache = cache;
    this.cacheLive = this.cache?.guard?.() ?? (() => true);
  }

  private get stopped(): boolean {
    return this.core.stopped;
  }

  /**
   * What this device kept, back in two steps, so connecting waits on neither
   * the read nor the decrypt of a whole inbox.
   *
   * 1. `restore`: the paging state, the outbox, and which wraps are held — from
   *    the cache's KEYS alone (`owner:wrapId`), no envelope read or opened.
   *    That is all connecting needs: `seen` keeps the live tail and the pager
   *    from opening again what the device already has. The engine connects
   *    the moment it is done.
   * 2. `hydrateRows`, beside the connect: the rows themselves, newest first,
   *    by page where the cache reads by page (`wrapsPage`). The newest few
   *    hundred are read and opened at once (the inbox's top, and every recent
   *    unread); the rest only when the reader opens Messages (`allowDecrypt`).
   *    Each is an AES-GCM open and a JSON parse — for 30,000 wraps, seconds of
   *    main thread, which a load that never opens Messages no longer pays.
   *
   * Between the two, a wrap the device holds may arrive from a relay before
   * its row is read back: it is set aside with its relays (`arrivedEarly`) and
   * settled when the row is — merged into the message, or opened afresh if the
   * row turns out not to hold it after all (unopenable, judged by older rules,
   * evicted). Counts can only rise as older messages come back; nothing is
   * counted twice (the store is keyed by message) and nothing is marked read
   * by their absence (Messages marks a room read up to its newest message, and
   * moves the mark when an older-arriving newer one lands).
   */
  async restore() {
    if (!this.cache) return;
    try {
      const [state, keys, rows] = await Promise.all([
        this.cache.state(this.me),
        this.cache.wrapKeys?.(this.me),
        // A cache that can't list its keys alone: the rows are read whole, now.
        this.cache.wrapKeys ? undefined : this.cache.wraps(this.me),
      ]);
      // Made by an older version: its cursors may sit past a band it skipped,
      // so history is fetched again from the top (opened wraps are skipped).
      const current = state?.syncVersion === SYNC_VERSION;
      this.host.restoreSync(current ? state?.lastSeen : undefined, current ? state?.cursors : undefined);
      const prefix = wrapKey(this.me, "").length;
      if (rows) {
        this.rowsRead = rows;
        for (const row of rows) this.holdUnhydrated(row.wrapId);
      } else for (const key of keys ?? []) this.holdUnhydrated(key.slice(prefix));
      if (state?.outbox) await this.host.restoreOutbox(state.outbox);
      this.restored = true;
    } catch {
      // The device has nothing to say: whatever it holds is opened again if met.
      for (const id of [...this.unhydrated]) this.releaseRow(id);
    }
  }

  /**
   * A wrap already seen arrived from `relay`: if the device holds it and its row
   * isn't read back yet, it is kept until it is (`settleRow`). False otherwise.
   */
  holdEarly(wrap: NostrEvent, relay: string): boolean {
    if (!this.unhydrated.has(wrap.id)) return false;
    const early = this.arrivedEarly.get(wrap.id);
    if (early) early.relays.add(relay);
    else this.arrivedEarly.set(wrap.id, { wrap, relays: new Set([relay]) });
    return true;
  }

  /** A wrap the device holds, not read back yet: seen, so nothing opens it twice. */
  private holdUnhydrated(wrapId: string) {
    this.core.seen.add(wrapId);
    this.unhydrated.add(wrapId);
  }

  /** Its row is back: what arrived meanwhile only adds its relays. */
  private settleRow(wrapId: string) {
    this.unhydrated.delete(wrapId);
    this.arrivedEarly.delete(wrapId);
  }

  /**
   * Its row can't stand for it (unopenable here, judged by older rules,
   * evicted, gone): no longer seen, and a copy that arrived meanwhile is
   * opened now, as one arriving later would be.
   */
  private releaseRow(wrapId: string) {
    this.core.seen.delete(wrapId);
    this.unhydrated.delete(wrapId);
    const early = this.arrivedEarly.get(wrapId);
    this.arrivedEarly.delete(wrapId);
    if (early) for (const relay of early.relays) this.host.ingest(early.wrap, relay);
  }

  async hydrateRows() {
    if (!this.cache || !this.restored || this.stopped) return;
    const cache = this.cache;
    const rowsRead = this.rowsRead;
    this.rowsRead = undefined;
    // By page, newest first, where the cache can: the boot needs the newest few
    // hundred, and reading 30,000 rows whole (and opening them all at idle) cost
    // every load seconds of main thread for a Messages screen most never open.
    const paged = !rowsRead && !!cache.wrapsPage;
    let rows: StoredWrap[];
    try {
      if (paged) {
        await this.evictOldest();
        rows = await this.readPage(BOOT_HYDRATE);
      } else rows = rowsRead ?? (await cache.wraps(this.me));
    } catch {
      for (const id of [...this.unhydrated]) this.releaseRow(id);
      return;
    }
    if (this.stopped) return;
    if (!paged) {
      // Newest first, so the inbox fills from the top.
      rows.sort((a, b) => b.at - a.at);
      if (rows.length > MAX_CACHED_WRAPS) {
        const evicted = rows.splice(MAX_CACHED_WRAPS);
        void cache.deleteWraps(evicted.map((r) => r.key)).catch(() => {});
        for (const r of evicted) this.releaseRow(r.wrapId);
      }
    }
    this.pendingRows = this.takeRows(rows);
    // Every row is read (whole, or the one page was all there was): any listed a moment
    // ago and gone now (another tab evicted it) is not held after all.
    if (!paged || this.nextPage === null) this.releaseMissing(rows);
    await this.openRows(BOOT_HYDRATE);
    if (this.restNow) void this.drainRows();
  }

  /**
   * One page of kept rows, newest first, from where the last one ended. Sets
   * `nextPage` to null when nothing older is left.
   */
  private async readPage(limit: number): Promise<StoredWrap[]> {
    if (this.nextPage === null || !this.cache?.wrapsPage) return [];
    const rows = await this.cache.wrapsPage(this.me, { before: this.nextPage, limit });
    const last = rows.at(-1);
    this.nextPage = rows.length < limit || !last ? null : { at: last.at, key: last.key };
    return rows;
  }

  /** Past MAX_CACHED_WRAPS, the oldest rows go — read from the old end, only as many as are over. */
  private async evictOldest() {
    const over = this.unhydrated.size - MAX_CACHED_WRAPS;
    if (over <= 0 || !this.cache?.wrapsPage) return;
    const evicted = await this.cache.wrapsPage(this.me, { limit: over, oldestFirst: true });
    void this.cache.deleteWraps(evicted.map((r) => r.key)).catch(() => {});
    for (const r of evicted) this.releaseRow(r.wrapId);
  }

  /**
   * Rows read back: held for good, given up on, or waiting to be opened (returned).
   * Failures judged by older rules are opened once more: "failed" rows from before
   * failures carried a reason (maybe a signer's hiccup, not a broken message), and
   * failures judged by older, stricter unwrap rules (FAILED_RULES) — a seal with tags
   * used to count as broken.
   */
  private takeRows(rows: StoredWrap[]): StoredWrap[] {
    const retry = (r: StoredWrap) => !!r.failed && (!r.reason || r.rules !== FAILED_RULES);
    const legacy = rows.filter(retry);
    if (legacy.length) {
      void this.cache?.deleteWraps(legacy.map((r) => r.key)).catch(() => {});
      for (const r of legacy) this.releaseRow(r.wrapId);
    }
    const sealer = this.sealer;
    const toOpen: StoredWrap[] = [];
    for (const row of rows) {
      this.rowsHeld.add(row.wrapId);
      if (retry(row)) continue;
      this.core.seen.add(row.wrapId);
      // Seen and nothing more: a failure kept on purpose, or a device that can't seal.
      if (!row.envelope || !sealer?.supported()) this.settleRow(row.wrapId);
      else toOpen.push(row);
    }
    return toOpen;
  }

  /** Listed at restore, gone by the time every row was read (another tab evicted it): not held after all. */
  private releaseMissing(rows: StoredWrap[]) {
    for (const r of rows) this.rowsHeld.add(r.wrapId);
    for (const id of [...this.unhydrated]) if (!this.rowsHeld.has(id)) this.releaseRow(id);
    this.rowsHeld.clear();
  }

  /** The reader is in Messages: everything this device holds, read and opened (yielding between slices). */
  hydrateRest() {
    this.restNow = true;
    if (this.restored && (this.pendingRows.length || this.nextPage)) void this.drainRows();
  }

  private drainRows(): Promise<void> {
    this.draining ??= (async () => {
      while (!this.stopped) {
        if (!this.pendingRows.length) {
          if (!this.nextPage) break;
          let rows: StoredWrap[];
          try {
            rows = await this.readPage(HYDRATE_PAGE);
          } catch {
            break;
          }
          if (this.stopped) break;
          this.pendingRows = this.takeRows(rows);
          if (this.nextPage === null) this.releaseMissing([]);
          if (!this.pendingRows.length) continue;
        }
        await this.openRows(HYDRATE_SLICE);
        if (this.pendingRows.length || this.nextPage) await yieldToMain();
      }
    })().finally(() => {
      this.draining = undefined;
    });
    return this.draining;
  }

  /** Open up to `limit` of the waiting rows, newest first, in slices that yield between them. */
  private async openRows(limit: number) {
    const sealer = this.sealer;
    if (!sealer || !this.cache) return;
    const rows = this.pendingRows.splice(0, limit);
    const expired: string[] = [];
    // In slices, yielding between them: thousands of AES-GCM opens and JSON
    // parses at once would hold the main thread.
    for (let i = 0; i < rows.length; i += HYDRATE_SLICE) {
      const slice = rows.slice(i, i + HYDRATE_SLICE);
      const opened = await Promise.all(
        slice.map(async (row) => {
          try {
            return { row, open: JSON.parse(await sealer.open(row.envelope!, this.me)) as CachedOpen };
          } catch {
            return { row, open: null };
          }
        }),
      );
      if (this.stopped) return;
      const now = this.core.now();
      const store = this.core.store;
      store.batch(() => {
        for (const { row, open } of opened) {
          // A sealed copy this device can no longer open: forget it, and the wrap is opened again if met.
          if (!open) {
            this.releaseRow(row.wrapId);
            continue;
          }
          // A copy that came from a relay while this row waited: its relays join the message's.
          const early = this.arrivedEarly.get(open.wrapId);
          const relays = early ? [...new Set([...open.relays, ...early.relays])] : open.relays;
          this.settleRow(row.wrapId);
          const tags = open.expiresAt ? [["expiration", String(open.expiresAt)]] : undefined;
          const message = messageFromRumor(open.rumor, { id: open.wrapId, created_at: open.wrapAt, tags }, relays);
          if (!message) continue;
          // Expired while the app was closed: gone from disk too.
          if (message.expiresAt && message.expiresAt <= now) {
            expired.push(row.key);
            continue;
          }
          this.core.wrapToMessage.set(open.wrapId, message.id);
          store.add(message, now);
        }
      });
      if (i + HYDRATE_SLICE < rows.length) await yieldToMain();
    }
    if (expired.length) void this.cache.deleteWraps(expired).catch(() => {});
  }

  /** Kept, in the next batch of writes. Nothing once the engine has stopped. */
  keep(row: StoredWrap) {
    if (!this.cache || this.stopped) return;
    this.writes.push(row);
    if (this.writeTimer !== undefined) return;
    this.writeTimer = this.core.clock.set(() => this.flushWrites(), 1000);
  }

  /** A wrap that is remembered as given up on — not a message (`skipped`), or a payload that can't open. */
  keepFailed(wrapId: string, at: number, reason: "skipped" | "broken") {
    this.keep({
      key: wrapKey(this.me, wrapId),
      owner: this.me,
      wrapId,
      at,
      failed: true,
      reason,
      rules: FAILED_RULES,
    });
  }

  /** Messages expired from the store: gone from the device too. */
  forget(messages: DmMessage[]) {
    if (!this.cache) return;
    void this.cache.deleteWraps(messages.map((m) => wrapKey(this.me, m.wrapId))).catch(() => {});
  }

  flushWrites() {
    if (this.writeTimer !== undefined) {
      this.core.clock.clear(this.writeTimer);
      this.writeTimer = undefined;
    }
    const rows = this.writes;
    this.writes = [];
    if (rows.length && this.cache && this.cacheLive()) void this.cache.putWraps(rows).catch(() => {});
  }

  async keepOpened(message: DmMessage) {
    if (!this.cache) return;
    const sealer = this.sealer;
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

  scheduleState() {
    if (!this.cache || this.stopped || this.stateTimer !== undefined) return;
    this.stateTimer = this.core.clock.set(() => {
      this.stateTimer = undefined;
      this.persistState();
    }, 1500);
  }

  /**
   * Writes go one after another, so a slow seal can't land an older state over
   * a newer one; and nothing is written once sign-out has cleared the cache
   * (`cacheLive`), not replayed into the next account's session. Once stopped,
   * only stop's own flush writes.
   */
  persistState({ final = false }: { final?: boolean } = {}) {
    if (!this.cache || (this.stopped && !final) || !this.cacheLive()) return;
    const cache = this.cache;
    const sync = this.host.syncState();
    const base = {
      owner: this.me,
      lastSeen: sync.lastSeen,
      cursors: sync.cursors,
      syncVersion: SYNC_VERSION,
    };
    this.persistChain = this.persistChain
      .then(async () => {
        const outbox = await this.host.sealOutbox().catch(() => undefined);
        if (!this.cacheLive()) return;
        await cache.putState({ ...base, ...(outbox ? { outbox } : {}) });
      })
      .catch(() => {});
  }

  /** The engine stopped: nothing more is opened, and what is waiting to be written is, once. */
  stop() {
    this.pendingRows = [];
    if (this.stateTimer !== undefined) this.core.clock.clear(this.stateTimer);
    this.stateTimer = undefined;
    this.flushWrites();
    this.persistState({ final: true });
  }
}

/** Bumped when saved cursors can't be trusted (a paging fix): they're dropped once and history refetched. */
const SYNC_VERSION = 2;
/** Opened from the cache this many at a time, yielding between. */
const HYDRATE_SLICE = 250;
/** Rows read from the device at a time once Messages is open. */
const HYDRATE_PAGE = 1000;
/** Opened from the cache at start, newest first; the rest wait for Messages. */
const BOOT_HYDRATE = 300;

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
