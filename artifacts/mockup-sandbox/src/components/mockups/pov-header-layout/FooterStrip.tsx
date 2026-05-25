import { UserCheck, VolumeX, Flag, Copy, Sparkles } from "lucide-react";

const NOSFABRICA = 93;
const YOU = 80;
const NPUB = "npub1gcxzte5zlknk26j68ez60fzkvtkm9e0vrw...";

function MiniMeter({ value, color, label }: { value: number; color: "indigo" | "emerald"; label: string }) {
  const stroke = color === "indigo" ? "#6366f1" : "#10b981";
  const text = color === "indigo" ? "text-indigo-700" : "text-emerald-700";
  const sub = color === "indigo" ? "text-indigo-500/80" : "text-emerald-500/80";
  const r = 18;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative" style={{ width: 44, height: 44 }}>
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={stroke} strokeWidth="3.5" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 22 22)" />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center text-[13px] font-bold ${text}`}>{value}</div>
      </div>
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${sub} leading-none`}>{label}</p>
        <p className="text-[11px] font-medium text-slate-700 leading-none mt-1">Highly Trusted</p>
      </div>
    </div>
  );
}

function HeaderCard({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className="rounded-2xl border border-indigo-200/60 bg-white shadow-sm overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400" />
      <div className={`${mobile ? "p-4" : "p-6"}`}>
        <div className="flex items-start gap-3">
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
      </div>

      {/* Trust footer strip - full width */}
      <div className="border-t border-slate-100 bg-gradient-to-r from-indigo-50/40 via-white to-emerald-50/40 px-6 py-3.5">
        <div className={`flex ${mobile ? "flex-col gap-3" : "items-center justify-between gap-4"}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Sparkles className="h-3 w-3 text-indigo-400" /> Brainstorm
          </div>
          <div className={`flex items-center ${mobile ? "gap-4 justify-between" : "gap-5"}`}>
            <MiniMeter value={NOSFABRICA} color="indigo" label="NosFabrica" />
            <div className="h-8 w-px bg-slate-200" />
            <MiniMeter value={YOU} color="emerald" label="You" />
          </div>
          <div className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-700 whitespace-nowrap">
            Slight difference · 13 pts
          </div>
        </div>
      </div>
    </div>
  );
}

export function FooterStrip() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 p-6">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Desktop</p>
          <HeaderCard />
          <div className="mt-3 px-1">
            <p className="text-xs text-slate-600">Nostr's Chief Android Officer · Amethyst Social</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Mobile</p>
          <div className="max-w-[390px]">
            <HeaderCard mobile />
            <div className="mt-3 px-1">
              <p className="text-xs text-slate-600">Nostr's Chief Android Officer · Amethyst Social</p>
            </div>
          </div>
        </div>
        <div className="max-w-2xl text-[11px] text-slate-500 leading-relaxed pt-2">
          <p className="font-semibold text-slate-700 mb-1">V2 — Footer Strip</p>
          <p>The dual rings move from the right column to a full-width strip at the bottom of the card. Profile and trust are visually grouped (both inside the card) and the description sits directly underneath with no awkward gap.</p>
        </div>
      </div>
    </div>
  );
}
