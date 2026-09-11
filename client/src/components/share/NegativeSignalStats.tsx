import { Stat, type StatLens } from "@/components/share/StatToggle";

/** The shape `/user/{pubkey}/stats` returns for one relationship. */
export type SectionCounts = { verified?: number; total?: number } | undefined;

export type NegativeSignalSections = {
  muted_by?: SectionCounts;
  reported_by?: SectionCounts;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Verified muters and verified reporters, beside verified followers under the
 * same Verified/All lens. Both counts come straight from `/stats`: muters clear
 * the preset's muter cutoff, reporters its reporter cutoff — two different bars,
 * neither knowable from one number here, so nothing recomputes them. A signal
 * shows only when its count under the current lens is above zero — "0
 * Verified Reporters" spent a line saying nothing on most profiles (Benjamin,
 * 2026-09-08); the lens still reveals what the other hides.
 */
export function NegativeSignalStats({
  stats,
  rawId,
  lens,
  isFlagged = false,
}: {
  stats: NegativeSignalSections | undefined;
  /** Share id, for the "see the full list" links. */
  rawId: string;
  lens: StatLens;
  isFlagged?: boolean;
}) {
  const verifiedMuters = num(stats?.muted_by?.verified);
  const allMuters = num(stats?.muted_by?.total);
  const verifiedReporters = num(stats?.reported_by?.verified);
  const allReporters = num(stats?.reported_by?.total);

  // The number the lens would show — Stat's own rule — and whether it says anything.
  const shown = (verified: number | null, all: number | null) => {
    const count = lens === "verified" ? verified : all;
    return count ?? (lens === "verified" ? all : verified);
  };
  const hasMuters = (shown(verifiedMuters, allMuters) ?? 0) > 0;
  const hasReporters = (shown(verifiedReporters, allReporters) ?? 0) > 0;
  if (!hasMuters && !hasReporters) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500"
      data-testid="share-stats-negative"
    >
      {hasMuters && (
        <Stat
          verified={verifiedMuters}
          all={allMuters}
          verifiedLabel="Verified Muters"
          allLabel="All Muters"
          href={`/p/${rawId}/muters`}
          lens={lens}
          testId="share-stat-muters"
        />
      )}
      {hasReporters && (
        <Stat
          verified={verifiedReporters}
          all={allReporters}
          verifiedLabel="Verified Reporters"
          allLabel="All Reporters"
          href={`/p/${rawId}/reporters`}
          lens={lens}
          danger={isFlagged}
          testId="share-stat-reporters"
        />
      )}
    </div>
  );
}
