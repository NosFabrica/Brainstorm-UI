import { VerificationCoin } from "@/components/score/VerificationCoin";
import { useScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { rungFor, UNKNOWN_EXPLAINER } from "@/lib/trustLadder";
import type { ScorePov } from "@/components/score/TrustScorePov";

/**
 * The "tier tile": a coin, the tier word, and a caption — the block the
 * profile-confirm dialog and the note author hover card show.
 *
 * Both used to draw their own: a five-tier word from a private table, and a
 * square that held the digits in number mode and NOTHING in every other mode
 * (the blank box in the screenshot). This tile follows both viewer settings
 * by construction — the coin inside it already renders digits / pips / glyph
 * per display mode, the word comes from the active ladder, and in "off" it
 * isn't there at all. Unknown swaps the caption for its explainer.
 *
 * Layout is one row with a truncating text column, so it sits the same in a
 * 320px dialog and a desktop hover card.
 */
export function TierTile({
  score01,
  flagged = false,
  pov,
  caption,
  className = "",
}: {
  score01: number | null | undefined;
  flagged?: boolean;
  pov: ScorePov;
  caption: string;
  className?: string;
}) {
  const [displayMode] = useScoreDisplayMode();
  const [granularity] = useTierGranularity();
  if (displayMode === "off") return null;
  const hasScore = typeof score01 === "number" && Number.isFinite(score01);
  if (!hasScore && !flagged) return null;
  const rung = rungFor(score01, flagged, granularity);
  const sub = rung.key === "unknown" ? UNKNOWN_EXPLAINER : caption;
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-xl border p-2.5 ${className}`}
      style={{ borderColor: `${rung.color}40`, backgroundColor: `${rung.color}0d` }}
      data-testid="tier-tile"
      data-tier={rung.key}
      data-ladder={granularity}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <VerificationCoin score01={score01} flagged={flagged} pov={pov} size={34} ring={false} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight" style={{ color: rung.color }} data-testid="tier-tile-word">
          {rung.label}
        </p>
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
    </div>
  );
}
