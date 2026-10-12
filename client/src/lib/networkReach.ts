/**
 * A run's reach and health by hop range — the two numbers behind the Network
 * page's reach strip (once the dashboard's "Your Network" card; the card and
 * its invented fallbacks are gone, so without a run there is nothing to show).
 *
 * `count_values` is tier → hops → count. The server buckets a person above the
 * run's own verified line into high, medium_high, medium or medium_low, at or
 * below it into low, and into the flagged tier with two trusted reports
 * (`classify_tier`). Hop 999 is its "unreached" bucket.
 */
export type CountValues = Record<string, Record<string, number>>;

const VERIFIED_TIERS = ["high", "medium_high", "medium", "medium_low"] as const;
const UNKNOWN_TIERS = ["low"] as const;
const FLAGGED_TIERS = ["low_and_reported_by_2_or_more_trusted_pubkeys"] as const;
/** The server's bucket for people the run did not reach. */
const UNREACHED = 900;

/** The run's `count_values`, whether the server sent an object or a JSON string. */
export function countValuesOf(raw: unknown): CountValues | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as CountValues;
}

/** The furthest hop the run reached; at least 1. */
export function maxHopOf(counts: CountValues): number {
  let max = 1;
  for (const byHops of Object.values(counts)) {
    if (!byHops || typeof byHops !== "object") continue;
    for (const hop of Object.keys(byHops)) {
      const h = parseInt(hop, 10);
      if (!Number.isNaN(h) && h < UNREACHED && h > max) max = h;
    }
  }
  return max;
}

function sumWithin(counts: CountValues, tiers: readonly string[], lo: number, hi: number): number {
  let total = 0;
  for (const tier of tiers) {
    const byHops = counts[tier];
    if (!byHops || typeof byHops !== "object") continue;
    for (const [hop, n] of Object.entries(byHops)) {
      const h = parseInt(hop, 10);
      if (Number.isNaN(h) || h < lo || h > hi) continue;
      if (typeof n === "number") total += n;
    }
  }
  return total;
}

/** Everyone the run reached within `lo..hi` hops, every tier. */
export function reachByHops(counts: CountValues, lo: number, hi: number): number {
  return sumWithin(counts, Object.keys(counts), lo, hi);
}

/** The reach folded into the simple ladder: verified, unknown, flagged. */
export function healthByHops(
  counts: CountValues,
  lo: number,
  hi: number,
): { verified: number; unknown: number; flagged: number } {
  return {
    verified: sumWithin(counts, VERIFIED_TIERS, lo, hi),
    unknown: sumWithin(counts, UNKNOWN_TIERS, lo, hi),
    flagged: sumWithin(counts, FLAGGED_TIERS, lo, hi),
  };
}
