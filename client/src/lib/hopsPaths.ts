/**
 * The Connection page's policy over a Path network — no React, no fetch: an
 * account's risk, how many paths run through the flagged or unverified ones,
 * and the safest-first order of the paths, produced one at a time. Only
 * Connectors are judged, never the two ends.
 */
import { DEFAULT_VERIFIED_LINE } from "@/services/trustThreshold";

export type PathRisk = "verified" | "unverified" | "flagged" | "checking";

export type RiskKind = "flagged" | "unverified";

/** Signals as the hooks hand them: `undefined` has not landed yet, `null` means unrated. */
export interface RiskSignals {
  flaggedOf: (pk: string) => boolean | undefined;
  scoreOf: (pk: string) => number | null | undefined;
  verifiedLine?: number;
}

/** A Path network with its two ends (`ShortestPath` minus the bookkeeping). */
export interface PathNetwork {
  from: string;
  to: string;
  layers: string[][];
  links: number[][][];
}

/** Partial-path counts per Connector: from `from` to it, and from it to `to`. */
function walkCounts(n: PathNetwork, avoid: (pk: string) => boolean = () => false) {
  const last = n.layers.length - 1;
  const fwd = n.layers.map((layer) => layer.map(() => 0));
  const back = n.layers.map((layer) => layer.map(() => 0));
  n.layers[0]?.forEach((pk, j) => (fwd[0][j] = avoid(pk) ? 0 : 1));
  for (let i = 0; i < last; i++) {
    n.links[i].forEach((targets, j) =>
      targets.forEach((k) => {
        if (!avoid(n.layers[i + 1][k])) fwd[i + 1][k] += fwd[i][j];
      }),
    );
  }
  n.layers[last]?.forEach((pk, j) => (back[last][j] = avoid(pk) ? 0 : 1));
  for (let i = last - 1; i >= 0; i--) {
    n.links[i].forEach((targets, j) => {
      if (!avoid(n.layers[i][j])) back[i][j] = targets.reduce((sum, k) => sum + back[i + 1][k], 0);
    });
  }
  return { fwd, back };
}

/** Paths from `from` to `to`, optionally only those that avoid some accounts. */
export function countPaths(n: PathNetwork, avoid?: (pk: string) => boolean): number {
  if (!n.layers.length) return 1;
  const { fwd } = walkCounts(n, avoid);
  return fwd[fwd.length - 1].reduce((sum, c) => sum + c, 0);
}

export interface RiskyAccount {
  pubkey: string;
  /** 1 = followed by `from` directly. */
  hop: number;
  /** Paths that run through this account. */
  paths: number;
}

/**
 * The flagged (or unverified) Connectors, most paths through them first, then
 * nearest, then pubkey — and how many paths run through any of them.
 */
export function riskyAccounts(
  n: PathNetwork,
  kind: RiskKind,
  signals: RiskSignals,
): { accounts: RiskyAccount[]; paths: number } {
  const risky = new Set(n.layers.flat().filter((pk) => nodeRisk(pk, signals) === kind));
  if (!risky.size) return { accounts: [], paths: 0 };
  const { fwd, back } = walkCounts(n);
  const accounts = n.layers
    .flatMap((layer, i) => layer.map((pubkey, j) => ({ pubkey, hop: i + 1, paths: fwd[i][j] * back[i][j] })))
    .filter((a) => risky.has(a.pubkey))
    .sort((a, b) => b.paths - a.paths || a.hop - b.hop || (a.pubkey < b.pubkey ? -1 : 1));
  return { accounts, paths: countPaths(n) - countPaths(n, (pk) => risky.has(pk)) };
}

/** Every Connector's signals have landed, so counts and order are final. */
export function networkJudged(n: PathNetwork, signals: RiskSignals): boolean {
  return n.layers.every((layer) => layer.every((pk) => nodeRisk(pk, signals) !== "checking"));
}

