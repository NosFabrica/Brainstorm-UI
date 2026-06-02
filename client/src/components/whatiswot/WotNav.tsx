import type { NostrUser } from '@/services/nostr';
import { BrainLogo } from '@/components/BrainLogo';
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
  const modeToggle = (
    <div className="flex items-center gap-1 bg-slate-900/80 rounded-full p-1 border border-slate-800">
      <button
        onClick={() => setMode('normal')}
        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
          mode === 'normal'
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:text-white'
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
            : 'text-slate-400 hover:text-white'
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
      <AppHeader user={user} onLogout={onLogout} calcDone={calcDone} />
      <div className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-950/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-center sm:justify-end">
            {modeToggle}
          </div>
        </div>
      </div>
    </>
  ) : (
    <nav className="bg-slate-950/80 border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer min-w-0"
            onClick={() => setLocation('/')}
            data-testid="button-app-brand"
          >
            <BrainLogo size={28} className="text-indigo-500 shrink-0" />
            <span
              className="text-lg sm:text-xl font-bold tracking-tight text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              data-testid="text-logo"
            >
              Brainstorm
            </span>
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            {modeToggle}
            <SignInButton variant="ghost" data-testid="button-sign-in" />
          </div>
        </div>
      </div>
    </nav>
  );
}
