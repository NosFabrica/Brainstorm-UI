import { useLocation } from 'wouter';
import { Wordmark } from '@/components/Wordmark';

// Structured, product-grade footer (Google-style tiers rather than one crowded
// line): the Brainstorm wordmark anchors the top, a hairline separates it from
// a calm row of uniform muted links, with the version held to the far right.
// White on light, ink on dark.
export function Footer() {
  const [, setLocation] = useLocation();

  const linkClass =
    'text-[13px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50';

  return (
    <footer
      className="relative z-20 w-screen mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/60"
      data-footer-dark="true"
      style={{ marginLeft: 'calc(50% - 50vw)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 sm:px-8 pt-7 flex flex-col gap-5">
        {/* Tier 1 — brand anchor */}
        <button
          type="button"
          onClick={() => setLocation('/')}
          className="flex items-center self-center sm:self-start rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
          aria-label="Brainstorm home"
          data-testid="footer-brand"
        >
          <Wordmark height={22} className="shrink-0 dark:hidden" />
          <Wordmark height={22} variant="white" className="hidden shrink-0 dark:block" />
        </button>

        {/* Hairline */}
        <div className="h-px w-full bg-slate-200 dark:bg-slate-800/70" />

        {/* Tier 2 — links + version */}
        <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between sm:gap-6">
          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            <button type="button" onClick={() => setLocation('/nostr')} className={linkClass} data-testid="link-built-on-nostr">
              Built on Nostr
            </button>
            <button type="button" onClick={() => setLocation('/what-is-wot')} className={linkClass} data-testid="button-learn-more">
              What is Web of Trust?
            </button>
          </nav>
          <span className="font-mono text-xs text-slate-400 dark:text-slate-600">v0.1.0-alpha</span>
        </div>
      </div>
    </footer>
  );
}