const LEVEL: Record<PathRisk, number> = { verified: 0, checking: 0, unverified: 1, flagged: 2 };

interface PartialPath {
  layer: number;
  index: number;
  connectors: string[];
  /** Worst risk level, flagged and unverified Connectors, weakest house score — so far. */
  level: number;
  flagged: number;
  unverified: number;
  weakest: number;
}

function safer(a: PartialPath, b: PartialPath): number {
  if (a.level !== b.level) return a.level - b.level;
  if (a.flagged !== b.flagged) return a.flagged - b.flagged;
  if (a.unverified !== b.unverified) return a.unverified - b.unverified;
  if (a.weakest !== b.weakest) return b.weakest - a.weakest;
  for (let i = 0; i < Math.min(a.connectors.length, b.connectors.length); i++) {
    if (a.connectors[i] !== b.connectors[i]) return a.connectors[i] < b.connectors[i] ? -1 : 1;
  }
  return a.connectors.length - b.connectors.length;
}

/**
 * The `k`-th path (0-based, ends included) in safest-first order: verified →
 * unverified → flagged, then fewer flagged Connectors, then fewer unverified, then the strongest
 * weakest-Connector house score, then pubkey. `through` keeps only the paths
 * through that account. Best-first: every key only worsens as a path grows,
 * so paths come out in order without listing them all. Undefined past the end.
 */
export function pathAt(n: PathNetwork, signals: RiskSignals, k: number, through?: string): string[] | undefined {
  if (!n.layers.length) return k === 0 ? [n.from, n.to] : undefined;
  const throughLayer = through ? n.layers.findIndex((layer) => layer.includes(through)) : -1;
  const last = n.layers.length - 1;
  const step = (from: PartialPath | null, layer: number, index: number): PartialPath | null => {
    const pk = n.layers[layer][index];
    if (layer === throughLayer && pk !== through) return null;
    const risk = nodeRisk(pk, signals);
    const score = signals.scoreOf(pk);
    return {
      layer,
      index,
      connectors: [...(from?.connectors ?? []), pk],
      level: Math.max(from?.level ?? 0, LEVEL[risk]),
      flagged: (from?.flagged ?? 0) + (risk === "flagged" ? 1 : 0),
      unverified: (from?.unverified ?? 0) + (risk === "unverified" ? 1 : 0),
      weakest: Math.min(from?.weakest ?? Infinity, typeof score === "number" ? score : 0),
    };
  };
  const queue: PartialPath[] = [];
  const push = (p: PartialPath | null) => {
    if (!p) return;
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (safer(queue[mid], p) <= 0) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, p);
  };
  n.layers[0].forEach((_, j) => push(step(null, 0, j)));
  let found = 0;
  while (queue.length) {
    const p = queue.shift()!;
    if (p.layer === last) {
      if (found++ === k) return [n.from, ...p.connectors, n.to];
      continue;
    }
    n.links[p.layer][p.index].forEach((next) => push(step(p, p.layer + 1, next)));
  }
  return undefined;
}

/** One account's standing as a connector — the same rule the path verdict is built from. */
export function nodeRisk(
  pk: string,
  { flaggedOf, scoreOf, verifiedLine = DEFAULT_VERIFIED_LINE }: RiskSignals,
): PathRisk {
  const flagged = flaggedOf(pk);
  const score = scoreOf(pk);
  // A flag decides, whatever else is still loading.
  if (flagged === true) return "flagged";
  if (score === null || (typeof score === "number" && score < verifiedLine)) return "unverified";
  // Both signals come from one batch: a landed score means the flag has
  // landed too. Only an absent score is "still checking".
  return score === undefined ? "checking" : "verified";
}

/** The first flagged or unverified Connector in walk order; -1 when none. */
export function firstRiskyIndex(path: string[], signals: RiskSignals): number {
  for (let i = 1; i < path.length - 1; i++) {
    if (LEVEL[nodeRisk(path[i], signals)] > 0) return i;
  }
  return -1;
}
