import { useState } from "react";
import { Shield, Sparkles, ArrowLeftRight } from "lucide-react";

type PovKey = "nosfabrica" | "mywot";

const POVS: Record<PovKey, {
  label: string;
  score: number;
  tier: string;
  tierColor: string;
  ringColor: string;
  dotClass: string;
  confidence: number;
  reach: string;
}> = {
  nosfabrica: {
    label: "NosFabrica",
    score: 78,
    tier: "Trusted",
    tierColor: "text-sky-300",
    ringColor: "#6366f1",
    dotClass: "bg-indigo-400",
    confidence: 84,
    reach: "412 verifiers",
  },
  mywot: {
    label: "You",
    score: 80,
    tier: "Highly Trusted",
    tierColor: "text-emerald-300",
    ringColor: "#10b981",
    dotClass: "bg-emerald-400",
    confidence: 88,
    reach: "37 in your web",
  },
};

function ScoreRing({ value, color }: { value: number; color: string }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
      <circle cx="100" cy="100" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" />
      <circle
        cx="100" cy="100" r={r}
        stroke={color} strokeWidth="14" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 500ms ease, stroke 400ms ease" }}
      />
    </svg>
  );
}

export function PrimarySecondary() {
  const [primary, setPrimary] = useState<PovKey>("mywot");
  const other: PovKey = primary === "mywot" ? "nosfabrica" : "mywot";
  const main = POVS[primary];
  const sub = POVS[other];

  const swap = () => setPrimary(other);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex items-center justify-center font-['Inter']">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950 shadow-2xl backdrop-blur-xl overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-300" />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">
              Brainstorm Trust Score
            </span>
          </div>
          <Sparkles className="w-3.5 h-3.5 text-slate-500" />
        </div>

        {/* Active POV pill */}
        <div className="px-6 mb-2 flex justify-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
            <span className={`w-1.5 h-1.5 rounded-full ${main.dotClass}`} />
            <span className="text-[10.5px] uppercase tracking-[0.15em] text-slate-300 font-medium">
              {main.label}'s view
            </span>
          </div>
        </div>

        {/* Hero meter */}
        <div className="px-6 pb-3 flex flex-col items-center">
          <div className="relative">
            <ScoreRing value={main.score} color={main.ringColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-5xl font-bold tabular-nums text-white tracking-tight">{main.score}</div>
              <div className={`text-xs font-medium mt-0.5 ${main.tierColor}`}>{main.tier}</div>
            </div>
          </div>
        </div>

        {/* Secondary chip (tap to swap) */}
        <div className="px-6 pb-5">
          <button
            onClick={swap}
            className="group w-full rounded-xl bg-slate-900/60 border border-white/10 hover:border-white/20 hover:bg-slate-900/80 transition-all duration-200 px-4 py-3 flex items-center gap-3"
          >
            <div className="relative w-11 h-11 flex-shrink-0">
              <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
                <circle cx="22" cy="22" r="17" stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
                <circle
                  cx="22" cy="22" r="17"
                  stroke={sub.ringColor} strokeWidth="4" fill="none" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 17}
                  strokeDashoffset={2 * Math.PI * 17 - (sub.score / 100) * 2 * Math.PI * 17}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-white">
                {sub.score}
              </div>
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${sub.dotClass}`} />
                <span className="text-[10.5px] uppercase tracking-[0.15em] text-slate-400 font-medium">
                  {sub.label}'s view
                </span>
              </div>
              <div className={`text-xs font-medium mt-0.5 ${sub.tierColor}`}>{sub.tier}</div>
            </div>
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </button>

          <div className="mt-3 text-center text-[10.5px] text-slate-500 leading-relaxed">
            Tap the chip to promote the other perspective.
          </div>
        </div>
      </div>
    </div>
  );
}
