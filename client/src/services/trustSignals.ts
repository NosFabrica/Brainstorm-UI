import { apiClient, type TrustSignals } from "@/services/api";
import { connectionSpeed, type ConnectionSpeed } from "@/lib/connection";

/**
 * Session-level memo of each author's Trust signals — the score the tier rings
 * read and whether the network has flagged the account. Lookups made within a
 * short window go out as one batched request, concurrent lookups dedupe, and
 * the two hooks that read it (useAuthorScores, useAuthorFlags) share it.
 */
/**
 * How long lookups gather before they go. Results stream in bursts, and on a
 * slow connection those bursts are far enough apart that a 50ms window closed
 * eighteen times for one page (staging at 3G, 2026-09-18) — so the window
 * follows the connection, and each new author extends it until the page stops
 * producing them.
 */
const BATCH_WINDOW_MS: Record<ConnectionSpeed, number> = {
  normal: 50,
  slow: 1000,
  "very-slow": 1500,
};
/** …but rings cannot wait on a page that never stops arriving. */
const MAX_GATHER_MS = 3000;
const MAX_BATCH = 500;
const HEX_PUBKEY = /^[0-9a-f]{64}$/i;
const UNRATED: TrustSignals = { influence: null, flagged: false };

const cache = new Map<string, Promise<TrustSignals>>();
const settled = new Map<string, TrustSignals>();
let queued = new Map<string, (signals: TrustSignals) => void>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let gatheringSince = 0;
let generation = 0;

function settle(pubkey: string, signals: TrustSignals, resolve: (s: TrustSignals) => void): void {
  settled.set(pubkey, signals);
  resolve(signals);
}

function flush(): void {
  flushTimer = undefined;
  gatheringSince = 0;
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
    const now = Date.now();
    if (!gatheringSince) gatheringSince = now;
    const window = BATCH_WINDOW_MS[connectionSpeed()];
    // Extend for the next burst, but never past the ceiling.
    const wait = Math.max(0, Math.min(window, gatheringSince + MAX_GATHER_MS - now));
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, wait);
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
  gatheringSince = 0;
  generation++;
  clearTimeout(flushTimer);
  flushTimer = undefined;
  queued = new Map();
  cache.clear();
  settled.clear();
}
