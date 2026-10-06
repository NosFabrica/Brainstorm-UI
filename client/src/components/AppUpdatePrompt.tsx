import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { applyUpdate, useAppUpdate } from "@/lib/serviceWorker";

/**
 * "A new version of Brainstorm is ready" — shown only when this page runs an
 * older build than the one deployed (lib/serviceWorker), which mostly means an
 * app left open across a deploy. The reader picks the moment: a reload under
 * them would drop a half-typed message.
 */
export function AppUpdatePrompt() {
  const ready = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  if (!ready || dismissed) return null;
  return (
    <div className="pointer-events-none fixed bottom-[calc(1rem+var(--bs-bottom-chrome,0px))] left-1/2 z-[60] w-full max-w-md -translate-x-1/2 px-4">
      <div
        role="status"
        className="pointer-events-auto mx-auto flex w-fit items-center gap-2.5 rounded-full bg-slate-900 py-2 pl-3.5 pr-2 text-white shadow-lg shadow-slate-900/20"
        data-testid="app-update-prompt"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-brand-link" aria-hidden />
        <span className="text-sm font-medium">A new version is ready</span>
        <button
          type="button"
          onClick={applyUpdate}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-100"
          data-testid="button-app-update-reload"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Later"
          className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
