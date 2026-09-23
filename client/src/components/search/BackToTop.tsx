import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Search pages the reader in as they scroll (2026-09-09), so a long read
 * ends far from the box and the tabs. Once they are two screens deep a
 * pill offers the way back — X, YouTube — and sits above the phone's tab
 * bar and the music bar through the bottom-chrome ledger (lib/bottomChrome).
 */
export function BackToTop({ screens = 2 }: { screens?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * screens);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [screens]);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-[calc(1.5rem+var(--bs-bottom-chrome,0px))] right-4 sm:right-6 z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-lg backdrop-blur transition-colors hover:border-brand-accent/40"
      aria-label="Back to top"
      data-testid="back-to-top"
    >
      <ArrowUp className="h-4 w-4" /> Top
    </button>
  );
}
