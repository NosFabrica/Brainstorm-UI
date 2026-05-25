import { useState } from "react";
import { UserCheck, VolumeX, Flag, Copy } from "lucide-react";

const NOSFABRICA = 93;
const YOU = 80;
const NPUB = "npub1gcxzte5zlknk26j68ez60fzkvtkm9e0vrw...";

function Ring({ value, color, size = 90 }: { value: number; color: "indigo" | "emerald"; size?: number }) {
  const stroke = color === "indigo" ? "#6366f1" : "#10b981";
  const text = color === "indigo" ? "text-indigo-700" : "text-emerald-700";
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  const cx = size / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={stroke} strokeWidth="6" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: "stroke-dashoffset 400ms ease" }} />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${text}`} style={{ transition: "color 400ms ease" }}>{value}</div>
    </div>
  );
}

function TrustBlock({ mobile = false, idSuffix }: { mobile?: boolean; idSuffix: string }) {
  const [pov, setPov] = useState<"nosfabrica" | "you">("you");
  const value = pov === "nosfabrica" ? NOSFABRICA : YOU;
  const color = pov === "nosfabrica" ? "indigo" : "emerald";
  const tier = pov === "nosfabrica" ? "Highly Trusted" : "Highly Trusted";
  const tierColor = pov === "nosfabrica" ? "text-indigo-700" : "text-emerald-700";

  return (
    <div className={`flex flex-col items-center gap-2 ${mobile ? "shrink-0" : "shrink-0"}`}>
      <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5" role="tablist" aria-label="Trust perspective">
        <button
          onClick={() => setPov("nosfabrica")}
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-all ${pov === "nosfabrica" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          data-testid={`pill-nosfabrica${idSuffix}`}
        >
          NosFabrica
        </button>
        <button
          onClick={() => setPov("you")}
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-all ${pov === "you" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          data-testid={`pill-you${idSuffix}`}
        >
          You
        </button>
      </div>
      <Ring value={value} color={color} size={mobile ? 70 : 90} />
      <p className={`text-[11px] font-semibold ${tierColor} leading-none`} style={{ transition: "color 400ms ease" }}>{tier}</p>
      {pov === "you" && NOSFABRICA !== YOU && (
        <p className="text-[9px] text-slate-400 font-medium leading-none">NosFabrica: {NOSFABRICA} · +{NOSFABRICA - YOU}</p>
      )}
      {pov === "nosfabrica" && NOSFABRICA !== YOU && (
        <p className="text-[9px] text-slate-400 font-medium leading-none">You: {YOU} · −{NOSFABRICA - YOU}</p>
      )}
    </div>
  );
}

function HeaderCard({ mobile = false, idSuffix }: { mobile?: boolean; idSuffix: string }) {
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

        {mobile ? (
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-center">
            <TrustBlock mobile idSuffix={idSuffix} />
          </div>
        ) : (
          <TrustBlock idSuffix={idSuffix} />
        )}
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3">
        <p className="text-xs text-slate-600">Nostr's Chief Android Officer · Amethyst Social</p>
      </div>
    </div>
  );
}

export function SwitchableSingle() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 p-6">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Desktop · try the toggle</p>
          <HeaderCard idSuffix="-d" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Mobile · try the toggle</p>
          <div className="max-w-[390px]">
            <HeaderCard mobile idSuffix="-m" />
          </div>
        </div>
        <div className="max-w-2xl text-[11px] text-slate-500 leading-relaxed pt-2">
          <p className="font-semibold text-slate-700 mb-1">V4 — Switchable Single</p>
          <p>Same compact footprint as the original single ring (no gap). A tiny segmented pill above the ring lets users flip which perspective is shown — same pattern just shipped on Search. Other-score caption sits beneath so both numbers are still legible without clicking.</p>
        </div>
      </div>
    </div>
  );
}
