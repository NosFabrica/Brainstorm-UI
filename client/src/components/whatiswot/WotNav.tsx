import { useState, useEffect } from 'react';
import type { NostrUser } from '@/services/nostr';
import { Wordmark } from '@/components/Wordmark';
import { AppHeader } from '@/components/AppHeader';
import { SignInButton } from '@/components/SignInButton';
import { NormalModeIcon, TechModeIcon } from '@/components/WotIcons';
import type { UserMode } from './data';

interface WotNavProps {
  user: NostrUser | null;
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  onLogout: () => void;
  calcDone: boolean;
  setLocation: (path: string) => void;
}

export function WotNav({ user, mode, setMode, onLogout, calcDone, setLocation }: WotNavProps) {
  // Render the toggle once per viewport: inline in the header on desktop (lg+),
  // or on a dedicated centered row on mobile. Avoids duplicate DOM/test IDs.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const modeToggle = (
    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 rounded-full p-1 border border-slate-200 dark:border-slate-800">
      <button
        onClick={() => setMode('normal')}
        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
          mode === 'normal'
            ? 'bg-indigo-600 text-white'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        data-testid="toggle-normal"
      >
        <NormalModeIcon className="w-3 h-3" />
        Why
      </button>
      <button
        onClick={() => setMode('power')}
        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
          mode === 'power'
            ? 'bg-indigo-600 text-white'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
        data-testid="toggle-power"
      >
        <TechModeIcon className="w-3 h-3" />
        How
      </button>
    </div>
  );

  return user ? (
    <>
      <AppHeader
        user={user}
        onLogout={onLogout}
        calcDone={calcDone}
        actions={isDesktop ? modeToggle : undefined}
      />
      {/* Mobile-only row: on desktop the toggle lives inline in the header */}
      {!isDesktop && (
        <div className="border-b border-slate-200 dark:border-slate-800/50 backdrop-blur-sm bg-white/70 dark:bg-slate-950/80">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex items-center justify-center">
              {modeToggle}
            </div>
          </div>
        </div>
      )}
    </>
  ) : (
    <nav className="sticky top-0 z-40 backdrop-blur-md" data-testid="nav-wot-signed-out">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
            onClick={() => setLocation('/')}
            aria-label="Brainstorm home"
            data-testid="text-logo"
          >
            <Wordmark height={26} className="shrink-0 dark:hidden" />
            <Wordmark height={26} variant="white" className="hidden shrink-0 dark:block" />
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Inline on desktop; mobile shows it on the row below */}
            {isDesktop && <div className="flex items-center">{modeToggle}</div>}
            <SignInButton variant="primary" label="Sign in" className="!rounded-full sm:px-5" data-testid="button-sign-in" />
          </div>
        </div>
        {/* Mobile-only row: on desktop the toggle lives inline above */}
        {!isDesktop && (
          <div className="mt-3 flex items-center justify-center">
            {modeToggle}
          </div>
        )}
      </div>
    </nav>
  );
}
