import { useLocation } from 'wouter';
import { Info } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';

// Single-line, subtle footer: the Brainstorm handwritten wordmark leads, then
// the "Built on Nostr" mark and the partner logos, with the utilities on the
// right. Everything sits on one row (wraps to two clusters only on very narrow
// screens). Theme-aware (white on light, ink on dark).
export function Footer() {
  const [, setLocation] = useLocation();

  return (
    <footer
      className="relative z-20 w-screen mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/60"
      data-footer-dark="true"
      style={{ marginLeft: 'calc(50% - 50vw)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
    >
      <div className="w-full px-6 sm:px-8 pt-4">
        <div className="flex items-center justify-between gap-x-6 gap-y-3 flex-wrap">
          {/* Brand + attribution — all inline */}
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setLocation('/')}
              className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
              aria-label="Brainstorm home"
              data-testid="footer-brand"
            >
              <Wordmark height={20} className="shrink-0 dark:hidden" />
              <Wordmark height={20} variant="white" className="hidden shrink-0 dark:block" />
            </button>

            <button
              type="button"
              onClick={() => setLocation('/nostr')}
              className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-brand-link transition-colors"
              data-testid="link-built-on-nostr"
            >
              <img src="/nostr-ostrich.gif" alt="" aria-hidden="true" className="h-[18px] w-auto" />
              Built on Nostr
            </button>
          </div>

          {/* Utility */}
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setLocation('/what-is-wot')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white transition-colors"
              data-testid="button-learn-more"
            >
              <Info className="h-3.5 w-3.5" />
              What is Web of Trust?
            </button>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-600">v0.1.0-alpha</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
