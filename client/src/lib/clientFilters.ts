/**
 * The filters the relay can't do, done on the client — probed 2026-09-03:
 * filter:rank is ignored and there is no hops token. "Verified accounts
 * only" reads the author scores the rings already fetch; "reach" — how far
 * the search casts its net — reads the viewer's own follow graph. Pure, so
 * the results page and the composed page filter identically.
 */
import { DEFAULT_VERIFIED_LINE } from "@/services/trustThreshold";
import type { SearchHit } from "@/services/search";

export type Reach = "follows" | "friends";

export interface ClientFilterState {
  verifiedOnly: boolean;
  reach: Reach | null;
  /**
   * The search floor: hide an author whose score is KNOWN and below the
   * verified line — the same line the badge draws. Probed 2026-09-05: the
   * relay's house lens let two aéPiot accounts scoring 0 and 0.0198 fill 38 of
   * the 40 newest "Ainsley Costello" notes. A score still loading, or one the
   * house has no data for, is no verdict — those stay. Off under "Include
   * spam" and under a person's own perspective (their lens, their view).
   */
  belowLine?: boolean;
}

/** Known and under the line — the one case the floor acts on. */
function underLine(score: number | null | undefined, line: number): boolean {
  return typeof score === "number" && score < line;
}

/** How many of these hits the floor would hide — for the page to say so. */
export function countBelowLine(hits: SearchHit[], scoreOf: (pk: string) => number | null | undefined, line = DEFAULT_VERIFIED_LINE): number {
  return hits.filter((h) => underLine(scoreOf(h.event.pubkey), line)).length;
}

export interface NetworkReach {
  /** People the viewer follows. */
  direct: ReadonlySet<string>;
  /** Direct follows plus a sampled two-hop set (friends of friends). */
  friends: ReadonlySet<string>;
  /** False while the graph is still loading — hold results rather than show a false empty page. */
  ready: boolean;
}

export function clientFilterHits<H extends SearchHit>(
  hits: H[],
  state: ClientFilterState,
  ctx: { scoreOf: (pk: string) => number | null | undefined; reach: NetworkReach; verifiedLine?: number },
): H[] {
  const line = ctx.verifiedLine ?? DEFAULT_VERIFIED_LINE;
  return hits.filter((h) => {
    const pk = h.event.pubkey;
    if (state.verifiedOnly && (ctx.scoreOf(pk) ?? -1) < line) return false;
    if (state.belowLine && underLine(ctx.scoreOf(pk), line)) return false;
    if (state.reach && ctx.reach.ready) {
      const set = state.reach === "follows" ? ctx.reach.direct : ctx.reach.friends;
      if (!set.has(pk)) return false;
    }
    return true;
  });
}

export const NO_REACH: NetworkReach = { direct: new Set(), friends: new Set(), ready: true };
