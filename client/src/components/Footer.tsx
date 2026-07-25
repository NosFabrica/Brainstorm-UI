import { useLocation } from 'wouter';
import { Info } from 'lucide-react';
import { BrainLogo } from '@/components/BrainLogo';

// Quiet, whitespace-driven footer (brand guidelines: "simplicity before
// decoration", "use whitespace before dividers", "let content be the
// interface"). Anchors on the Brainstorm mark, shows the partner logos as a
// muted attribution strip, and separates by space rather than divider pipes.
// Theme-aware (white on light, ink on dark).
export function Footer() {
  const [, setLocation] = useLocation();

  return (
    <footer
      className="relative z-20 w-screen mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/60"
      data-footer-dark="true"
      style={{ marginLeft: 'calc(50% - 50vw)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
    >
      <div className="w-full px-6 sm:px-8 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Brand anchor + partner logos */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setLocation('/')}
              className="flex items-center gap-2 self-start rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
              aria-label="Brainstorm home"
              data-testid="footer-brand"
            >
              <BrainLogo size={22} className="shrink-0" />
              <span className="text-sm font-semibold tracking-tight text-slate-700 dark:text-slate-200" style={{ fontFamily: 'var(--font-display)' }}>
                Brainstorm
              </span>
            </button>

            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setLocation('/nostr')}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-brand-link transition-colors"
                data-testid="link-built-on-nostr"
              >
                <img src="/nostr-ostrich.gif" alt="" aria-hidden="true" className="h-5 w-auto" />
                Built on Nostr
              </button>

              <a
                href="https://nosfabrica.com/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-nosfabrica"
                aria-label="Nosfabrica"
              >
                <img src="/nosfabrica-logo.png" alt="Nosfabrica" className="h-5 w-auto rounded" />
              </a>

              <a
                href="https://megistus.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-megistus"
                aria-label="Megistus"
              >
                <img src="/megistus-icon-white.png" alt="Megistus" className="invert dark:invert-0 h-6 w-auto" />
              </a>
            </div>
          </div>

          {/* Utility */}
          <div className="flex items-center gap-5 text-xs">
            <button
              type="button"
              onClick={() => setLocation('/what-is-wot')}
              className="inline-flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white transition-colors"
              data-testid="button-learn-more"
            >
              <Info className="h-3.5 w-3.5" />
              What is Web of Trust?
            </button>
            <span className="font-mono text-slate-400 dark:text-slate-600">v0.1.0-alpha</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
