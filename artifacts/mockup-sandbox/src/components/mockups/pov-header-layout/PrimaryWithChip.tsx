import { UserCheck, VolumeX, Flag, Copy, TrendingUp } from "lucide-react";

const NOSFABRICA = 93;
const YOU = 80;
const NPUB = "npub1gcxzte5zlknk26j68ez60fzkvtkm9e0vrw...";

function PrimaryRing({ size = 90 }: { size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (YOU / 100) * c;
  const cx = size / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#10b981" strokeWidth="6" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-emerald-700">{YOU}</div>
    </div>
  );
}

function ComparisonChip() {
  const diff = NOSFABRICA - YOU;
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200/70 px-2.5 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
      NosFabrica: <span className="font-bold">{NOSFABRICA}</span>
      <span className="text-indigo-500 inline-flex items-center gap-0.5">
        <TrendingUp className="h-3 w-3" />+{diff}
      </span>
    </button>
  );
}

function HeaderCard({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className="rounded-2xl border border-indigo-200/60 bg-white shadow-sm overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400" />
      <div className={`${mobile ? "p-4" : "p-6"} ${mobile ? "" : "flex items-start gap-6"}`}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`${mobile ? "h-14 w-14" : "h-16 w-16"} rounded-full bg-gradient-to-br from-indigo-200 to-violet-200 flex items-center justify-center text-indigo-700 font-bold text-lg shrink-0`}>
            VP
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={`${mobile ? "text-lg" : "text-2xl"} font-bold text-slate-900 leading-tight`}>Vitor Pamplona</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md">Profile Found</span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">_@vitorpamplona.com</p>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-[11px] text-slate-400 font-mono truncate">{NPUB}</p>
              <Copy className="h-3 w-3 text-slate-400 shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              <button className="text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                <UserCheck className="h-3 w-3" /> Following
              </button>
              <button className="text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                <VolumeX className="h-3 w-3" /> Mute
              </button>
              <button className="text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                <Flag className="h-3 w-3" /> Report
              </button>
            </div>
          </div>
        </div>

        {/* Compact trust block: single primary ring + comparison chip */}
        <div className={`${mobile ? "mt-4 pt-4 border-t border-slate-100 flex items-center gap-4" : "flex flex-col items-center gap-2 shrink-0"}`}>
          <PrimaryRing size={mobile ? 70 : 90} />
          <div className={`${mobile ? "" : "text-center"} flex flex-col items-center gap-1.5`}>
            <p className={`text-[11px] font-semibold text-emerald-700 leading-none`}>Highly Trusted</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-medium leading-none">Your view</p>
            <ComparisonChip />
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3">
        <p className="text-xs text-slate-600">Nostr's Chief Android Officer · Amethyst Social</p>
      </div>
    </div>
  );
}

export function PrimaryWithChip() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 p-6">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Desktop</p>
          <HeaderCard />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Mobile</p>
          <div className="max-w-[390px]">
            <HeaderCard mobile />
          </div>
        </div>
        <div className="max-w-2xl text-[11px] text-slate-500 leading-relaxed pt-2">
          <p className="font-semibold text-slate-700 mb-1">V3 — Primary With Chip</p>
          <p>One big ring shows the score this page actually represents (yours). A small comparison chip below surfaces the NosFabrica score with the delta. Same compact footprint as the original single-meter, so the description sits naturally close to the avatar. Click the chip to drill into the gap.</p>
        </div>
      </div>
    </div>
  );
}
