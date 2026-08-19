import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { BadgeCheck } from "lucide-react";
import { initialsFor } from "@/lib/profileDefaults";
import { tierForScore } from "@/components/share/TrustScoreBadge";

/**
 * The Open Graph preview card for a shared profile (the rich card that should
 * unfurl in Slack/X/iMessage, and the design the backend mirrors server-side).
 * Substance-forward: a clean enterprise card that LEADS with the person's actual
 * Web-of-Trust standing (the house score, the credible differentiator) rather
 * than decoration. ~1.91:1 (1200×630). `score01` is the 0–1 house influence.
 */
export function ShareOgCard({
  displayName,
  picture,
  nip05,
  score01,
}: {
  displayName: string;
  picture?: string;
  nip05?: string;
  /** House Web-of-Trust score, 0–1. Renders the tier pill when present. */
  score01?: number | null;
}) {
  const hasScore = typeof score01 === "number" && Number.isFinite(score01);
  const tier = hasScore ? tierForScore(score01 as number) : null;
  const pct = hasScore ? Math.round(Math.max(0, Math.min(1, score01 as number)) * 100) : null;

  return (
    <div
      className="relative w-full aspect-[1200/630] rounded-xl overflow-hidden bg-white border border-brand-accent/20"
      style={{ containerType: "inline-size" }}
    >
      {/* Clean surface — a faint brand wash in one corner, no decorative shapes. */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-brand-accent/[0.08]" />
      <div className="relative h-full w-full flex flex-col justify-between p-[5%]">
        {/* Eyebrow: wordmark + context label */}
        <div className="flex items-center justify-between">
          <img src="/brand/wordmark.svg" alt="Brainstorm" draggable={false} className="h-[5cqw] w-auto select-none" />
          <span className="text-[2.4cqw] font-bold uppercase tracking-[0.18em] text-slate-400">Verification Score</span>
        </div>

        {/* Identity + the trust standing */}
        <div className="flex items-center gap-[4%]">
          <Avatar className="h-[26cqw] w-[26cqw] rounded-2xl border-2 border-white shadow-lg bg-white">
            {picture ? <AvatarImage src={picture} alt={displayName} className="object-cover" /> : null}
            <AvatarFallback className="rounded-2xl bg-brand-primary/15 text-brand-primary font-bold text-[8cqw]" style={{ fontFamily: "var(--font-display)" }}>
              {initialsFor(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-[6.5cqw] font-bold leading-tight truncate text-slate-900" style={{ fontFamily: "var(--font-display)" }}>{displayName}</div>
            {nip05 && (
              <div className="flex items-center gap-1 text-[3.4cqw] text-brand-link font-medium mt-[0.6cqw]">
                <BadgeCheck className="h-[3.4cqw] w-[3.4cqw]" /> {nip05.replace(/^_@/, "")}
              </div>
            )}
            {tier && (
              <div
                className="inline-flex items-center gap-[1.6cqw] rounded-full px-[3cqw] py-[1.1cqw] mt-[2.2cqw]"
                style={{ backgroundColor: `${tier.color}14` }}
              >
                <span className="rounded-full h-[1.8cqw] w-[1.8cqw]" style={{ backgroundColor: tier.color }} />
                <span className="text-[3cqw] font-bold uppercase tracking-[0.1em]" style={{ color: tier.color }}>{tier.name}</span>
                {getScoreDisplayMode() === "number" && (
                  <span className="text-[3cqw] font-bold tabular-nums" style={{ color: tier.color }}>· {pct}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* What the score means — credibility for a first-time recipient. */}
        <div className="text-[3cqw] text-slate-500 font-medium leading-snug">
          {hasScore
            ? "Scored by real human connections, not an algorithm."
            : "Reputation from real human connections — not an algorithm."}
        </div>
      </div>
    </div>
  );
}
