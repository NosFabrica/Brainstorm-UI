/**
 * The Connection page's policy for a set of follow-paths — no React, no
 * fetch: which paths are the same, what a path's risk is, how the groups
 * order, and how far to sample when the server hands back one random path
 * at a time.
 *
 * The team (2026-09-24): surface paths that run through a flagged or
 * unverified account, so a reader can spot a bad actor inside their trust
 * network. One vocabulary, the app's own: **Flagged** is the network's
 * verdict (`useAuthorFlags`), **Unverified** is a house score under the
 * verified line or none at all (`useAuthorScores`, `null`). Only the
 * connectors are judged — the origin is you or Brainstorm, and the target's
 * standing is on the card already.
 */
import { DEFAULT_VERIFIED_LINE } from "@/services/trustThreshold";
import type { ShortestPath } from "@/services/api/users";

export type PathRisk = "verified" | "unverified" | "flagged" | "checking";

export interface PathVerdict {
  risk: PathRisk;
  /** The first risky connector in walk order — the account to point at; -1 when none. */
  riskyIndex: number;
  riskyCount: number;
}

/** Signals as the hooks hand them: `undefined` has not landed yet, `null` means unrated. */
export interface RiskSignals {
  flaggedOf: (pk: string) => boolean | undefined;
  scoreOf: (pk: string) => number | null | undefined;
  verifiedLine?: number;
}

export function pathKey(path: string[]): string {
  return path.join(",");
}

/** One of each path, in the order first seen. */
export function dedupePaths(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const p of paths) {
    const k = pathKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** One account's standing as a connector — the same rule the path verdict is built from. */
export function nodeRisk(pk: string, { flaggedOf, scoreOf, verifiedLine = DEFAULT_VERIFIED_LINE }: RiskSignals): PathRisk {
  const flagged = flaggedOf(pk);
  const score = scoreOf(pk);
  // A flag decides, whatever else is still loading.
  if (flagged === true) return "flagged";
  if (score === null || (typeof score === "number" && score < verifiedLine)) return "unverified";
  // Both signals come from one batch: a landed score means the flag has
  // landed too. Only an absent score is "still checking".
  return score === undefined ? "checking" : "verified";
}

export function classifyPath(path: string[], signals: RiskSignals): PathVerdict {
  let risk: PathRisk = "verified";
  let riskyIndex = -1;
  let riskyCount = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const r = nodeRisk(path[i], signals);
    if (r === "flagged" || r === "unverified") {
      riskyCount++;
      if (riskyIndex === -1) riskyIndex = i;
      if (r === "flagged") risk = "flagged";
      else if (risk !== "flagged") risk = "unverified";
    } else if (r === "checking" && risk === "verified") {
      risk = "checking";
    }
  }
  return { risk, riskyIndex, riskyCount };
}

export interface PathGroups {
  verified: string[][];
  unverified: string[][];
  flagged: string[][];
  checking: string[][];
}

/** Buckets by risk; within a bucket, fewer risky nodes first, then the order first seen. */
export function groupPaths(paths: string[][], classify: (path: string[]) => PathVerdict): PathGroups {
  const rows = paths.map((path, order) => ({ path, order, verdict: classify(path) }));
  const bucket = (risk: PathRisk) =>
    rows
      .filter((r) => r.verdict.risk === risk)
      .sort((a, b) => a.verdict.riskyCount - b.verdict.riskyCount || a.order - b.order)
      .map((r) => r.path);
  return { verified: bucket("verified"), unverified: bucket("unverified"), flagged: bucket("flagged"), checking: bucket("checking") };
}

/** The safest first: verified, then unverified, then flagged. Paths still checking wait. */
export function orderedPaths(g: PathGroups): string[][] {
  return [...g.verified, ...g.unverified, ...g.flagged];
}

export interface SampleResult {
  paths: string[][];
  /** Extra calls made beyond the head. */
  calls: number;
  /** Every path is in hand — the server sent the list, or sampling found them all. */
  complete: boolean;
}

/**
 * The server hands back one random shortest path per call. Until it returns
 * the list it already computes (`head.paths`), sample: waves of a few calls,
 * de-duplicated, stopping once every path is in hand or the budget is spent.
 * A wave never asks for more than are left; a failed sample is dropped.
 */
export async function samplePaths(
  head: ShortestPath,
  fetchOne: () => Promise<ShortestPath>,
  { maxCalls = 7, wave = 3 }: { maxCalls?: number; wave?: number } = {},
): Promise<SampleResult> {
  if (head.paths?.length) return { paths: dedupePaths(head.paths), calls: 0, complete: true };
  let paths = dedupePaths([head.path]);
  let calls = 0;
  const budget = maxCalls - 1; // the head was one call
  while (paths.length < head.pathCount && calls < budget) {
    const size = Math.min(wave, budget - calls, head.pathCount - paths.length);
    const settled = await Promise.allSettled(Array.from({ length: size }, () => fetchOne()));
    calls += size;
    const found = settled.flatMap((r) => (r.status === "fulfilled" && r.value?.path?.length ? [r.value.path] : []));
    paths = dedupePaths([...paths, ...found]);
  }
  return { paths, calls, complete: paths.length >= head.pathCount };
}
