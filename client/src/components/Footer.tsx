import { useLocation } from 'wouter';
import { Info, ChevronRight } from 'lucide-react';

export function Footer() {
  const [, setLocation] = useLocation();

  return (
    <footer
      className="relative z-20 w-screen mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/60"
      data-footer-dark="true"
      style={{ marginLeft: 'calc(50% - 50vw)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
    >
      <div className="w-full px-6 pb-6 pt-6 sm:px-8">
        {/* Desktop */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 text-xs text-slate-500">
            <a
              href="https://nosfabrica.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-70 hover:opacity-100 transition-opacity"
              data-testid="link-nosfabrica"
            >
              <img src="/nosfabrica-logo.png" alt="Nosfabrica" className="h-6 w-auto rounded" />
            </a>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700/50" />

            <button
              onClick={() => setLocation('/nostr')}
              data-testid="link-built-on-nostr"
              className="flex items-center gap-2 text-[10px] text-slate-500 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <img src="/nostr-ostrich.gif" alt="Nostr" className="h-6 w-auto" />
              <span className="text-slate-600 dark:text-slate-400">Built on Nostr</span>
            </button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700/50" />

            <span className="text-[10px] text-slate-500 dark:text-slate-600 font-mono">v0.1.0-alpha</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
              <span>Clarity in a fragmented world</span>
            </div>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700/50" />

            <button
              onClick={() => setLocation('/what-is-wot')}
              data-testid="button-learn-more"
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white transition-colors"
            >
              <Info className="h-3.5 w-3.5" />
              <span>What is Web of Trust?</span>
            </button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700/50" />

            <a
              href="https://megistus.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-70 hover:opacity-100 transition-opacity"
              data-testid="link-megistus"
            >
              <img src="/megistus-icon-white.png" alt="Megistus" className="invert dark:invert-0 h-10 w-auto" />
            </a>
          </div>
        </div>

        {/* Mobile — clean stacked layout */}
        <div className="sm:hidden">
          <button
            onClick={() => setLocation('/what-is-wot')}
            data-testid="button-learn-more-mobile"
            className="w-full mb-6 py-3 px-4 bg-gradient-to-r from-indigo-500/10 via-brand-accent/10 to-brand-accent/10 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-3"
          >
            <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">What is Web of Trust?</span>
            <ChevronRight className="h-4 w-4 text-indigo-600/60 dark:text-indigo-400/60" />
          </button>

          <div className="flex items-center justify-center gap-5 mb-4">
            <a
              href="https://nosfabrica.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-70 hover:opacity-100 transition-opacity"
              data-testid="link-nosfabrica-mobile"
            >
              <img src="/nosfabrica-logo.png" alt="Nosfabrica" className="h-5 w-auto rounded" />
            </a>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-700/30" />

            <button
              onClick={() => setLocation('/nostr')}
              data-testid="link-built-on-nostr-mobile"
              className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity"
            >
              <img src="/nostr-ostrich.gif" alt="Nostr" className="h-5 w-auto" />
              <span className="text-[10px] text-slate-600 dark:text-slate-400">Nostr</span>
            </button>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-700/30" />

            <a
              href="https://megistus.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-70 hover:opacity-100 transition-opacity"
              data-testid="link-megistus-mobile"
            >
              <img src="/megistus-icon-white.png" alt="Megistus" className="invert dark:invert-0 h-8 w-auto" />
            </a>
          </div>

          <div className="text-center mt-1">
            <span className="text-[9px] text-slate-400 dark:text-slate-700 font-mono">v0.1.0-alpha</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
