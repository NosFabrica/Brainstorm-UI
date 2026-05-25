import { Shield, Sparkles } from "lucide-react";

function MiniRing({ value, color, size = 120 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
      />
    </svg>
  );
}

function MeterCell({
  label, score, tier, tierColor, color, dotClass, confidence,
}: {
  label: string; score: number; tier: string; tierColor: string;
  color: string; dotClass: string; confidence: number;
}) {
  return (
    <div className="flex-1 rounded-xl bg-slate-900/40 border border-white/5 p-4 flex flex-col items-center">
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-[10.5px] uppercase tracking-[0.15em] text-slate-400 font-medium">
          {label}
        </span>
      </div>
      <div className="relative">
        <MiniRing value={score} color={color} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold tabular-nums text-white">{score}</div>
        </div>
      </div>
      <div className={`mt-2.5 text-xs font-medium ${tierColor}`}>{tier}</div>
      <div className="mt-1.5 text-[10px] text-slate-500 tabular-nums">{confidence}% confidence</div>
    </div>
  );
}

export function DualMeters() {
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

        <div className="px-6 pb-2 text-[11px] text-slate-500 mb-2">
          Two perspectives on this profile
        </div>

        <div className="px-6 pb-5">
          <div className="flex gap-3">
            <MeterCell
              label="NosFabrica"
              score={78}
              tier="Trusted"
              tierColor="text-sky-300"
              color="#6366f1"
              dotClass="bg-indigo-400"
              confidence={84}
            />
            <MeterCell
              label="You"
              score={80}
              tier="Highly Trusted"
              tierColor="text-emerald-300"
              color="#10b981"
              dotClass="bg-emerald-400"
              confidence={88}
            />
          </div>

          {/* Agreement footer */}
          <div className="mt-4 rounded-lg bg-emerald-500/5 border border-emerald-400/15 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-[11px] text-slate-300 leading-snug">
              <span className="text-emerald-300 font-medium">Both perspectives agree</span> — this profile is consistently trusted across networks.
            </div>
          </div>

          <div className="mt-3 text-[10.5px] text-slate-500 leading-relaxed text-center">
            412 verifiers in NosFabrica's view · 37 in your web of trust
          </div>
        </div>
      </div>
    </div>
  );
}
