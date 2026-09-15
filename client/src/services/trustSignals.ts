import { apiClient, type TrustSignals } from "@/services/api";

/**
 * Session-level memo of each author's Trust signals — the score the tier rings
 * read and whether the network has flagged the account. Lookups made within a
 * short window go out as one batched request, concurrent lookups dedupe, and
 * the two hooks that read it (useAuthorScores, useAuthorFlags) share it.
 */
const BATCH_WINDOW_MS = 50;
const MAX_BATCH = 500;
const HEX_PUBKEY = /^[0-9a-f]{64}$/i;
const UNRATED: TrustSignals = { influence: null, flagged: false };

const cache = new Map<string, Promise<TrustSignals>>();
const settled = new Map<string, TrustSignals>();
let queued = new Map<string, (signals: TrustSignals) => void>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

function settle(pubkey: string, signals: TrustSignals, resolve: (s: TrustSignals) => void): void {
  settled.set(pubkey, signals);
  resolve(signals);
}

function flush(): void {
  flushTimer = undefined;
  const batch = [...queued];
  queued = new Map();
  // One malformed pubkey would fail the whole batch server-side.
  const valid = batch.filter(([pubkey]) => HEX_PUBKEY.test(pubkey));
  for (const [pubkey, resolve] of batch) if (!HEX_PUBKEY.test(pubkey)) settle(pubkey, UNRATED, resolve);
  const gen = generation;
  for (let i = 0; i < valid.length; i += MAX_BATCH) {
    const chunk = valid.slice(i, i + MAX_BATCH);
    void apiClient.getTrustSignals(chunk.map(([pubkey]) => pubkey.toLowerCase())).then((found) => {
      if (gen !== generation) return;
      for (const [pubkey, resolve] of chunk) settle(pubkey, found.get(pubkey.toLowerCase()) ?? UNRATED, resolve);
    });
  }
}

export function lookupTrustSignals(pubkey: string): Promise<TrustSignals> {
  let p = cache.get(pubkey);
  if (!p) {
    p = new Promise((resolve) => queued.set(pubkey, resolve));
    cache.set(pubkey, p);
    flushTimer ??= setTimeout(flush, BATCH_WINDOW_MS);
  }
  return p;
}

/** What we already know, synchronously; undefined until the lookup lands. */
export function settledTrustSignals(pubkey: string): TrustSignals | undefined {
  return settled.get(pubkey);
}

export function hasSettledTrustSignals(pubkey: string): boolean {
  return settled.has(pubkey);
}

/** Test seam. */
export function __resetTrustSignals(): void {
  generation++;
  clearTimeout(flushTimer);
  flushTimer = undefined;
  queued = new Map();
  cache.clear();
  settled.clear();
}
