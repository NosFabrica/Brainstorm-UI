import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { BrainLogo } from '@/components/BrainLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Footer } from '@/components/Footer';
import { Home, Search, Menu, LogOut, Settings as SettingsIcon, X, Network, Download } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function IconArrowLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 18l-6-6 6-6" />
      <path d="M21 12H10" />
    </svg>
  );
}

function IconInfo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v7" />
      <path d="M12 7h.01" />
    </svg>
  );
}

function IconShield(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9.2 12.2l1.9 1.9 3.9-3.9" />
    </svg>
  );
}

function IconSliders(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 14h4" />
      <path d="M10 12h4" />
      <path d="M18 16h4" />
    </svg>
  );
}

function IconSpark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2l1.1 4.1L17 7.2l-3.9 1.1L12 12l-1.1-3.7L7 7.2l3.9-1.1L12 2z" />
      <path d="M19 11l.6 2.2L22 14l-2.4.8L19 17l-.6-2.2L16 14l2.4-.8L19 11z" />
      <path d="M5 13l.7 2.6L8 16.4l-2.3.8L5 20l-.7-2.8L2 16.4l2.3-.8L5 13z" />
    </svg>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

type PresetKey = 'permissive' | 'balanced' | 'restrictive';

const PRESETS: Record<
  PresetKey,
  {
    label: string;
    short: string;
    description: string;
    color: string;
    defaults: {
      hopMin: number;
      hopMax: number;
      flaggedPenalty: 'low' | 'medium' | 'high';
      allowNip05Boost: boolean;
      requireGraphSignal: boolean;
    };
    education: {
      howItFeels: string;
      whatChanges: string[];
    };
  }
> = {
  permissive: {
    label: 'Relax',
    short: 'More trusting by default',
    description:
      'Optimizes for discovery. You’ll see more profiles treated as “trusted” unless there are strong negative signals.',
    color: '#7c86ff',
    defaults: {
      hopMin: 1,
      hopMax: 5,
      flaggedPenalty: 'low',
      allowNip05Boost: true,
      requireGraphSignal: false,
    },
    education: {
      howItFeels:
        'You’ll be more likely to give new or distant accounts the benefit of the doubt—useful when exploring unfamiliar communities.',
      whatChanges: [
        'Distant hops contribute more to the final perspective.',
        'Negative signals are down-weighted unless repeated.',
        'Identity hints (like NIP-05) get a little extra influence.',
      ],
    },
  },
  balanced: {
    label: 'Default',
    short: 'Recommended baseline',
    description:
      'A neutral starting point. Balances discovery with caution and aligns with how most users interpret Web of Trust signals.',
    color: '#333286',
    defaults: {
      hopMin: 1,
      hopMax: 3,
      flaggedPenalty: 'medium',
      allowNip05Boost: true,
      requireGraphSignal: true,
    },
    education: {
      howItFeels:
        'You’ll generally agree with what your trusted neighborhood would conclude, without being overly optimistic or pessimistic.',
      whatChanges: [
        'Nearby hops have the most influence; distant hops fade out.',
        'Negative signals matter, but don’t dominate unless strong.',
        'Missing network evidence reduces confidence (not necessarily reputation).',
      ],
    },
  },
  restrictive: {
    label: 'Strict',
    short: 'Safety-first interpretation',
    description:
      'Optimizes for caution. You’ll need stronger network evidence before treating a profile as “trusted.”',
    color: '#111827',
    defaults: {
      hopMin: 1,
      hopMax: 2,
      flaggedPenalty: 'high',
      allowNip05Boost: false,
      requireGraphSignal: true,
    },
    education: {
      howItFeels:
        'You’ll be less likely to trust accounts outside your immediate graph—great for high-signal environments and avoiding edge-case risks.',
      whatChanges: [
        'Only close hops meaningfully influence your view.',
        'Negative signals are amplified to protect against scams/impersonation.',
        'Identity hints don’t override weak graph evidence.',
      ],
    },
  },
};

