/**
 * Who reported an account, grouped the way the reader would weigh them:
 * people they follow first, whatever their score, then accounts at or above
 * the verified line, then the rest. A flag from three people you follow and a
 * flag from three strangers are the same count and very different news.
 *
 * Scores are whichever perspective the caller asked the reporters in; the
 * grouping doesn't care. Words follow CONTEXT.md: "Unverified", never
 * "untrusted".
 */

export interface Reporter {
  pubkey: string;
  /** 0–1, or null when unrated. */
  influence: number | null;
}

export interface ReporterGroups<R extends Reporter = Reporter> {
  youFollow: R[];
  verified: R[];
  unverified: R[];
}

const byScore = (a: Reporter, b: Reporter) => (b.influence ?? -1) - (a.influence ?? -1);

export function reporterBreakdown<R extends Reporter>(
  reporters: readonly R[],
  { follows, verifiedLine }: { follows: ReadonlySet<string>; verifiedLine: number },
): ReporterGroups<R> {
  const out: ReporterGroups<R> = { youFollow: [], verified: [], unverified: [] };
  for (const r of reporters) {
    if (follows.has(r.pubkey)) out.youFollow.push(r);
    else if ((r.influence ?? -1) >= verifiedLine) out.verified.push(r);
    else out.unverified.push(r);
  }
  out.youFollow.sort(byScore);
  out.verified.sort(byScore);
  out.unverified.sort(byScore);
  return out;
}

/** "2 people you follow · 3 verified · 2 unverified", leaving out empty groups. */
export function breakdownLine(g: ReporterGroups): string {
  const parts: string[] = [];
  if (g.youFollow.length)
    parts.push(g.youFollow.length === 1 ? "1 person you follow" : `${g.youFollow.length} people you follow`);
  if (g.verified.length) parts.push(`${g.verified.length} verified`);
  if (g.unverified.length) parts.push(`${g.unverified.length} unverified`);
  return parts.join(" · ");
}
