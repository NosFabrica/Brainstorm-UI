import { Loader2 } from "lucide-react";

/** Shown while a dialog's code arrives, so a tap or ⌘K isn't silent on a slow link. */
export function OverlaySpinner() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" data-testid="overlay-loading">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400 dark:text-slate-500" />
    </div>
  );
}
