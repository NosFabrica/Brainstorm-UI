import { useState } from "react";
import { Shield, Sparkles, Info } from "lucide-react";

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

export function Tabbed() {
  const [active, setActive] = useState<PovKey>("mywot");
  const pov = POVS[active];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex items-center justify-center font-['Inter']">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950 shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-300" />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">
              Brainstorm Trust Score
            </span>
          </div>
          <Sparkles className="w-3.5 h-3.5 text-slate-500" />
        </div>

        {/* Segmented tabs with numbers */}
        <div className="mx-6 mt-1 mb-5 p-1 rounded-xl bg-slate-900/60 border border-white/5 grid grid-cols-2 gap-1">
          {(Object.keys(POVS) as PovKey[]).map((key) => {
            const p = POVS[key];
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`relative px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
                  isActive
                    ? key === "nosfabrica"
                      ? "bg-indigo-500/15 ring-1 ring-indigo-400/40"
                      : "bg-emerald-500/15 ring-1 ring-emerald-400/40"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.dotClass}`} />
                  <span className={`text-[11px] font-medium ${isActive ? "text-white" : "text-slate-400"}`}>
                    {p.label}
                  </span>
                </div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${isActive ? "text-white" : "text-slate-500"}`}>
                  {p.score}
                </div>
              </button>
            );
          })}
        </div>

        {/* Hero meter */}
        <div className="px-6 pb-2 flex flex-col items-center">
          <div className="relative">
            <ScoreRing value={pov.score} color={pov.ringColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-5xl font-bold tabular-nums text-white tracking-tight">{pov.score}</div>
              <div className={`text-xs font-medium mt-0.5 ${pov.tierColor}`}>{pov.tier}</div>
            </div>
          </div>
        </div>

        {/* Metadata strip */}
        <div className="px-6 pb-5 pt-3">
          <div className="text-center text-[11px] text-slate-500 mb-3">
            From <span className="text-slate-300 font-medium">{pov.label}'s</span> perspective · {pov.reach}
          </div>
          <div className="rounded-lg bg-slate-900/60 border border-white/5 p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span>Confidence</span>
                <span className="tabular-nums text-slate-300 font-medium">{pov.confidence}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pov.confidence}%`, background: pov.ringColor }}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-1.5 text-[10.5px] text-slate-500 leading-relaxed">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>Tap a tab to compare how each network rates this profile.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
