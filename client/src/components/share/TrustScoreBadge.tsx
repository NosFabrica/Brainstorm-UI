import { TIER_THRESHOLDS } from "@/services/trustThreshold";

/**
 * Lean trust-score ring for the public share page. Takes a 0–1 influence score
 * (the house / Web-of-Trust perspective from the network) and renders a ring +
 * tier label. Deliberately simpler than ProfilePage's dual-meter badge — a
 * public teaser, not the full app widget. Tier bands match `trustThreshold.ts`.
 */

// Fixed public-page bands (low bound 0.02 = the default verified threshold;
// not preset-driven, since the viewer is usually anonymous).
const SHARE_TIERS = [
  { key: "high", name: "Highly Trusted", min: TIER_THRESHOLDS.high, color: "#059669", text: "text-emerald-700", ring: "#059669" },
  { key: "trusted", name: "Trusted", min: TIER_THRESHOLDS.medium_high, color: "#0ea5e9", text: "text-sky-700", ring: "#0ea5e9" },
  { key: "neutral", name: "Neutral", min: TIER_THRESHOLDS.medium, color: "#6366f1", text: "text-indigo-600", ring: "#6366f1" },
  { key: "low", name: "Low Trust", min: 0.02, color: "#f59e0b", text: "text-amber-700", ring: "#f59e0b" },
  { key: "unverified", name: "Unverified", min: 0, color: "#a1a1aa", text: "text-zinc-600", ring: "#a1a1aa" },
];

export function tierForScore(score01: number) {
  return SHARE_TIERS.find((t) => score01 >= t.min) ?? SHARE_TIERS[SHARE_TIERS.length - 1];
}

export function TrustScoreBadge({ score01, size = 96 }: { score01: number | null | undefined; size?: number }) {
  const hasScore = typeof score01 === "number" && !Number.isNaN(score01);
  const score = hasScore ? Math.max(0, Math.min(1, score01 as number)) : 0;
  const tier = tierForScore(score);
  const pct = Math.round(score * 100);

  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = hasScore ? c * score : 0;

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
            className="font-bold text-slate-900 leading-none tabular-nums"
            style={{ fontFamily: "var(--font-display)", fontSize: Math.round(size * 0.34) }}
          >
            {hasScore ? pct : "—"}
          </span>
        </div>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${tier.text}`}>{hasScore ? tier.name : "Unrated"}</span>
    </div>
  );
}
