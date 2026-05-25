import { useState } from "react";
import { Telescope, Search as SearchIcon } from "lucide-react";

export function SegmentedPills() {
  const [pov, setPov] = useState<"nosfabrica" | "mywot">("nosfabrica");
  const userName = "Handled";

  return (
    <div className="min-h-screen flex items-start justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3 sm:p-4">
          <div className="flex items-center gap-2 px-2">
            <SearchIcon className="h-4 w-4 text-slate-400" />
            <div className="flex-1 text-sm text-slate-400 py-2">Search npub, NIP-05, or name…</div>
            <button className="h-9 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-sm">
              Search
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 px-3" data-testid="text-pov-indicator">
            <Telescope className="h-3 w-3 text-slate-400" />
            <span className="text-[11px] text-slate-400">Viewing as</span>
            <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5 ml-0.5" role="tablist">
              <button
                onClick={() => setPov("nosfabrica")}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${
                  pov === "nosfabrica"
                    ? "bg-white text-indigo-500 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                data-testid="pill-nosfabrica"
              >
                NosFabrica
              </button>
              <button
                onClick={() => setPov("mywot")}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${
                  pov === "mywot"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                data-testid="pill-mywot"
              >
                {userName}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 px-2 text-[11px] text-slate-500 leading-relaxed">
          <p className="font-semibold text-slate-700 mb-1">Option B — Mini segmented control</p>
          <p>Both POVs visible as side-by-side pills. The active one is filled, the inactive one is ghosted. Slightly more visual weight but instantly clear what's clickable and what the other choice is.</p>
        </div>
      </div>
    </div>
  );
}
