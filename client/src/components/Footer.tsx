import { useLocation } from 'wouter';
import { Wordmark } from '@/components/Wordmark';

// Structured, product-grade footer (Google-style tiers rather than one crowded
// line): the Brainstorm wordmark anchors the top-left with the partner marks
// balanced top-right; a hairline separates that brand row from a calm row of
// uniform muted links, with the version held to the far right. White on light,
// ink on dark.
//
// NOTE: Megistus currently uses the emblem + a text label (the only asset in the
// repo). When the full Megistus lockup lands in /public (black for light, white
// for dark), swap the <img> + drop the label — see the marked block below.
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
        {/* Tier 1 — brand anchor (left) + partners (right) */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between sm:gap-6">
          <button
            type="button"
            onClick={() => setLocation('/')}
            className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
            aria-label="Brainstorm home"
            data-testid="footer-brand"
          >
            <Wordmark height={22} className="shrink-0 dark:hidden" />
            <Wordmark height={22} variant="white" className="hidden shrink-0 dark:block" />
          </button>

          {/* Partners — both full lockups (black art; Megistus inverts to white in dark) */}
          <div className="flex items-center gap-5">
            <a
              href="https://nosfabrica.com/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-nosfabrica"
              aria-label="Nosfabrica"
              className="opacity-90 hover:opacity-100 transition-opacity"
            >
              <img src="/nosfabrica-logo.png" alt="Nosfabrica" className="h-[18px] w-auto rounded-sm" />
            </a>

            <a
              href="https://megistus.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-megistus"
              aria-label="Megistus"
              className="opacity-90 hover:opacity-100 transition-opacity"
            >
              <img src="/megistus-logo.png" alt="Megistus" className="h-6 w-auto dark:invert" />
            </a>
          </div>
        </div>

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
