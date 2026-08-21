import { DEFAULT_VERIFIED_LINE, TIER_THRESHOLDS, TIER_LABELS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { useScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { tierForScore01 } from "@/components/score/VerificationCoin";
import { rungFraction, rungFor, type Granularity } from "@/lib/trustLadder";
import { useTierGranularity } from "@/hooks/useTierGranularity";

/**
 * Lean trust-score ring for the public share page. Takes a 0–1 influence score
 * (the house / Web-of-Trust perspective from the network) and renders a ring +
 * tier label. Deliberately simpler than ProfilePage's dual-meter badge — a
 * public teaser, not the full app widget. Tier bands match `trustThreshold.ts`.
 */

// Fixed public-page bands. The low bound is the DEFAULT line, not the viewer's
// preset: this badge is handed a bare house score with no observer context (see
// DEFAULT_VERIFIED_LINE), and the viewer is usually anonymous anyway.
// Colors come from the shared TRUST_TIER_COLORS palette (services/trustThreshold)
// so this bar and the dashboard's Network Composition never drift.
const SHARE_TIERS = [
  { key: "high", name: TIER_LABELS.high, min: TIER_THRESHOLDS.high, color: TRUST_TIER_COLORS.highlyTrusted, text: "text-emerald-700", ring: TRUST_TIER_COLORS.highlyTrusted },
  { key: "trusted", name: TIER_LABELS.trusted, min: TIER_THRESHOLDS.medium_high, color: TRUST_TIER_COLORS.trusted, text: "text-sky-700", ring: TRUST_TIER_COLORS.trusted },
  { key: "neutral", name: TIER_LABELS.neutral, min: TIER_THRESHOLDS.medium, color: TRUST_TIER_COLORS.neutral, text: "text-brand-primary", ring: TRUST_TIER_COLORS.neutral },
  { key: "low", name: TIER_LABELS.low, min: DEFAULT_VERIFIED_LINE, color: TRUST_TIER_COLORS.lowTrust, text: "text-amber-700", ring: TRUST_TIER_COLORS.lowTrust },
  { key: "unverified", name: TIER_LABELS.unverified, min: 0, color: TRUST_TIER_COLORS.unverified, text: "text-zinc-600", ring: TRUST_TIER_COLORS.unverified },
];

export function tierForScore(score01: number) {
  return SHARE_TIERS.find((t) => score01 >= t.min) ?? SHARE_TIERS[SHARE_TIERS.length - 1];
}

/**
 * The same shape as `tierForScore`, but on the viewer's ladder: under Simple it
 * is the bucket (Verified / Unknown / Flagged) from lib/trustLadder, under
 * Detailed it is the five-tier band. Every surface that shows a tier WORD to a
 * person should read this, not `tierForScore` — that one stays for analysis
 * that genuinely needs the five bands (the hops weak-link rule).
 */
export function shareTierFor(score01: number, granularity: Granularity, flagged = false) {
  if (granularity === "detailed" && !flagged) return tierForScore(score01);
  const r = rungFor(score01, flagged, granularity);
  const text = r.key === "flagged" ? "text-red-600" : r.key === "unknown" ? "text-zinc-600" : "text-sky-700";
  return { key: r.key, name: r.label, min: 0, color: r.color, text, ring: r.color };
}

export function TrustScoreBadge({ score01, size = 96 }: { score01: number | null | undefined; size?: number }) {
  const [displayMode] = useScoreDisplayMode();
  const [granularity] = useTierGranularity();
  const hasScore = typeof score01 === "number" && !Number.isNaN(score01);
  const score = hasScore ? Math.max(0, Math.min(1, score01 as number)) : 0;
  const tier = shareTierFor(score, granularity);
  const pct = Math.round(score * 100);
  // The arc follows the display mode: exact in number mode, quantized to the
  // 5-step tier ladder in level mode (an arc filled to score/100 with no digits
  // is still the number), and FULL in tier mode — there the ring is hue only,
  // and the word below carries the meaning.
  const arcFrac =
    displayMode === "number" ? score :
    displayMode === "level" ? rungFraction(score, false, granularity) : 1;

  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = hasScore ? c * arcFrac : 0;

  return (
    <div className="flex flex-col items-center gap-2" data-testid="share-trust-badge">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          {hasScore && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={tier.ring}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-bold text-slate-900 dark:text-slate-100 leading-none tabular-nums"
            style={{ fontFamily: "var(--font-display)", fontSize: Math.round(size * 0.34) }}
          >
            {hasScore ? (displayMode === "number" ? pct : "") : "—"}
          </span>
        </div>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${tier.text}`}>{hasScore ? tier.name : "Unrated"}</span>
    </div>
  );
}