function EducationCallout({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)]"
      data-testid={testId}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-32 h-56 w-56 rounded-full bg-[#7c86ff]/10 blur-[52px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(51,50,134,0.06),_transparent_55%)]" />
      </div>

      <div className="relative p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-2xl bg-slate-950 border border-white/10 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.7)] flex items-center justify-center shrink-0">
            <IconInfo className="h-4 w-4 text-indigo-200" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3
                className="text-[13px] font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                data-testid={`${testId}-title`}
              >
                {title}
              </h3>
            </div>
            <div className="mt-1.5 text-[13px] text-slate-600 leading-relaxed" data-testid={`${testId}-body`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [location, setLocation] = useLocation();
  const { currentUser, signOut } = useStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [savedPreset, setSavedPreset] = useState<PresetKey>('balanced');
  const [draftPreset, setDraftPreset] = useState<PresetKey>('balanced');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activePreset = useMemo(() => PRESETS[draftPreset], [draftPreset]);
  const hasUnsavedChanges = draftPreset !== savedPreset;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Card className="bg-white border-slate-200 shadow-xl rounded-xl">
          <CardContent className="p-6">
            <p className="text-sm text-slate-700" data-testid="text-settings-no-user">
              Please sign in to view settings.
            </p>
            <Button className="mt-4" onClick={() => setLocation('/sign-in')} data-testid="button-settings-go-signin">
              Go to Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-52 h-[560px] w-[560px] rounded-full bg-[#7c86ff]/12 blur-[120px]" />
        <div className="absolute -bottom-56 -left-56 h-[620px] w-[620px] rounded-full bg-[#333286]/10 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
          style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
        />
      </div>
      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="lg:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(true)}
                  className="h-11 w-11 p-0 rounded-2xl text-slate-200/80 hover:text-white hover:bg-white/10"
                  aria-label="Open menu"
                  data-testid="button-open-mobile-menu"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </div>

              <button
                type="button"
                className="flex items-center gap-3 min-w-0 lg:hidden"
                onClick={() => setLocation('/dashboard')}
                data-testid="button-settings-mobile-brand"
              >
                <div className="h-9 w-9 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center shrink-0">
                  <BrainLogo size={20} className="text-indigo-200" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p
                    className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80"
                    data-testid="text-settings-mobile-nav-kicker"
                  >
                    Brainstorm
                  </p>
                  <p
                    className="text-sm font-bold text-white"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    data-testid="text-settings-mobile-nav-title"
                  >
                    Settings
                  </p>
                </div>
              </button>

              <button
                type="button"
                className="hidden lg:flex items-center gap-2"
                onClick={() => setLocation('/dashboard')}
                data-testid="button-desktop-brand"
              >
                <BrainLogo size={28} className="text-indigo-500" />
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-logo">
                  Brainstorm
                </span>
              </button>

              <div className="hidden lg:flex gap-2" data-testid="nav-settings-tabs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 hover:text-white hover:bg-white/5"
                  onClick={() => setLocation('/dashboard')}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 hover:text-white hover:bg-white/5"
                  onClick={() => setLocation('/search')}
                  data-testid="button-nav-search"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5"
                    data-testid="button-settings-profile-menu"
                    role="button"
                    tabIndex={0}
                  >
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-settings-avatar">
                      <AvatarImage src={currentUser?.avatar} alt={currentUser?.displayName || 'User'} className="object-cover" />
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {(currentUser?.displayName?.charAt(0) || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2" data-testid="text-settings-profile-meta">
                      <span className="text-sm font-bold text-white leading-none mb-0.5" data-testid="text-settings-profile-name">
                        {currentUser?.displayName || 'Anon'}
                      </span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none" data-testid="text-settings-profile-npub">
                        {currentUser?.npub ? `${currentUser.npub.slice(0, 8)}...` : ''}
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20" data-testid="menu-settings-profile">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900" data-testid="text-settings-menu-name">{currentUser?.displayName || 'Anon'}</p>
                      <p className="text-xs leading-none text-slate-500" data-testid="text-settings-menu-npub">{currentUser?.npub ? `${currentUser.npub.slice(0, 16)}...` : ''}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer focus:bg-indigo-50 text-slate-700 focus:text-indigo-700"
                    onClick={() => setLocation('/settings')}
                    data-testid="dropdown-settings"
                  >
                    <SettingsIcon className="mr-2 h-4 w-4 text-indigo-500" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={() => {
                      signOut();
                      setLocation('/');
                    }}
                    data-testid="dropdown-signout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="overlay-mobile-menu"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 210 }}
              className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-[0_40px_120px_-40px_rgba(51,50,134,0.55)] flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950"
              data-testid="panel-mobile-menu"
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
                <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/18 blur-[110px]" />
                <div
                  className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
                  style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20" />
              </div>

              <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
                    <BrainLogo size={22} className="text-indigo-200" />
                  </div>
                  <div className="leading-tight">
                    <p
                      className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80"
                      data-testid="text-mobile-menu-kicker"
                    >
                      Brainstorm
                    </p>
                    <h2
                      className="text-lg font-bold text-white tracking-tight"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      data-testid="text-mobile-menu-title"
                    >
                      Menu
                    </h2>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-200/80 hover:text-white hover:bg-white/10"
                  data-testid="button-close-mobile-menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="relative flex-1 overflow-y-auto py-4 px-3 space-y-6">
                <div className="space-y-2">
                  <p
                    className="px-3 text-[10px] font-semibold text-slate-300/70 uppercase tracking-[0.22em]"
                    data-testid="text-mobile-menu-section-nav"
                  >
                    Navigation
                  </p>

                  <Button
                    variant="ghost"
                    className={
                      "w-full justify-start gap-3 h-12 text-[15px] rounded-2xl transition-colors " +
                      (location === '/dashboard'
                        ? "font-semibold text-white bg-white/10 border border-white/10 shadow-[0_12px_26px_-18px_rgba(124,134,255,0.35)]"
                        : "font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10")
                    }
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLocation('/dashboard');
                    }}
                    data-testid="button-mobile-nav-dashboard"
                  >
                    <Home className={"h-5 w-5 " + (location === '/dashboard' ? 'text-indigo-200' : 'text-slate-200/80')} />
                    Dashboard
                  </Button>

                  <Button
                    variant="ghost"
                    className={
                      "w-full justify-start gap-3 h-12 text-[15px] rounded-2xl transition-colors " +
                      (location === '/search'
                        ? "font-semibold text-white bg-white/10 border border-white/10 shadow-[0_12px_26px_-18px_rgba(124,134,255,0.35)]"
                        : "font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10")
                    }
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLocation('/search');
                    }}
                    data-testid="button-mobile-nav-search"
                  >
                    <Search className={"h-5 w-5 " + (location === '/search' ? 'text-indigo-200' : 'text-slate-200/80')} />
                    Search
                  </Button>

                  <Button
                    variant="ghost"
                    className={
                      "w-full justify-start gap-3 h-12 text-[15px] rounded-2xl transition-colors " +
                      (location === '/settings'
                        ? "font-semibold text-white bg-white/10 border border-white/10 shadow-[0_12px_26px_-18px_rgba(124,134,255,0.35)]"
                        : "font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10")
                    }
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setLocation('/settings');
                    }}
                    data-testid="button-mobile-nav-settings"
                  >
                    <SettingsIcon className={"h-5 w-5 " + (location === '/settings' ? 'text-indigo-200' : 'text-slate-200/80')} />
                    Settings
                  </Button>
                </div>

              </div>

              <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
                <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                  <Avatar className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]" data-testid="img-mobile-menu-avatar">
                    <AvatarImage src={currentUser?.avatar} alt={currentUser?.displayName || 'User'} className="object-cover" />
                    <AvatarFallback className="rounded-2xl bg-white/5 text-white font-bold text-lg">
                      {(currentUser?.displayName?.slice(0, 1) || 'U').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate" data-testid="text-mobile-menu-user-label">
                      {currentUser?.displayName || 'Anon'}
                    </p>
                    <p className="text-xs text-slate-300/70 font-mono truncate" data-testid="text-mobile-menu-user-npub">
                      {currentUser?.npub || ''}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-center gap-2 text-red-200 hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut();
                    setLocation('/');
                  }}
                  data-testid="button-mobile-sign-out"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="space-y-6"
          data-testid="container-settings"
        >
          <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-settings-header">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit" data-testid="pill-settings-kicker">
                    <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" aria-hidden="true" />
                    <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase" data-testid="text-settings-kicker">
                      Brainstorm Settings
                    </p>
                  </div>
                  <h1
                    className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    data-testid="text-settings-title"
                  >
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                      Tune your trust perspective
                    </span>
                  </h1>
                  <div className="flex items-center gap-3">
                    <p className="text-slate-600 font-medium" data-testid="text-settings-subtitle">
                      These controls don’t change Nostr itself—only how Brainstorm weights trust signals when presenting context and risk.
                    </p>
                  </div>
                </div>

              </motion.div>


              <motion.div variants={itemVariants}>
                <Card
              className="bg-white/90 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative"
              data-testid="card-settings-presets"
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
              </div>

              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 rounded-[14px] bg-gradient-to-br from-[#7c86ff]/5 to-[#333286]/5 opacity-0 group-hover/preset:opacity-100 transition-opacity duration-500" />
              </div>

              <div className="relative p-4 sm:p-5 group/preset">
                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#7c86ff]/15 to-transparent pointer-events-none" aria-hidden="true" />

                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#333286]/60"
                      data-testid="text-settings-presets-kicker"
                    >
                      Preset
                    </p>

                    <div className="mt-1">
                      <h2
                        className="inline-flex items-center text-[15px] sm:text-base font-bold text-slate-900 tracking-tight border-b border-[#7c86ff]/35 pb-1"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        data-testid="text-settings-presets-title"
                      >
                        Trust perspective
                      </h2>
                    </div>

                    <div className="mt-2 space-y-2" data-testid="row-settings-presets-subtitle">
                      <p className="text-[13px] text-slate-700 font-medium" data-testid="text-settings-presets-subtitle">
                        Choose how Brainstorm interprets your Nostr social graph.
                      </p>

                      <div
                        className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 shadow-[0_12px_28px_-22px_rgba(51,50,134,0.25)]"
                        data-testid="callout-settings-presets-why"
                      >
                        <p className="text-[12px] text-slate-600 leading-relaxed" data-testid="text-settings-presets-subtitle-detail">
                          <span className="font-semibold text-slate-900">Why presets matter:</span> the same network can feel different depending on whether you prioritize discovery or caution.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2" data-testid="row-settings-preset-actions">
                    {hasUnsavedChanges || saveState === 'saved' ? (
                      <div className="flex items-center gap-2">
                        <div
                          className={
                            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
                            (hasUnsavedChanges
                              ? "bg-[#7c86ff]/10 border-[#7c86ff]/20 text-[#333286]"
                              : "bg-emerald-50 border-emerald-100 text-emerald-700")
                          }
                          data-testid="badge-settings-save-status"
                        >
                          <span
                            className={
                              "h-1 w-1 rounded-full " +
                              (hasUnsavedChanges ? "bg-[#333286]" : "bg-emerald-500")
                            }
                            aria-hidden="true"
                          />
                          <span data-testid="text-settings-save-status">
                            {hasUnsavedChanges ? 'Unsaved' : 'Saved'}
                          </span>
                        </div>

                        {hasUnsavedChanges ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 rounded-lg text-[11px] font-bold text-slate-600 hover:text-[#333286] hover:bg-[#333286]/5"
                              onClick={() => {
                                setDraftPreset(savedPreset);
                                setSaveState('idle');
                              }}
                              data-testid="button-settings-reset"
                            >
                              Reset
                            </Button>
                            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                              <Button
                                className="h-8 px-4 rounded-lg bg-[#333286] hover:bg-[#2b2a72] shadow-lg shadow-[#333286]/15"
                                disabled={saveState === 'saving'}
                                onClick={() => {
                                  setConfirmOpen(true);
                                }}
                                data-testid="button-settings-save"
                              >
                                {saveState === 'saving' ? 'Saving…' : 'Save'}
                              </Button>

                              <AlertDialogContent
                                className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-[#7c86ff]/25 bg-white/92 backdrop-blur-xl shadow-[0_44px_120px_-60px_rgba(15,23,42,0.55)] p-0 overflow-hidden"
                                data-testid="dialog-confirm-recalculate"
                              >
                                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                                  <div className="absolute -top-28 -right-28 h-[320px] w-[320px] rounded-full bg-[#7c86ff]/18 blur-[80px]" />
                                  <div className="absolute -bottom-28 -left-28 h-[340px] w-[340px] rounded-full bg-[#333286]/12 blur-[90px]" />
                                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                                </div>

                                <div className="relative p-4 sm:p-5">
                                  <AlertDialogHeader className="space-y-2">
                                    <div className="flex items-start gap-3">
                                      <div
                                        className="h-9 w-9 rounded-2xl bg-[#333286]/10 border border-[#333286]/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(51,50,134,0.22)] shrink-0"
                                        aria-hidden="true"
                                        data-testid="icon-confirm-recalculate"
                                      >
                                        <BrainLogo size={18} className="text-[#333286]" />
                                      </div>
                                      <div className="min-w-0">
                                        <AlertDialogTitle
                                          className="text-[15px] sm:text-base font-bold text-slate-900 tracking-tight"
                                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                                          data-testid="text-confirm-recalculate-title"
                                        >
                                          Recalculate GrapeRank?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription
                                          className="text-[12px] sm:text-[13px] text-slate-600 leading-relaxed"
                                          data-testid="text-confirm-recalculate-desc"
                                        >This will re-run your network calculation.</AlertDialogDescription>
                                      </div>
                                    </div>
                                  </AlertDialogHeader>

                                  <div
                                    className="mt-3 rounded-xl border border-[#7c86ff]/18 bg-white/70 px-3 py-2 shadow-[0_12px_28px_-22px_rgba(51,50,134,0.18)]"
                                    data-testid="card-confirm-recalculate-summary"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div
                                          className="text-[10px] font-bold tracking-[0.22em] uppercase text-slate-500"
                                          data-testid="text-confirm-recalculate-kicker"
                                        >
                                          Applying
                                        </div>
                                        <div
                                          className="mt-1 text-[13px] font-semibold text-slate-900"
                                          data-testid="text-confirm-recalculate-preset"
                                        >
                                          {activePreset.label}
                                        </div>
                                      </div>
                                      <div
                                        className="shrink-0 inline-flex items-center rounded-full bg-[#333286] text-white px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] uppercase"
                                        data-testid="badge-confirm-recalculate-impact"
                                      >
                                        Recalculate
                                      </div>
                                    </div>

                                    <p
                                      className="mt-2 text-[11px] text-slate-500 leading-relaxed"
                                      data-testid="text-confirm-recalculate-disclaimer"
                                    >By clicking "Apply preset," you will run and save new calculation scores.</p>
                                  </div>

                                  <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
                                    <AlertDialogCancel
                                      className="rounded-xl"
                                      data-testid="button-confirm-recalculate-cancel"
                                    >
                                      Keep current
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-xl bg-[#333286] hover:bg-[#2b2a72]"
                                      onClick={() => {
                                        setConfirmOpen(false);
                                        setSaveState('saving');
                                        window.setTimeout(() => {
                                          setSavedPreset(draftPreset);
                                          setSaveState('saved');
                                          window.setTimeout(() => setSaveState('idle'), 900);
                                        }, 450);
                                      }}
                                      data-testid="button-confirm-recalculate-continue"
                                    >
                                      Apply preset
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </div>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 space-y-3" data-testid="section-settings-preset-selector">
                  <div
                    className="mt-6 w-full grid grid-cols-3 h-auto p-1 bg-slate-100/50 rounded-lg border border-slate-200/50"
                    role="radiogroup"
                    aria-label="Trust perspective preset"
                    data-testid="segmented-settings-presets"
                  >
                    {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
                      const p = PRESETS[key];
                      const selected = draftPreset === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setDraftPreset(key);
                            setSaveState('idle');
                          }}
                          className={
                            "py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 rounded-md " +
                            (selected
                              ? "bg-[#333286] text-white shadow-sm"
                              : "text-slate-500 hover:bg-white")
                          }
                          role="radio"
                          aria-checked={selected}
                          data-testid={`toggle-preset-${key}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide">
                                {key === 'permissive' ? 'Relax' : key === 'balanced' ? 'Default' : 'Strict'}
                              </span>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              {selected ? (
                                <div
                                  className="h-6 w-6 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center"
                                  aria-hidden="true"
                                  data-testid={`icon-toggle-selected-${key}`}
                                >
                                  <BrainLogo size={14} className="text-white" />
                                </div>
                              ) : (
                                <div
                                  className="h-6 w-6 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm"
                                  aria-hidden="true"
                                  data-testid={`icon-toggle-unselected-${key}`}
                                >
                                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                                </div>
                              )}
                            </div>

                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-[#7c86ff]/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(124,134,255,0.10)] overflow-hidden relative" data-testid="card-settings-preset-details">
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
                      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#7c86ff]/15 to-transparent" />
                    </div>
                    <div className="p-3.5 sm:p-4 relative">
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/8" aria-hidden="true" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] opacity-70" aria-hidden="true" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold tracking-wider uppercase text-slate-500" data-testid="text-preset-details-kicker">
                              Current preset
                            </p>
                            <h3
                              className="mt-1 text-[15px] font-bold text-slate-900 tracking-tight"
                              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                              data-testid="text-preset-details-title"
                            >
                              {activePreset.label}
                            </h3>
                            <p className="mt-1 text-[13px] text-slate-600 leading-relaxed" data-testid="text-preset-details-desc">
                              {activePreset.description}
                            </p>
                          </div>

                        <div className="shrink-0 flex items-center gap-2" data-testid="row-preset-details-indicator">
                          <div
                            className="h-8 w-8 rounded-2xl bg-[#333286]/10 border border-[#333286]/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(51,50,134,0.22)]"
                            aria-hidden="true"
                            data-testid="icon-preset-details-selected"
                          >
                            <BrainLogo size={18} className="text-[#333286]" />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-[#7c86ff]/22 bg-white/70 p-3 shadow-[0_0_0_1px_rgba(124,134,255,0.06),0_14px_32px_-26px_rgba(51,50,134,0.25)] relative overflow-hidden" data-testid="panel-preset-details-what-it-does">
                        <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(700px_circle_at_25%_0%,rgba(124,134,255,0.18),transparent_55%)]" aria-hidden="true" />
                        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-[#7c86ff]/20 shadow-[0_0_0_1px_rgba(124,134,255,0.05),0_0_26px_rgba(124,134,255,0.16)]" aria-hidden="true" />
                        <div className="relative">
                          <p className="text-[10px] font-bold tracking-wider uppercase text-[#333286]" data-testid="text-preset-details-short">
                            {activePreset.short}
                          </p>
                          <p className="mt-1 text-[12px] text-slate-600 leading-relaxed" data-testid="text-preset-details-feels">
                            {activePreset.education.howItFeels}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-testid="row-preset-details-chips">
                        <span className="inline-flex items-center justify-center rounded-full bg-[#333286] border border-[#333286]/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(51,50,134,0.45)]" data-testid="chip-preset-details-graph">
                          Graph signal: {activePreset.defaults.requireGraphSignal ? 'required' : 'optional'}
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-[#333286] border border-[#333286]/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(51,50,134,0.45)]" data-testid="chip-preset-details-flags">
                          Flag penalty: {activePreset.defaults.flaggedPenalty}
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-[#333286] border border-[#333286]/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(51,50,134,0.45)]" data-testid="chip-preset-details-hops">
                          Hops: {activePreset.defaults.hopMin}–{activePreset.defaults.hopMax}
                        </span>
                        <span className="inline-flex items-center justify-center rounded-full bg-[#333286] border border-[#333286]/60 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_10px_18px_-16px_rgba(51,50,134,0.45)]" data-testid="chip-preset-details-nip05">
                          NIP-05: {activePreset.defaults.allowNip05Boost ? 'on' : 'off'}
                        </span>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>

                <div className="mt-3" data-testid="section-settings-perspective">
                  <div className="rounded-2xl border border-[#7c86ff]/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(124,134,255,0.10)] overflow-hidden relative p-3.5" data-testid="card-settings-perspective">
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
                      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#7c86ff]/15 to-transparent" />
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/8" aria-hidden="true" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] opacity-70" aria-hidden="true" />
                    <div className="flex items-start gap-3 relative">
                      <div className="h-9 w-9 rounded-2xl bg-[#333286] border border-[#333286]/40 flex items-center justify-center shrink-0 shadow-[0_18px_40px_-24px_rgba(51,50,134,0.55)]">
                        <img
                          src="/favicon.svg"
                          alt="Brainstorm"
                          className="h-4.5 w-4.5"
                          data-testid="img-settings-perspective-logo"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-wider uppercase text-slate-500" data-testid="text-settings-perspective-kicker">
                          What changes with this preset
                        </p>
                        <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700" data-testid="list-settings-perspective">
                          {activePreset.education.whatChanges.map((line, idx) => (
                            <li key={idx} className="flex items-start gap-2" data-testid={`item-settings-perspective-${idx}`}>
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#7c86ff] shadow-[0_0_10px_rgba(124,134,255,0.55)]" aria-hidden="true" />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </Card>
          </motion.div>


        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
