import { UserCheck, VolumeX, Flag, Copy } from "lucide-react";

const NOSFABRICA = 93;
const YOU = 80;
const NPUB = "npub1gcxzte5zlknk26j68ez60fzkvtkm9e0vrw...";

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

        {/* Horizontal trust scale */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" /> Brainstorm Trust
            </p>
            <p className="text-[10px] font-medium text-slate-500">Highly Trusted on both</p>
          </div>
          <div className="relative h-2.5 bg-gradient-to-r from-rose-100 via-amber-100 to-emerald-100 rounded-full">
            {/* Tier divider lines */}
            <div className="absolute top-0 bottom-0 left-[25%] w-px bg-white/70" />
            <div className="absolute top-0 bottom-0 left-[60%] w-px bg-white/70" />
            <div className="absolute top-0 bottom-0 left-[85%] w-px bg-white/70" />
            {/* You marker */}
            <div className="absolute -top-1 -translate-x-1/2" style={{ left: `${YOU}%` }}>
              <div className="h-4.5 w-4.5 rounded-full bg-emerald-500 border-2 border-white shadow-md" style={{ height: "18px", width: "18px" }} />
            </div>
            {/* NosFabrica marker */}
            <div className="absolute -top-1 -translate-x-1/2" style={{ left: `${NOSFABRICA}%` }}>
              <div className="rounded-full bg-indigo-500 border-2 border-white shadow-md" style={{ height: "18px", width: "18px" }} />
            </div>
          </div>
          <div className="relative h-7 mt-1.5 text-[10px]">
            {/* You label */}
            <div className="absolute -translate-x-1/2 text-center" style={{ left: `${YOU}%` }}>
              <p className="font-bold text-emerald-700 leading-none">{YOU}</p>
              <p className="text-emerald-600/80 leading-none mt-0.5">You</p>
            </div>
            {/* NosFabrica label */}
            <div className="absolute -translate-x-1/2 text-center" style={{ left: `${NOSFABRICA}%` }}>
              <p className="font-bold text-indigo-700 leading-none">{NOSFABRICA}</p>
              <p className="text-indigo-600/80 leading-none mt-0.5">NosFabrica</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1 text-[9px] text-slate-400 font-medium uppercase tracking-wider">
            <span>Untrusted</span>
            <span>· Slight difference · 13 pts ·</span>
            <span>Verified</span>
          </div>
        </div>
      </div>

      {/* Description, glued to the card */}
      <div className="bg-slate-50/60 border-t border-slate-100 px-6 py-3">
        <p className="text-xs text-slate-600">Nostr's Chief Android Officer · Amethyst Social</p>
      </div>
    </div>
  );
}

export function HorizontalScale() {
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
          <p className="font-semibold text-slate-700 mb-1">V1 — Horizontal Scale</p>
          <p>Trust score moves out of the right column and becomes a full-width row directly between the profile block and the description. Both perspectives sit on the same 0-100 scale, making the comparison visual instead of numeric. Zero gap between profile and description.</p>
        </div>
      </div>
    </div>
  );
}
