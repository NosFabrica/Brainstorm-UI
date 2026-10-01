/**
 * The latest GrapeRank run out of `GET /user/graperankResult`.
 *
 * The server wraps it — `{ code, data: <run> | null, message }` — and the
 * pages that read it disagreed about the level: the dashboard, the network
 * page and the app-wide status read `.data`, while Insights read the top and
 * so saw no status at all (a finished run read "In progress" for every user).
 * One reader, tolerant of a bare run as well, so nobody guesses again.
 *
 * Null means the server answered and there is no run; undefined means there
 * is no answer yet.
 */
type RunLike = { status?: unknown; internal_publication_status?: unknown; ta_status?: unknown };

export function runOf<T extends RunLike>(raw: unknown): T | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object") return null;
  const top = raw as RunLike & { data?: unknown };
  // A bare run carries its own status fields; an envelope carries `data`.
  if (top.internal_publication_status !== undefined || top.status !== undefined) return top as T;
  const inner = top.data;
  return inner && typeof inner === "object" ? (inner as T) : null;
}

/**
 * A run's network in two numbers: how many people came out verified from
 * this point of view, and how many it reached at all.
 *
 * The total alone says little — follow graphs converge, so most connected
 * accounts reach about the same few hundred thousand people. The verified
 * count is the personal one: it moves with the reader's preset and network.
 *
 * `count_values` is tier → hops → count. The server buckets a person above
 * the run's own verified line into high, medium_high, medium or medium_low,
 * and at or below it into low, or the flagged tier with two trusted reports
 * (`classify_tier`). Null when the run does not say, or says it in a shape
 * that cannot be split that way.
 */
const VERIFIED_TIERS = ["high", "medium_high", "medium", "medium_low"] as const;
const UNVERIFIED_TIERS = ["low", "low_and_reported_by_2_or_more_trusted_pubkeys"] as const;

export function networkOfRun(raw: unknown): { verified: number; reached: number } | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const tiers = parsed as Record<string, unknown>;
  const known = [...VERIFIED_TIERS, ...UNVERIFIED_TIERS].filter((t) => t in tiers);
  if (known.length === 0) return null;
  const sum = (tier: string) => {
    const byHops = tiers[tier];
    if (!byHops || typeof byHops !== "object") return 0;
    return Object.values(byHops as Record<string, unknown>).reduce<number>(
      (n, v) => (typeof v === "number" ? n + v : n),
      0,
    );
  };
  const verified = VERIFIED_TIERS.reduce((n, t) => n + sum(t), 0);
  const reached = verified + UNVERIFIED_TIERS.reduce((n, t) => n + sum(t), 0);
  return reached > 0 ? { verified, reached } : null;
}
