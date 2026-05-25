import { useState } from "react";
import { Telescope, ArrowLeftRight, Search as SearchIcon } from "lucide-react";

export function ClickToToggle() {
  const [pov, setPov] = useState<"nosfabrica" | "mywot">("nosfabrica");
  const [hover, setHover] = useState(false);
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
          <div
            className="flex items-center gap-1.5 mt-2.5 px-3"
            data-testid="text-pov-indicator"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <Telescope className="h-3 w-3 text-slate-400" />
            <p className="text-[11px] text-slate-400">
              Viewing as{" "}
              <button
                onClick={() => setPov(pov === "nosfabrica" ? "mywot" : "nosfabrica")}
                className={`font-medium underline-offset-2 hover:underline transition-colors ${
                  pov === "nosfabrica" ? "text-indigo-500 hover:text-indigo-600" : "text-emerald-600 hover:text-emerald-700"
                }`}
                data-testid="button-toggle-pov"
              >
                {pov === "nosfabrica" ? "NosFabrica" : userName}
              </button>
              <ArrowLeftRight
                className={`inline h-2.5 w-2.5 ml-1 text-slate-300 transition-opacity ${
                  hover ? "opacity-100" : "opacity-0"
                }`}
              />
            </p>
          </div>
        </div>

        <div className="mt-6 px-2 text-[11px] text-slate-500 leading-relaxed">
          <p className="font-semibold text-slate-700 mb-1">Option A — Click-to-toggle</p>
          <p>The name itself ("NosFabrica" / your display name) becomes a button. Click it to flip POV. A small ⇄ icon fades in on hover so the affordance is discoverable but quiet at rest. Same visual weight as today.</p>
        </div>
      </div>
    </div>
  );
}
