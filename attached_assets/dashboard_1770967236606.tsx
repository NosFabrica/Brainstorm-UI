import { useLocation } from 'wouter';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Home, 
  Search, 
  Settings, 
  Download, 
  Users, 
  Award, 
  Network, 
  TrendingUp, 
  LogOut, 
  Keyboard, 
  Menu, 
  X, 
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Info,
  Zap,
  Code,
  Music,
  Palette,
  Bitcoin,
  Globe,
  UserPlus,
  CreditCard,
  User as UserIcon,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Search as SearchIcon,
  Sparkles,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { BrainLogo } from '@/components/BrainLogo';
import { useEffect, useState, useRef } from 'react';

const ONBOARDING_SLIDES = [
  {
    title: 'No Algorithm Overlords',
    subtitle: 'Your network, your rules',
    content: 'Traditional platforms use opaque algorithms to decide what you see. Brainstorm gives you algorithmic clarity.',
    detail: "Every score is explainable, traceable back through your network. You're in control.",
    tone: 'from-emerald-500/20 via-teal-500/10 to-transparent',
  },
  {
    title: 'The Extended Follows Network',
    subtitle: 'More than just friends',
    content: "Your network isn't just who you follow. It's who they follow, and who they follow, ad infinitum.",
    detail: "We calculate trust across N hops. You'll be amazed at how vast your true network really is when you look beyond the surface.",
    tone: 'from-indigo-500/20 via-violet-500/10 to-transparent',
  },
  {
    title: 'Not A Popularity Contest',
    subtitle: 'A different kind of score',
    content: "Finally, a metric that isn't about clout. A high score simply means your Grapevine verifies this person is real.",
    detail: 'Low score ≠ uncool. It just means “we haven’t had the pleasure of meeting yet.” Trust is earned, not farmed.',
    tone: 'from-fuchsia-500/20 via-purple-500/10 to-transparent',
  },
  {
    title: 'Safety in Numbers',
    subtitle: 'Crowdsourced immunity',
    content: "Accidentally followed a bot farm? Your network knows things you don't. We'll flag it before it spams you.",
    detail: "Get alerts if you follow someone highly reported or muted by your trusted peers. It's herd immunity for your feed.",
    tone: 'from-amber-500/20 via-orange-500/10 to-transparent',
  },
  {
    title: 'Computation In Progress',
    subtitle: 'Your scores are being prepared',
    content: 'We’re calculating your trust graph and generating explainable scores you can use across the Brainstorm experience.',
    detail: 'This usually takes a few minutes — you can keep browsing while we build your view of the network.',
    tone: 'from-cyan-500/20 via-sky-500/10 to-transparent',
  },
  {
    title: 'Trusted Assertions',
    subtitle: 'Technical deep dive',
    content: "Brainstorm uses cryptographic proofs to deliver trust scores. These 'assertions' can be verified but never forged.",
    detail: 'Each assertion is a kind 3038x event containing your personalized trust scores, signed by you.',
    tone: 'from-rose-500/20 via-pink-500/10 to-transparent',
  },
  {
    title: 'What This Unlocks',
    subtitle: 'The future',
    content: 'Spam filtering, content recommendations, reputation systems, marketplace trust — all powered by your personal web of trust.',
    detail: 'Developers can build on top of your trust scores, creating experiences tailored to your unique social graph.',
    tone: 'from-yellow-500/20 via-amber-500/10 to-transparent',
  },
  {
    title: "You're in control",
    subtitle: 'Last slide — explore anytime',
    content: "There’s no timer here. Click through at your own pace while your trust graph continues computing in the background.",
    detail: 'When scores are ready, the dashboard will reflect them — until then, explore and learn how the system works.',
    tone: 'from-fuchsia-500/20 via-indigo-500/10 to-transparent',
  },
];

const ONBOARDING_DURATION_MS = 270 * 1000;

import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { ComputingBackground } from '@/components/ComputingBackground';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import protocolDevImg from '@/assets/stock_images/protocol_dev.jpg';
import bitcoinImg from '@/assets/stock_images/bitcoin_network.jpg';
import digitalArtImg from '@/assets/stock_images/digital_art.jpg';
import musicSceneImg from '@/assets/stock_images/music_scene.jpg';

// Mock data for new features
const INTEREST_CLUSTERS = [
  { id: 'dev', label: 'Protocol Devs', icon: Code, count: 1240, color: 'bg-blue-500', unit: 'builders', image: protocolDevImg },
  { id: 'btc', label: 'Bitcoiners', icon: Bitcoin, count: 8500, color: 'bg-orange-500', unit: 'peers', image: bitcoinImg },
  { id: 'art', label: 'Digital Artists', icon: Palette, count: 3200, color: 'bg-pink-500', unit: 'creators', image: digitalArtImg },
  { id: 'music', label: 'Music Scene', icon: Music, count: 1800, color: 'bg-purple-500', unit: 'artists', image: musicSceneImg },
];

const RISKY_FOLLOWS = [
  { id: 1, name: 'Alex Morgan', handle: '@alexmorgan', reason: 'High Spam Reports', risk: 'high', avatar: '/avatars/risk-1.png' },
  { id: 2, name: 'Sarah Bennett', handle: '@sarahbennett', reason: 'Phishing Reports', risk: 'medium', avatar: '/avatars/risk-2.png' },
  { id: 3, name: 'Michael Reed', handle: '@michaelreed', reason: 'Identity Spoofing', risk: 'high', avatar: '/avatars/risk-3.png' },
];

// Suggested profiles by hop distance (mock data)
type GrowHop = 2 | 3 | 4;

const GROW_PROFILES_BY_HOP: Record<GrowHop, {
  name: string;
  handle: string;
  score: number;
  role: string;
  tags: string[];
  verified: boolean;
  avatar: string;
}[]> = {
  2: [
    { name: 'Protocol_Architect', handle: 'dev_lead', score: 98, role: 'Core Dev', tags: ['#bitcoin', '#nostr', '#rust'], verified: true, avatar: '/avatars/grow-dev.png' },
    { name: 'Art_Curator_DAO', handle: 'digital_art', score: 94, role: 'Curator', tags: ['#art', '#nfts', '#culture'], verified: true, avatar: '/avatars/grow-art.png' },
    { name: 'Privacy_Advocate', handle: 'cypherpunk', score: 91, role: 'High Signal', tags: ['#privacy', '#security', '#tech'], verified: false, avatar: '/avatars/grow-privacy.png' },
  ],
  3: [
    { name: 'Lightning_Router', handle: 'ln_infra', score: 89, role: 'Infra', tags: ['#lightning', '#payments', '#routing'], verified: true, avatar: '/avatars/grow-dev.png' },
    { name: 'Relay_Gardener', handle: 'relay_ops', score: 86, role: 'Relay Operator', tags: ['#relays', '#infra', '#uptime'], verified: false, avatar: '/avatars/grow-art.png' },
    { name: 'zapper_club', handle: 'social_zaps', score: 84, role: 'Community', tags: ['#zaps', '#social', '#givefirst'], verified: false, avatar: '/avatars/grow-privacy.png' },
  ],
  4: [
    { name: 'Global_Observer', handle: 'macro_signals', score: 81, role: 'Analyst', tags: ['#macro', '#metrics', '#visuals'], verified: false, avatar: '/avatars/grow-dev.png' },
    { name: 'Bridge_Builder', handle: 'cross_graph', score: 79, role: 'Connector', tags: ['#bridges', '#communities', '#intros'], verified: false, avatar: '/avatars/grow-art.png' },
    { name: 'Signal_Scout', handle: 'alpha_stream', score: 77, role: 'Explorer', tags: ['#alpha', '#discover', '#early'], verified: false, avatar: '/avatars/grow-privacy.png' },
  ],
};

import { Footer } from '@/components/Footer';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { currentUser, networkStats, topProfiles, trustDistribution, signOut } = useStore();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hopRange, setHopRange] = useState([2, 4]);
  const [extendedNetworkCount, setExtendedNetworkCount] = useState(networkStats?.extendedNetwork || 250000);
  const [selectedRisk, setSelectedRisk] = useState<typeof RISKY_FOLLOWS[0] | null>(null);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const riskTeaserTimerRef = useRef<number | null>(null);
  const [growHop, setGrowHop] = useState<GrowHop>(2);
  const [networkViewMode, setNetworkViewMode] = useState<'trust' | 'activity'>('trust');

  const [activeOnboardingIndex, setActiveOnboardingIndex] = useState(0);
  const [isOnboardingCollapsed, setIsOnboardingCollapsed] = useState(true);
  const [onboardingProgress, setOnboardingProgress] = useState(0);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState<number | null>(null);
  const [scoresCalculatedAt, setScoresCalculatedAt] = useState<string | null>(null);
  const [trustScore, setTrustScore] = useState<number | null>(null);

  const hasAnyFollows = (networkStats?.directFollows ?? 0) > 0;


  useEffect(() => {
    return () => {
      if (riskTeaserTimerRef.current) window.clearTimeout(riskTeaserTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const startTime = Date.now();

    // Mock queue placement (UI-only). In the real app, this should be sourced from the backend.
    // Show a believable position even for a solo user (position 1 of 1).
    const initialTotal = Math.random() < 0.35 ? 1 : Math.floor(18 + Math.random() * 70);
    const initialPosition = initialTotal === 1 ? 1 : Math.floor(2 + Math.random() * Math.min(18, initialTotal - 1));
    setQueueTotal(initialTotal);
    setQueuePosition(initialPosition);

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const nextProgress = Math.min((elapsed / ONBOARDING_DURATION_MS) * 100, 100);
      setOnboardingProgress(nextProgress);

      // Smoothly move the user forward in the queue as time passes.
      // We intentionally never show 0; position reaches 1 near completion.
      setQueuePosition((pos) => {
        if (!pos) return pos;
        if (nextProgress >= 98) return 1;
        if (nextProgress >= 85) return Math.min(pos, 2);
        if (nextProgress >= 60) return Math.min(pos, 4);
        if (nextProgress >= 35) return Math.min(pos, 7);
        return pos;
      });

      // Progress is purely visual (Relays/Graph/Scores). Slides are user-controlled.
      if (nextProgress < 100) requestAnimationFrame(tick);
    };

    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (onboardingProgress < 100) return;
    if (scoresCalculatedAt) return;

    const d = new Date();
    const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    setScoresCalculatedAt(`${date} · ${time}`);
    setTrustScore(92);
  }, [onboardingProgress, scoresCalculatedAt]);
  
  // Carousel animation logic
  const carouselX = useMotionValue(0);
  const isCarouselHoveredRef = useRef(false);

  useEffect(() => {
    let lastTime = performance.now();
    let currentX = 0;
    // 10 items * (192px width + 16px gap) = 2080px
    const halfWidth = 2080; 
    let animationId: number;

    const animate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      
      // 50px/sec normal, 2px/sec slow (almost stopped)
      const speed = isCarouselHoveredRef.current ? 2 : 50; 
      const moveBy = (speed * delta) / 1000;
      
      currentX -= moveBy;
      
      if (currentX <= -halfWidth) {
         currentX += halfWidth;
      }
      
      carouselX.set(currentX);
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []); // Run once on mount
  
  // Flashlight effect for Global Signal Discovery
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    const x = clientX - left;
    const y = clientY - top;
    mouseX.set(x);
    mouseY.set(y);

    // Used by CSS-based flashlight overlays
    (currentTarget as HTMLElement).style.setProperty('--flash-x', `${x}px`);
    (currentTarget as HTMLElement).style.setProperty('--flash-y', `${y}px`);
  }

  // Update mock extended network count based on hop range
  useEffect(() => {
    // exponential growth simulation for effect
    const base = 500;
    const count = Math.floor(base * Math.pow(8, hopRange[1]));
    setExtendedNetworkCount(count > 1000000 ? 1000000 : count);
  }, [hopRange]);

  // Add "Bad Actors" to distribution dynamically based on hops
  const enhancedPieData = [
    ...trustDistribution.map(d => {
      // Simulate trust dilution as hops increase
      // More hops = more noise/neutral signals, slightly fewer highly trusted relative to size
      let multiplier = 1;
      
      // Hops: 1 (tight circle) -> 6 (six degrees)
      // Range is usually 1-3 in UI defaults, up to 6 max
      const currentHops = hopRange[1];
      
      if (d.label === 'Highly Trusted') {
        // High trust scales slower than network size (dilution)
        // 1 hop: 100% baseline
        // 3 hops: ~70% baseline relative density
        multiplier = Math.max(0.2, 1 - ((currentHops - 1) * 0.15));
      } else if (d.label === 'Trusted') {
        // Trusted also dilutes but slower
        multiplier = Math.max(0.4, 1 - ((currentHops - 1) * 0.08));
      } else if (d.label === 'Neutral') {
        // Neutral grows rapidly with network expansion
        multiplier = 1 + ((currentHops - 1) * 0.4);
      } else if (d.label === 'Low Trust') {
        // Low trust grows as you go further out
        multiplier = 1 + ((currentHops - 1) * 0.6);
      }
      
      return {
        name: d.label,
        // Scale the base count by our multiplier, but ensure it looks proportional to the massive extended network
        // We use a log scale effect so numbers don't get unreadably huge or tiny in the chart
        value: Math.floor(d.count * multiplier),
        color: d.color
      };
    }),
    { 
      name: 'Flagged / Muted', 
      // Flagged content tends to grow significantly as you leave your trusted core
      value: Math.floor(1420 * (1 + ((hopRange[1] - 1) * 0.8))), 
      color: '#991b1b' 
    } 
  ];

  const totalNetworkProfiles = enhancedPieData.reduce((acc, curr) => acc + curr.value, 0);

  // Simple mock activity breakdown for the same network size
  const activityBreakdown = [
    {
      name: 'Very active (7 days)',
      value: Math.floor(extendedNetworkCount * 0.18),
      color: '#22c55e',
    },
    {
      name: 'Active (90 days)',
      value: Math.floor(extendedNetworkCount * 0.32),
      color: '#4ade80',
    },
    {
      name: 'Quiet (90+ days)',
      value: Math.floor(extendedNetworkCount * 0.30),
      color: '#e5e7eb',
    },
    {
      name: 'Dormant (1+ year)',
      value: Math.max(0, extendedNetworkCount - Math.floor(extendedNetworkCount * 0.18) - Math.floor(extendedNetworkCount * 0.32) - Math.floor(extendedNetworkCount * 0.30)),
      color: '#d1d5db',
    },
  ];

  const totalActivityProfiles = activityBreakdown.reduce((acc, curr) => acc + curr.value, 0);

  const currentPieData = networkViewMode === 'trust' ? enhancedPieData : activityBreakdown;
  const totalCurrentProfiles = networkViewMode === 'trust' ? totalNetworkProfiles : totalActivityProfiles;

  // Simple derived overall trust score from distribution
  const highlyTrusted = enhancedPieData.find((d) => d.name === 'Highly Trusted')?.value ?? 0;
  const trusted = enhancedPieData.find((d) => d.name === 'Trusted')?.value ?? 0;
  const neutral = enhancedPieData.find((d) => d.name === 'Neutral')?.value ?? 0;
  const lowTrust = enhancedPieData.find((d) => d.name === 'Low Trust')?.value ?? 0;
  const flagged = enhancedPieData.find((d) => d.name === 'Flagged / Muted')?.value ?? 0;

  const weightedNumerator =
    highlyTrusted * 1 +
    trusted * 0.8 +
    neutral * 0.55 +
    lowTrust * 0.25 +
    flagged * 0.05;

  const baseDenominator =
    highlyTrusted +
    trusted +
    neutral +
    lowTrust +
    flagged || 1;

  const overallTrustScore = Math.round((weightedNumerator / baseDenominator) * 100);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key.toLowerCase()) {
        case 'e':
          handleExport();
          break;
        case 'h':
          setLocation('/');
          break;
        case '?':
          setShowShortcuts(prev => !prev);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setLocation]);

  useEffect(() => {
    if (!currentUser || !networkStats) {
      setLocation('/sign-in');
    }
  }, [currentUser, networkStats, setLocation]);

  if (!currentUser || !networkStats) {
    return null;
  }

  const handleExport = () => {
    const data = {
      format: 'brainstorm-v1',
      observer: currentUser.npub,
      calculatedAt: new Date().toISOString(),
      stats: networkStats,
      topProfiles: topProfiles.slice(0, 10).map(p => ({
        npub: p.npub,
        name: p.displayName,
        score: p.score
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brainstorm-scores-${Date.now()}.json`;
    a.click();
  };

  const handleSignOut = () => {
    signOut();
    setLocation('/');
    return;
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden">
        <ComputingBackground />
        
        {/* Navigation */}
        <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="lg:hidden">
                  <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu" className="text-slate-400 hover:text-white hover:bg-white/10">
                    <Menu className="h-6 w-6" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <BrainLogo size={28} className="text-indigo-500" />
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" data-testid="text-logo" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Brainstorm
                  </h1>
                </div>
                <div className="hidden lg:flex gap-2">
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-white hover:bg-white/5" data-testid="button-dashboard">
                    <Home className="h-4 w-4" />
                    Dashboard
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-white hover:bg-white/5" onClick={() => setLocation('/search')} data-testid="button-search">
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5">
                      <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                        <AvatarImage src={currentUser.avatar} alt={currentUser.displayName} className="object-cover" />
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                          {currentUser.displayName?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden md:flex flex-col items-start mr-2">
                        <span className="text-sm font-bold text-white leading-none mb-0.5">{currentUser.displayName || 'Anon'}</span>
                        <span className="text-[10px] text-indigo-300 font-mono leading-none">{currentUser.npub.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-slate-900">{currentUser.displayName}</p>
                        <p className="text-xs leading-none text-slate-500">{currentUser.npub.slice(0, 16)}...</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem
                      className="cursor-pointer focus:bg-indigo-50 text-slate-700 focus:text-indigo-700"
                      onClick={() => setLocation('/settings')}
                      data-testid="dropdown-settings"
                    >
                      <Settings className="mr-2 h-4 w-4 text-indigo-500" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
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
                      className="w-full justify-start gap-3 h-12 text-[15px] font-semibold text-white bg-white/10 border border-white/10 rounded-2xl shadow-[0_12px_26px_-18px_rgba(124,134,255,0.35)]"
                      onClick={() => {
                        setMobileMenuOpen(false);
                      }}
                      data-testid="button-mobile-nav-dashboard"
                    >
                      <Home className="h-5 w-5 text-indigo-200" />
                      Dashboard
                    </Button>


                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-12 text-[15px] font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLocation('/search');
                      }}
                      data-testid="button-mobile-nav-search"
                    >
                      <Search className="h-5 w-5 text-slate-200/80" />
                      Search
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-12 text-[15px] font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLocation('/settings');
                      }}
                      data-testid="button-mobile-nav-settings"
                    >
                      <Settings className="h-5 w-5 text-slate-200/80" />
                      Settings
                    </Button>
                  </div>

                </div>

                <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
                  <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]">
                      {currentUser.npub.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate" data-testid="text-mobile-menu-user-label">
                        Current User
                      </p>
                      <p className="text-xs text-slate-300/70 font-mono truncate" data-testid="text-mobile-menu-user-npub">
                        {currentUser.npub}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full justify-center gap-2 text-red-200 hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleSignOut();
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

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full">
          
        {/* Header Section */}
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2" data-testid="section-dashboard-header-copy">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit" data-testid="pill-dashboard-kicker">
                <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" aria-hidden="true" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase" data-testid="text-dashboard-header-kicker">Brainstorm Dashboard</p>
              </div>
              <h1
                className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                data-testid="text-dashboard-header-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Welcome back, {currentUser?.displayName || 'Traveler'}
                </span>
              </h1>
              <div className="flex items-center gap-3">
                <p className="text-slate-600 font-medium" data-testid="text-dashboard-header-subtitle">
                  Your trust network is active and growing.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 self-end md:self-auto">
              <div
                className="hidden sm:flex items-center gap-3 rounded-2xl bg-white/80 backdrop-blur-2xl border border-slate-300/80 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)] px-3 py-2 min-w-[170px] justify-between transition-all duration-200"
                data-testid="card-overall-trust-score"
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-400">Trust signals</span>
                  {onboardingProgress < 100 ? (
                    <span className="text-[10px] text-slate-400" data-testid="text-overall-trust-score-sub">
                      Calculating from your graph
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500" data-testid="text-overall-trust-score-sub">
                      Last updated - {scoresCalculatedAt || 'just now'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Onboarding Education */}
          <div
            className="group rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950 to-indigo-950 border border-white/10 shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:shadow-[0_28px_70px_-20px_rgba(124,134,255,0.35)] overflow-hidden relative transition-shadow"
            onMouseMove={handleMouseMove}
            onMouseLeave={(e) => {
              // Keep the last cursor position so the light fades out where the user exits.
              // Only drop opacity.
              (e.currentTarget as HTMLElement).style.setProperty('--flash-o', '0');
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.setProperty('--flash-o', '1');
            }}
            data-testid="container-onboarding-flashlight"
            style={{
              // default state (centered and off until hover)
              ['--flash-x' as any]: '50%',
              ['--flash-y' as any]: '50%',
              ['--flash-o' as any]: 0,
              display: onboardingProgress < 100 ? 'block' : 'none',
            }}
          >
            {!hasAnyFollows && (
              <div
                className="relative z-20 mb-3 rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/12 via-white/5 to-white/0 p-4"
                data-testid="card-onboarding-blocked"
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div
                    className="h-10 w-10 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-200 shadow-[0_18px_40px_-24px_rgba(251,191,36,0.7)]"
                    data-testid="icon-onboarding-blocked"
                    aria-hidden="true"
                  >
                    <UserPlus className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[10px] font-bold tracking-[0.22em] uppercase text-amber-200/80"
                      data-testid="text-onboarding-blocked-kicker"
                    >
                      Action required
                    </p>
                    <p
                      className="mt-0.5 text-sm font-semibold text-white"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      data-testid="text-onboarding-blocked-title"
                    >
                      Nothing to calculate yet
                    </p>
                    <p className="mt-1 text-[12px] text-slate-200/80 leading-relaxed" data-testid="text-onboarding-blocked-body">
                      Follow at least <span className="text-white font-semibold">1 account</span> to generate a trust graph. Once you do, return here to start the calculation.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="row-onboarding-blocked-actions">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold"
                        onClick={() => setLocation('/search')}
                        data-testid="button-onboarding-go-search"
                      >
                        Find accounts to follow
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                        onClick={() => setIsOnboardingCollapsed(false)}
                        data-testid="button-onboarding-learn-why"
                      >
                        Learn why
                      </Button>
                      <span className="text-[10px] text-slate-300/60" data-testid="text-onboarding-blocked-note">
                        Prototype note: follows are simulated in this demo.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-500"
              style={{
                opacity: 'var(--flash-o, 0)' as any,
                background:
                  [
                    // toned-down core
                    'radial-gradient(520px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(124,134,255,0.26), rgba(124,134,255,0.08) 32%, rgba(2,6,23,0) 66%)',
                    // softer bloom
                    'radial-gradient(860px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(51,50,134,0.11), rgba(2,6,23,0) 70%)',
                  ].join(', '),
              }}
              data-testid="overlay-onboarding-flashlight"
            />

            {/* Computational "math" texture revealed by the flashlight */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-500"
              style={{
                opacity: 'var(--flash-o, 0)' as any,
                WebkitMaskImage:
                  'radial-gradient(380px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 65%)',
                maskImage:
                  'radial-gradient(380px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 65%)',
              }}
              aria-hidden="true"
              data-testid="overlay-onboarding-equations"
            >
              <div
                className="absolute inset-0 mix-blend-screen"
                style={{
                  opacity: 0.22,
                  background:
                    'linear-gradient(180deg, rgba(124,134,255,0.16), rgba(255,255,255,0.03) 55%, rgba(124,134,255,0.06))',
                }}
              />

              {/* Keep equations out of the readable content area (bottom carousel + top header). */}
              <div
                className="absolute inset-x-0 top-[88px] bottom-[280px]"
                style={{
                  opacity: 0.36,
                  transform: 'translateZ(0)',
                  fontFamily: "var(--font-mono)",
                  color: 'rgba(226,232,240,0.70)',
                  textShadow: '0 1px 0 rgba(0,0,0,0.22), 0 0 12px rgba(124,134,255,0.12)',
                }}
                data-testid="container-onboarding-equations-safe"
              >
                {[{
                  x: '18%',
                  y: '20%',
                  r: '-8deg',
                  a: 0.40,
                  lines: ['WOT(u) = Σᵥ w(u,v) · t(v)', 'w(u,v) = 1/(1+dist(u,v))', 'trust(u) ∈ [0,100]'],
                },
                {
                  x: '78%',
                  y: '28%',
                  r: '10deg',
                  a: 0.34,
                  lines: ['id = SHA256(serialized)', 'sig = Schnorr(sk, id)', 'event = {kind, pubkey, tags}'],
                },
                {
                  x: '22%',
                  y: '72%',
                  r: '7deg',
                  a: 0.32,
                  lines: ['G = (V,E) from follows', 'score = f(G, seeds, hops)', 'relays = {r₁…rₙ}'],
                },
                {
                  x: '76%',
                  y: '78%',
                  r: '-12deg',
                  a: 0.30,
                  lines: ['compute(graph) → scores', 'verify(sig) → authentic', 'Δt ≈ 4–5 min'],
                }].map((b, i) => {
                  const ox = `calc(${b.x} + (var(--flash-x, 50%) - 50%) * 0.05)`;
                  const oy = `calc(${b.y} + (var(--flash-y, 50%) - 50%) * 0.05)`;

                  return (
                    <div
                      key={i}
                      className="absolute text-[10px] leading-relaxed tracking-[0.12em] select-none"
                      style={{
                        left: ox as any,
                        top: oy as any,
                        transform: `translate(-50%, -50%) rotate(${b.r})`,
                        opacity: b.a,
                      }}
                      data-testid={`text-onboarding-equation-block-${i}`}
                    >
                      {b.lines.map((l, idx) => (
                        <div key={idx} className={idx === 0 ? 'font-medium' : idx === 1 ? 'opacity-75' : 'opacity-60'}>
                          {l}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px] opacity-25" />

            <div className="relative p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80"
                    data-testid="text-onboarding-kicker"
                  >
                    Brainstorm onboarding
                  </p>
                  <h2
                    className="text-xl sm:text-2xl font-bold text-white tracking-tight"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    data-testid="text-onboarding-title"
                  >
                    Clarity in a fragmented world
                  </h2>
                  <p className="text-sm text-slate-300/90 mt-1 max-w-3xl" data-testid="text-onboarding-subtitle">
                    Welcome. Your trust score is being calculated. It usually takes <span className="font-semibold text-white" data-testid="text-onboarding-duration">5–10 minutes</span> to calculate. The Queue badge shows how many people are ahead of you. In the meantime, browse the dashboard and see how Brainstorm turns your Nostr graph into explainable trust.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div
                    className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-slate-200/90"
                    data-testid="badge-queue-position"
                    aria-label={queuePosition && queueTotal ? `You are number ${queuePosition} of ${queueTotal} in line` : 'Queue position'}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" data-testid="dot-queue" />
                    <span className="font-semibold" data-testid="text-queue-label">Queue</span>
                    <span className="text-slate-300/70" data-testid="text-queue-sep">·</span>
                    <span className="font-mono" data-testid="text-queue-value">
                      {queuePosition && queueTotal ? `#${queuePosition} of ${queueTotal}` : '—'}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-slate-200" data-testid="badge-local-computation">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    In Progress
                  </span>
                </div>
              </div>

              <div className="mt-4" data-testid="section-onboarding-carousel">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsOnboardingCollapsed((v) => !v)}
                    className={`inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 transition-colors ${isOnboardingCollapsed ? 'animate-[softPulse_2.6s_ease-in-out_infinite] ring-1 ring-indigo-400/20 shadow-[0_0_0_4px_rgba(99,102,241,0.06)]' : ''}`}
                    data-testid="button-toggle-onboarding"
                    aria-expanded={!isOnboardingCollapsed}
                  >
                    {isOnboardingCollapsed ? 'Learn More' : 'Hide'}
                    <ChevronRight className={`h-4 w-4 transition-transform ${isOnboardingCollapsed ? '' : 'rotate-90'}`} />
                  </button>
                </div>


                <div className="mt-3" data-testid="row-onboarding-status">
                  {/* Progress indicator (clear “this is working” signal) */}
                  <div
                    className="mb-2.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                    data-testid="card-onboarding-progress"
                    aria-label="Trust score calculation progress"
                  >
                    <div className="flex items-center justify-between gap-3" data-testid="row-onboarding-progress-header">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-slate-300/80" data-testid="text-onboarding-progress-kicker">
                          Calculation
                        </p>
                        <p
                          className="text-[12px] font-semibold text-white truncate"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          data-testid="text-onboarding-progress-step"
                        >
                          {onboardingProgress >= 80
                            ? 'Publishing Trusted Assertion'
                            : onboardingProgress >= 40
                              ? 'Computing network trust'
                              : 'Fetching your graph'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0" data-testid="row-onboarding-progress-meta">
                        {onboardingProgress < 100 && (
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 border border-white/10"
                            data-testid="spinner-onboarding-progress"
                            aria-label="In progress"
                          >
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/25 border-t-white/80 animate-spin" />
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-200/80" data-testid="text-onboarding-progress-percent">
                          {Math.round(onboardingProgress)}%
                        </span>
                      </div>
                    </div>


                    <div className="mt-2 grid grid-cols-3 gap-2" data-testid="grid-onboarding-status">
                      <div
                        className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl border transition-all duration-500 ${onboardingProgress > 10 ? 'bg-indigo-500/10 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : onboardingProgress <= 10 ? 'bg-white/7 border-white/15' : 'bg-white/5 border-white/10 opacity-50'}`}
                        data-testid="status-onboarding-relays"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${onboardingProgress > 10
                              ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                              : onboardingProgress <= 10
                                ? 'bg-indigo-300 shadow-[0_0_10px_rgba(129,140,248,0.45)] animate-pulse'
                                : 'bg-slate-600'}`}
                            data-testid="dot-onboarding-relays"
                          />
                          <span className={`text-[11px] sm:text-[10px] uppercase tracking-wider font-semibold truncate ${onboardingProgress > 10 ? 'text-indigo-200' : onboardingProgress <= 10 ? 'text-slate-200' : 'text-slate-400'}`} data-testid="text-onboarding-relays">Setup</span>
                        </div>
                        <span
                          className={`hidden sm:inline text-[10px] font-bold tracking-[0.18em] uppercase ${onboardingProgress > 10 ? 'text-indigo-200/80' : onboardingProgress <= 10 ? 'text-indigo-200/80' : 'text-slate-400/70'}`}
                          data-testid="badge-onboarding-relays-state"
                        >
                          {onboardingProgress > 10 ? 'Done' : 'Working'}
                        </span>
                      </div>

                      <div
                        className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl border transition-all duration-500 ${onboardingProgress > 40 ? 'bg-violet-500/10 border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]' : onboardingProgress > 10 && onboardingProgress <= 40 ? 'bg-white/7 border-white/15' : 'bg-white/5 border-white/10 opacity-50'}`}
                        data-testid="status-onboarding-graph"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${onboardingProgress > 40
                              ? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]'
                              : onboardingProgress > 10 && onboardingProgress <= 40
                                ? 'bg-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.45)] animate-pulse'
                                : 'bg-slate-600'}`}
                            data-testid="dot-onboarding-graph"
                          />
                          <span className={`text-[11px] sm:text-[10px] uppercase tracking-wider font-semibold truncate ${onboardingProgress > 40 ? 'text-violet-200' : onboardingProgress > 10 && onboardingProgress <= 40 ? 'text-slate-200' : 'text-slate-400'}`} data-testid="text-onboarding-graph">Calculating</span>
                        </div>
                        <span
                          className={`hidden sm:inline text-[10px] font-bold tracking-[0.18em] uppercase ${onboardingProgress > 40 ? 'text-violet-200/80' : onboardingProgress > 10 && onboardingProgress <= 40 ? 'text-violet-200/80' : 'text-slate-400/70'}`}
                          data-testid="badge-onboarding-graph-state"
                        >
                          {onboardingProgress > 40 ? 'Done' : onboardingProgress > 10 ? 'Working' : 'Waiting'}
                        </span>
                      </div>

                      <div
                        className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl border transition-all duration-500 ${onboardingProgress > 80 ? 'bg-fuchsia-500/10 border-fuchsia-500/20 shadow-[0_0_15px_rgba(217,70,239,0.15)]' : onboardingProgress > 40 && onboardingProgress <= 80 ? 'bg-white/7 border-white/15' : 'bg-white/5 border-white/10 opacity-50'}`}
                        data-testid="status-onboarding-scores"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${onboardingProgress > 80
                              ? 'bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]'
                              : onboardingProgress > 40 && onboardingProgress <= 80
                                ? 'bg-fuchsia-300 shadow-[0_0_10px_rgba(232,121,249,0.45)] animate-pulse'
                                : 'bg-slate-600'}`}
                            data-testid="dot-onboarding-scores"
                          />
                          <span className={`text-[11px] sm:text-[10px] uppercase tracking-wider font-semibold truncate ${onboardingProgress > 80 ? 'text-fuchsia-200' : onboardingProgress > 40 && onboardingProgress <= 80 ? 'text-slate-200' : 'text-slate-400'}`} data-testid="text-onboarding-scores">Publishing</span>
                          <span
                            className={`hidden lg:inline text-[10px] font-semibold tracking-wide ${onboardingProgress > 80 ? 'text-fuchsia-200/70' : 'text-slate-400/60'}`}
                            data-testid="text-onboarding-scores-ta"
                          >
                            (Trusted Assertion)
                          </span>
                        </div>
                        <span
                          className={`hidden sm:inline text-[10px] font-bold tracking-[0.18em] uppercase ${onboardingProgress > 80 ? 'text-fuchsia-200/80' : onboardingProgress > 40 ? 'text-fuchsia-200/80' : 'text-slate-400/70'}`}
                          data-testid="badge-onboarding-scores-state"
                          title="Trusted Assertion"
                        >
                          {onboardingProgress > 80 ? 'Done' : onboardingProgress > 40 ? 'Working' : 'Waiting'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 sm:hidden text-center" data-testid="text-onboarding-status-footnote">
                    <span className="text-[10px] text-slate-400">
                      Final step publishes a <span className="text-slate-200 font-semibold">Trusted Assertion</span> event.
                    </span>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {!isOnboardingCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className="mt-4"
                      data-testid="panel-onboarding"
                    >
                      <div
                        className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden cursor-pointer select-none relative"
                        data-testid="card-onboarding-carousel"
                        role="button"
                        tabIndex={0}
                        aria-label="Next onboarding slide"
                        onClick={() => {
                          setActiveOnboardingIndex((i) => (i + 1) % ONBOARDING_SLIDES.length);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveOnboardingIndex((i) => (i + 1) % ONBOARDING_SLIDES.length);
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="absolute inset-0 z-10 rounded-2xl bg-transparent pointer-events-none"
                          aria-hidden="true"
                          tabIndex={-1}
                          data-testid="button-onboarding-card-overlay"
                          onClick={() => {
                            setActiveOnboardingIndex((i) => (i + 1) % ONBOARDING_SLIDES.length);
                          }}
                        />
                        <div className={`h-1.5 w-full bg-gradient-to-r ${ONBOARDING_SLIDES[activeOnboardingIndex].tone}`} />

                        <div className="p-4 sm:p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="min-w-0">
                              <p
                                className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-400"
                                data-testid="text-onboarding-active-subtitle"
                              >
                                {ONBOARDING_SLIDES[activeOnboardingIndex].subtitle}
                              </p>
                              <h3
                                className="text-base sm:text-lg font-semibold text-white mt-1"
                                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                                data-testid="text-onboarding-active-title"
                              >
                                {ONBOARDING_SLIDES[activeOnboardingIndex].title}
                              </h3>
                              <p className="text-sm text-slate-200/90 mt-2" data-testid="text-onboarding-active-content">
                                {ONBOARDING_SLIDES[activeOnboardingIndex].content}
                              </p>
                              <p className="text-xs text-slate-300/90 mt-2" data-testid="text-onboarding-active-detail">
                                {ONBOARDING_SLIDES[activeOnboardingIndex].detail}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-3" data-testid="text-onboarding-hint">
                                Tap to continue
                              </p>
                            </div>
                          </div>

                          <div
                            className="mt-4 flex flex-wrap items-center gap-2"
                            data-testid="row-onboarding-dots"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ONBOARDING_SLIDES.map((_, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setActiveOnboardingIndex(idx);
                                }}
                                className={`h-2 rounded-full transition-all ${idx === activeOnboardingIndex ? 'w-6 bg-white' : 'w-2 bg-white/25 hover:bg-white/40'}`}
                                data-testid={`button-onboarding-dot-${idx}`}
                                aria-label={`Go to slide ${idx + 1}`}
                              />
                            ))}
                          </div>

                          <div
                            className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] text-slate-200 backdrop-blur-md"
                            data-testid="badge-onboarding-step"
                            aria-label={`Slide ${activeOnboardingIndex + 1} of ${ONBOARDING_SLIDES.length}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" data-testid="dot-onboarding-step" />
                            <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" data-testid="text-onboarding-step">
                              Slide {activeOnboardingIndex + 1} of {ONBOARDING_SLIDES.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            
            {/* Trusted Followers Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative h-full flex flex-col p-4">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />
                
                <div className="flex flex-col h-full gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                        <Award className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        Trusted Followers
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-end justify-between">
                    <div>
                      <div
                        className="text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none"
                        data-testid="text-direct-follows-count"
                      >
                        {onboardingProgress < 100 ? '—' : networkStats.directFollows}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-1" data-testid="text-direct-follows-label">Mutual follows in your web</p>
                    </div>
                    
                    <div className="flex -space-x-2" data-testid="row-trusted-followers-avatars">
                      {onboardingProgress < 100 ? (
                        <>
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="relative inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 border border-slate-200 shadow-sm"
                              data-testid={`avatar-trusted-placeholder-${i}`}
                              aria-hidden="true"
                            >
                              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-200/70 to-white/20" />
                            </div>
                          ))}
                          <div
                            className="relative inline-flex items-center justify-center h-6 w-6 rounded-full ring-2 ring-white bg-slate-900 text-white text-[8px] font-bold shadow-sm"
                            data-testid="avatar-trusted-more-placeholder"
                            aria-label="More profiles hidden until computation completes"
                          >
                            +—
                          </div>
                        </>
                      ) : (
                        <>
                          {topProfiles.slice(0, 3).map((profile, i) => (
                            <UITooltip key={i}>
                              <TooltipTrigger asChild>
                                <div 
                                  className="relative inline-block h-6 w-6 rounded-full ring-2 ring-white hover:scale-110 hover:z-20 transition-all duration-300 ease-out cursor-pointer shadow-sm"
                                  data-testid={`avatar-trusted-profile-${i}`}
                                >
                                  <Avatar className="h-full w-full border-[0.5px] border-black/5 bg-white">
                                    <AvatarImage src={`/avatars/trusted-${i + 1}.png`} alt={profile.displayName} className="object-cover" />
                                    <AvatarFallback className="bg-indigo-100 text-[8px] font-bold text-indigo-700">
                                      {profile.displayName.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="bg-white/95 backdrop-blur-xl border-[#7c86ff]/20 text-slate-700 shadow-xl p-2 px-3">
                                <div className="flex flex-col gap-0.5">
                                  <p className="font-bold text-xs text-[#333286]">{profile.displayName}</p>
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-1 w-12 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${profile.score * 100}%` }} />
                                    </div>
                                    <p className="text-[9px] font-mono text-slate-500">{Math.round(profile.score * 100)}% Trust</p>
                                  </div>
                                </div>
                              </TooltipContent>
                            </UITooltip>
                          ))}
                          <div
                            className="relative inline-block h-6 w-6 rounded-full ring-2 ring-white hover:scale-110 hover:z-20 transition-all duration-300 ease-out cursor-pointer shadow-sm"
                            data-testid="avatar-trusted-more"
                          >
                            <Avatar className="h-full w-full">
                              <AvatarImage src="/avatars/more-network.png" alt="More" className="object-cover" />
                              <AvatarFallback className="bg-slate-900 text-white text-[8px]">
                                +{(networkStats.directFollows - 3)}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="inline-flex items-center gap-2 text-[10px] font-mono text-slate-500" data-testid="text-trusted-followers-coming-soon">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500/60" />
                      Coming soon
                    </div>

                    <Button
                      size="sm"
                      className="h-7 px-3 text-[10px] font-bold bg-slate-200 text-slate-500 shadow-sm rounded-lg cursor-not-allowed opacity-80"
                      disabled
                      data-testid="button-view-all-followers-disabled"
                      aria-disabled="true"
                    >
                      View All
                      <ChevronRight className="ml-1.5 h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Safety / Alerts Card */}
            <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
              <DialogContent
                className="sm:max-w-[620px] rounded-3xl border border-[#7c86ff]/20 bg-gradient-to-b from-white/92 via-white/88 to-indigo-50/60 backdrop-blur-xl shadow-[0_60px_140px_-70px_rgba(51,50,134,0.75)] overflow-hidden p-0"
                data-testid="dialog-network-alerts-preview"
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
                  <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/15 blur-[110px]" />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,134,255,0.14)_0%,rgba(255,255,255,0.00)_40%,rgba(51,50,134,0.12)_100%)]" />
                  <div className="absolute inset-0 opacity-[0.06] mix-blend-multiply" style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }} />
                </div>

                <div className="relative">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />

                  <div className="px-6 pt-6 pb-5">
                    <DialogHeader>
                      <div className="flex items-start justify-between gap-4 pr-10">
                        <div className="flex items-start gap-3">
                          <div
                            className="h-10 w-10 rounded-2xl bg-white/70 border border-[#7c86ff]/20 shadow-sm flex items-center justify-center text-[#333286]"
                            data-testid="icon-network-alerts-dialog"
                          >
                            <ShieldAlert className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <DialogTitle
                              className="text-xl font-bold text-slate-900 leading-none tracking-tight"
                              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                              data-testid="text-network-alerts-dialog-title"
                            >
                              Network Alerts
                            </DialogTitle>
                            <DialogDescription
                              className="text-[12px] text-slate-600 mt-1 leading-relaxed"
                              data-testid="text-network-alerts-dialog-subtitle"
                            >
                              A safety lens on your follows — highlights suspicious patterns, look‑alikes, and spam pressure in your extended graph.
                            </DialogDescription>
                          </div>
                        </div>

                      </div>
                    </DialogHeader>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="grid-network-alerts-dialog-signals">
                      {[{ label: 'Spoof detection', desc: 'Look‑alikes & impostors' }, { label: 'Spam pressure', desc: 'Mass‑follow patterns' }, { label: 'Trust drops', desc: 'Fast score collapse' }].map((s, idx) => (
                        <div
                          key={s.label}
                          className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md px-3 py-2.5 shadow-sm"
                          data-testid={`card-network-alerts-dialog-signal-${idx}`}
                        >
                          <div className="text-[11px] font-bold text-slate-900" data-testid={`text-network-alerts-dialog-signal-label-${idx}`}>{s.label}</div>
                          <div className="text-[10px] text-slate-600 mt-1" data-testid={`text-network-alerts-dialog-signal-desc-${idx}`}>{s.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-6 pb-6">
                    <div className="rounded-3xl border border-slate-200/70 bg-white/65 backdrop-blur-md shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200/60 bg-gradient-to-r from-white/75 to-indigo-50/45">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-bold text-slate-900" data-testid="text-network-alerts-dialog-example-title">Example alerts</div>
                          <div className="text-[10px] font-mono text-slate-500" data-testid="text-network-alerts-dialog-example-meta">Preview · non-interactive</div>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="absolute inset-0 backdrop-blur-[2px]" />
                          <div className="absolute inset-0 bg-white/10" />
                        </div>

                        <div className="p-4 space-y-2" data-testid="list-network-alerts-dialog-example">
                          {RISKY_FOLLOWS.map((risk) => (
                            <div
                              key={risk.id}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-red-200/60 bg-gradient-to-r from-white/70 to-red-50/35 px-3 py-2 opacity-85"
                              data-testid={`row-network-alerts-dialog-risk-${risk.id}`}
                              aria-disabled="true"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar className="h-8 w-8 border border-red-100 shadow-sm">
                                  <AvatarImage src={risk.avatar} alt={risk.name} className="object-cover" />
                                  <AvatarFallback className="bg-red-100 text-red-600 text-[10px] font-bold">
                                    {risk.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="text-[12px] font-bold text-slate-900 truncate" data-testid={`text-network-alerts-dialog-risk-name-${risk.id}`}>{risk.name}</div>
                                  <div className="text-[10px] font-mono text-slate-500 truncate" data-testid={`text-network-alerts-dialog-risk-handle-${risk.id}`}>{risk.handle}</div>
                                </div>
                              </div>
                              <div className="text-[10px] font-semibold text-red-700" data-testid={`text-network-alerts-dialog-risk-reason-${risk.id}`}>{risk.reason}</div>
                            </div>
                          ))}
                        </div>

                        <div className="absolute inset-x-0 top-3 flex items-center justify-center pointer-events-none">
                          <div
                            className="inline-flex items-center gap-2 rounded-full bg-[#333286] text-white px-4 py-2 text-[11px] font-bold tracking-[0.22em] uppercase shadow-lg shadow-[#333286]/20 border border-white/15 backdrop-blur-md"
                            data-testid="badge-network-alerts-dialog-overlay"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-[#7c86ff] shadow-[0_0_10px_rgba(124,134,255,0.7)]" />
                            Coming soon
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card
                className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative h-full flex flex-col p-4 cursor-pointer"
                onClick={() => {
                  setRiskDialogOpen(true);
                  if (riskTeaserTimerRef.current) {
                    window.clearTimeout(riskTeaserTimerRef.current);
                    riskTeaserTimerRef.current = null;
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setRiskDialogOpen(true);
                    if (riskTeaserTimerRef.current) {
                      window.clearTimeout(riskTeaserTimerRef.current);
                      riskTeaserTimerRef.current = null;
                    }
                  }
                }}
                data-testid="card-network-alerts"
                aria-label="Open Network Alerts preview"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />

                <div
                  className="absolute inset-0 z-10"
                  data-testid="overlay-network-alerts-coming-soon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRiskDialogOpen(true);
                    if (riskTeaserTimerRef.current) {
                      window.clearTimeout(riskTeaserTimerRef.current);
                      riskTeaserTimerRef.current = null;
                    }
                  }}
                  role="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{ pointerEvents: 'auto' }}
                >
                  <div className="absolute -inset-16 bg-[conic-gradient(from_210deg_at_50%_50%,rgba(124,134,255,0.0),rgba(124,134,255,0.10),rgba(51,50,134,0.10),rgba(124,134,255,0.0))] blur-2xl opacity-70" />
                  <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px]" />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.02)_45%,rgba(15,23,42,0.00)_60%)]" />
                </div>

                <div
                  className="absolute -right-12 top-6 z-30 rotate-[35deg] pointer-events-none"
                  data-testid="banner-network-alerts-coming-soon"
                >
                  <div className="relative">
                    <div className="absolute inset-0 rounded-md bg-black/10 blur-md" />
                    <div className="relative flex items-center gap-2 rounded-md text-white px-10 py-2 shadow-lg border border-white/10 bg-[#333286]">
                      <span className="text-[10px] font-bold tracking-[0.22em] uppercase" data-testid="text-network-alerts-coming-soon">Coming soon</span>
                      <span className="text-[10px] text-white/65" data-testid="text-network-alerts-coming-soon-sub">Network Alerts</span>
                    </div>
                  </div>
                </div>

                <div
                  className="absolute inset-x-4 bottom-4 z-30 flex items-center justify-between pointer-events-none"
                  data-testid="row-network-alerts-coming-soon"
                >
                  <div className="text-[10px] font-medium text-slate-700" data-testid="text-network-alerts-coming-soon-hint">
                    Preview
                  </div>
                  <div className="text-[10px] font-mono text-slate-500" data-testid="text-network-alerts-coming-soon-meta">
                    Not active yet
                  </div>
                </div>

                <div className="absolute top-0 right-0 p-3 z-20">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#7c86ff] animate-pulse" />
                </div>

                <div className="flex flex-col h-full gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      Network Alerts
                    </span>
                  </div>
                  
                  <p className="text-[10px] text-slate-500 leading-tight">
                    <strong className="text-slate-900">3 profiles</strong> flagged as potential risks.
                  </p>
                  
                  <div className="space-y-1.5 mt-1">
                    {RISKY_FOLLOWS.slice(0, 2).map((risk) => (
                      <div 
                        key={risk.id} 
                        className="flex items-center justify-between p-1.5 rounded bg-red-50/50 border border-red-500/30 transition-colors cursor-not-allowed opacity-70"
                        data-testid={`row-risky-follow-disabled-${risk.id}`}
                        aria-disabled="true"
                      >
                         <div className="flex items-center gap-2 min-w-0">
                           <Avatar className="h-5 w-5 border border-red-100 shadow-sm">
                             <AvatarImage src={risk.avatar} alt={risk.name} className="object-cover" />
                             <AvatarFallback className="bg-red-100 text-red-500 text-[8px] font-bold">
                               {risk.name.charAt(0)}
                             </AvatarFallback>
                           </Avatar>
                           <div className="min-w-0 flex flex-col">
                             <p className="text-[10px] font-bold text-slate-800 truncate max-w-[80px] leading-none">{risk.name}</p>
                             <p className="text-[8px] text-red-600/70 font-medium leading-none mt-0.5">{risk.reason}</p>
                           </div>
                         </div>
                         <div className="w-5 h-5 rounded-full bg-white border border-red-100 flex items-center justify-center text-red-400 opacity-50 group-hover/item:opacity-100 group-hover/item:text-red-600 group-hover/item:border-red-200 transition-all shadow-sm">
                           <Ban className="h-2.5 w-2.5" />
                         </div>
                      </div>
                    ))}
                  </div>



                </div>
              </Card>
            </motion.div>

            {/* Extended Network Card - with Hops Slider */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative h-full flex flex-col p-4">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />
                
                <div className="flex flex-col h-full gap-2">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                         <Network className="h-3.5 w-3.5" />
                       </div>
                       <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                         Extended Reach
                       </span>
                     </div>
                     <UITooltip>
                       <TooltipTrigger>
                         <Info className="h-3 w-3 text-indigo-400 hover:text-indigo-600 transition-colors" />
                       </TooltipTrigger>
                       <TooltipContent className="bg-white/95 backdrop-blur-xl border-[#7c86ff]/20 text-slate-700 shadow-xl p-3">
                         <div className="space-y-1 max-w-xs">
                           <p className="font-bold text-xs text-[#333286]">About Extended Reach</p>
                           <p className="text-[10px] leading-relaxed">
                             This metric represents your total discoverable network size. It counts unique identities connected to you through your trusted followers.
                           </p>
                           <p className="text-[10px] leading-relaxed border-t border-slate-100 pt-1 mt-1">
                             <span className="font-semibold text-indigo-600">Hops:</span> Increasing hops expands your view to friends of friends (2 hops) and further, exponentially growing your reach.
                           </p>
                         </div>
                       </TooltipContent>
                     </UITooltip>
                   </div>

                   <div>
                     <div
                       className="text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none mb-1"
                       data-testid="text-extended-network-count"
                     >
                       {onboardingProgress < 100 ? '—' : extendedNetworkCount.toLocaleString()}
                     </div>
                     <p className="text-[10px] text-slate-400" data-testid="text-extended-network-label">Unique profiles in range</p>
                   </div>
                   
                   <div className="mt-auto space-y-2 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                     <div className="flex justify-between text-[10px] font-medium text-slate-600">
                       <span>Reach Depth</span>
                       <span className="text-indigo-600 font-bold">{hopRange[0]}–{hopRange[1]} Hops</span>
                     </div>
                     <Slider 
                       value={hopRange} 
                       onValueChange={(v) => {
                         // Enforce a valid min/max range
                         const next = (v ?? [1, 5]).slice(0, 2) as number[];
                         const lo = Math.min(next[0] ?? 1, next[1] ?? 1);
                         const hi = Math.min(5, Math.max(next[0] ?? 1, next[1] ?? 1));
                         setHopRange([lo, hi]);
                       }} 
                       max={5} 
                       min={1} 
                       step={1}
                       className="cursor-pointer py-1"
                     />
                     <div className="flex justify-between text-[8px] text-slate-400 uppercase tracking-wider font-semibold">
                       <span>Direct</span>
                       <span>Global</span>
                     </div>
                   </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Main Visual: Network Distribution & Discovery */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            {/* Chart Section - Full Width */}
            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
               className="lg:col-span-3 space-y-6"
            >
               <Card className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative min-h-[300px]">
                 <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
                 
                 <CardHeader className="bg-gradient-to-b from-[#7c86ff]/15 to-white/60 border-b border-[#7c86ff]/10 py-3 px-5 transition-colors duration-500 group-hover:from-[#7c86ff]/25 group-hover:to-white/80">
                   <div className="flex flex-row items-center justify-between gap-4">
                     <div className="flex items-center gap-3">
                       <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                         <Users className="h-3.5 w-3.5" />
                       </div>
                       <div className="bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-2xl border border-slate-100 shadow-sm relative group/bubble">
                         <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#7c86ff]/5 to-[#333286]/5 opacity-0 group-hover:bubble:opacity-100 transition-opacity duration-500" />
                         <CardTitle className="text-xs font-bold text-slate-800 tracking-tight relative z-10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                           Follows Network Health
                         </CardTitle>
                         <CardDescription
                           className="text-slate-500 text-[9px] font-medium uppercase tracking-wide relative z-10"
                           data-testid="text-network-health-subtitle"
                         >
                           Your follows network · {onboardingProgress < 100 ? 'Computing…' : `${extendedNetworkCount.toLocaleString()} people`} within {hopRange[0]}–{hopRange[1]} hops
                         </CardDescription>
                       </div>
                     </div>
                     
                     <div className="px-2 py-0.5 rounded-full bg-[#7c86ff]/10 text-[9px] font-bold text-[#333286] border border-[#7c86ff]/20 uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                       <span className="text-[#333286]">WITHIN {hopRange[0]}–{hopRange[1]} HOPS</span>
                     </div>
                   </div>
                 </CardHeader>
                 <CardContent className="pt-4 pb-4">
                   <div className="flex flex-col md:flex-row items-center gap-6 px-4 sm:px-8">
                      <div className="h-48 w-full md:w-5/12">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={currentPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={90}
                              paddingAngle={3}
                              dataKey="value"
                              stroke="none"
                            >
                              {currentPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [onboardingProgress < 100 ? '—' : `${value.toLocaleString()} profiles`, '']}
                              contentStyle={{ 
                                borderRadius: '8px', 
                                border: '1px solid #e2e8f0',
                                backgroundColor: '#ffffff',
                                color: '#0f172a',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                fontSize: '11px'
                              }}
                              itemStyle={{ color: '#0f172a' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="w-full md:w-7/12 grid grid-cols-2 gap-x-6 gap-y-3">
                        <div className="col-span-2 mb-1">
                           <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Network Composition</h4>
                           <p className="text-[10px] text-slate-500">Breakdown by trust signal strength</p>
                        </div>
                        {currentPieData.map((dist, i) => (
                          <div key={i} className="group flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-default border border-transparent hover:border-slate-100">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm ring-2 ring-white shrink-0" style={{ backgroundColor: dist.color }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-1">
                                <p className="font-bold text-[10px] text-slate-900 truncate pr-2">{dist.name}</p>
                                <span
                                  className="text-[9px] font-mono text-slate-400 group-hover:text-indigo-600 transition-colors"
                                  data-testid={`text-network-composition-percent-${i}`}
                                >
                                  {onboardingProgress < 100 ? '—' : `${((dist.value / totalCurrentProfiles) * 100).toFixed(1)}%`}
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(dist.value / totalCurrentProfiles) * 100}%` }}
                                  transition={{ duration: 1, delay: 0.5 + (i * 0.1) }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: dist.color }} 
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>
                 </CardContent>
               </Card>
            </motion.div>
          </div>

          {/* Discover Your Tribe - Full Width Section */}
          {false && (
          <motion.div 
             initial={{ opacity: 0, y: 30 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.6 }}
             className="mb-8"
          >
             <Card 
               className="bg-gradient-to-br from-[#333286] via-[#1e1b4b] to-slate-950 text-white border-[#7c86ff]/20 shadow-[0_20px_60px_-15px_rgba(51,50,134,0.3)] overflow-hidden relative group"
               onMouseMove={handleMouseMove}
             >
               {/* Flashlight Reveal Layer - Math & Grid */}
               <motion.div
                  className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    maskImage: useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, black, transparent)`,
                    WebkitMaskImage: useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, black, transparent)`,
                  }}
               >
                  {/* Grid Pattern */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
                  
                  {/* Math Pattern */}
                  <div className="absolute inset-0 overflow-hidden opacity-10">
                    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                      <pattern id="math-pattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                         <text x="10" y="20" fontSize="14" fill="white" fontFamily="monospace">∑</text>
                         <text x="50" y="40" fontSize="14" fill="white" fontFamily="monospace">∫</text>
                         <text x="80" y="10" fontSize="14" fill="white" fontFamily="monospace">∂</text>
                         <text x="20" y="70" fontSize="14" fill="white" fontFamily="monospace">√</text>
                         <text x="60" y="80" fontSize="14" fill="white" fontFamily="monospace">∞</text>
                         <text x="30" y="50" fontSize="10" fill="white" fontFamily="monospace">f(x)</text>
                         <text x="70" y="60" fontSize="10" fill="white" fontFamily="monospace">≠</text>
                      </pattern>
                      <rect x="0" y="0" width="100%" height="100%" fill="url(#math-pattern)" />
                    </svg>
                  </div>
               </motion.div>

               {/* Animated background effects */}
               <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
               <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#7c86ff]/20 blur-[120px] rounded-full pointer-events-none" />
               <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
               <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#7c86ff]/50 to-transparent" />
               
               <div className="relative z-10 p-6 sm:p-8">
                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
                   <div>
                     <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-medium text-indigo-200 mb-3 backdrop-blur-md hover:bg-white/15 transition-colors cursor-default group/globe">
                        <div className="relative h-4 w-4 flex items-center justify-center">
                          <div className="absolute inset-0 bg-indigo-400/20 blur-[4px] rounded-full group-hover/globe:bg-indigo-400/40 transition-colors" />
                          <svg className="h-4 w-4 text-indigo-300 group-hover/globe:text-indigo-200 transition-colors animate-[spin_10s_linear_infinite]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" className="opacity-50" />
                            <path d="M2 12h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="1.5" className="opacity-80" />
                            <path d="M12 2v20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
                          </svg>
                        </div>
                        <span className="group-hover/globe:text-indigo-100 transition-colors">Global Signal Discovery</span>
                     </div>
                     <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                       Discover Your Tribe
                     </h2>
                     <p className="text-indigo-200/70 mt-2 max-w-xl text-sm sm:text-base font-light">
                       Identify and connect with high-signal clusters in the global trust graph matching your interests.
                     </p>
                   </div>
                   
                   <Button className="bg-white text-[#333286] hover:bg-indigo-50 font-bold shadow-lg shadow-black/20 border-none">
                     Explore Global Graph
                     <ChevronRight className="ml-2 h-4 w-4" />
                   </Button>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                   {INTEREST_CLUSTERS.map((cluster, i) => (
                     <motion.div 
                       key={cluster.id}
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ delay: 0.7 + (i * 0.1) }}
                       whileHover={{ y: -5, scale: 1.02 }}
                       className="group relative bg-slate-900 border border-white/50 rounded-2xl overflow-hidden hover:border-white transition-all duration-300 cursor-pointer h-40"
                     >
                       {/* Background Image */}
                       <div className="absolute inset-0">
                         <img 
                           src={cluster.image} 
                           alt={cluster.label} 
                           className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
                         />
                         <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent opacity-90 group-hover:opacity-70 transition-opacity duration-500" />
                       </div>

                       <div className="absolute inset-0 bg-gradient-to-br from-[#7c86ff]/0 to-[#7c86ff]/0 group-hover:from-[#7c86ff]/20 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
                       
                       <div className="relative z-10 flex flex-col h-full p-5">
                         <div className="flex justify-between items-start mb-4">
                           <div className={`p-2 rounded-lg backdrop-blur-md bg-white/10 text-white shadow-sm border border-white/20 group-hover:scale-110 transition-transform duration-300`}>
                             <cluster.icon className="h-4 w-4" />
                           </div>
                           <div className="px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-indigo-200 group-hover:bg-[#7c86ff]/80 group-hover:text-white transition-colors">
                             #{i + 1}
                           </div>
                         </div>
                         
                         <div className="mt-auto">
                           <h4 className="font-bold text-lg text-white mb-1 group-hover:text-white transition-colors drop-shadow-sm">{cluster.label}</h4>
                           <div className="flex items-center gap-2 text-xs text-indigo-200/90 font-mono font-medium">
                             <Users className="h-3 w-3" />
                             <span>{cluster.count.toLocaleString()} {cluster.unit}</span>
                           </div>
                         </div>
                       </div>
                     </motion.div>
                   ))}
                 </div>
                 
                 <div className="mt-6 flex items-center justify-center gap-2 text-xs text-indigo-300/40">
                    <div className="h-px w-12 bg-indigo-500/20" />
                    <span>Algorithm Control: Decentralized</span>
                    <div className="h-px w-12 bg-indigo-500/20" />
                 </div>
               </div>
             </Card>
          </motion.div>
          )}

          {/* New Signal Expansion Section */}
          {false && (
          <motion.div 
             initial={{ opacity: 0, y: 30 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.8 }}
             className="mb-8"
          >
             <div className="relative mb-8 text-center">
               <div className="flex items-center justify-center mb-2">
                 <h2 className="text-2xl sm:text-3xl font-bold flex items-center justify-center gap-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                   <div className="p-2 rounded-full bg-indigo-100/50 text-indigo-600 ring-1 ring-indigo-200/50 shadow-sm">
                     <BrainLogo size={24} className="text-indigo-600" />
                   </div>
                   <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                     Grow Your Network
                   </span>
                 </h2>
               </div>
               <p 
                 className="text-slate-500 max-w-lg mx-auto mb-3 text-base"
                 style={{ fontFamily: "'Space Grotesk', sans-serif" }}
               >
                 Trending high-signal profiles and curators relevant to your graph
               </p>

               <div className="flex flex-col items-center gap-2 mb-4">
                 <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-semibold" data-testid="text-grow-hop-label">
                   Suggested from your {growHop}-hop network
                 </p>
                 <div className="inline-flex items-center gap-1 rounded-full bg-white/60 border border-indigo-100 px-1.5 py-1 shadow-sm">
                   {[2, 3, 4].map((hop) => (
                     <button
                       key={hop}
                       type="button"
                       onClick={() => setGrowHop(hop as GrowHop)}
                       className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                         growHop === hop
                           ? 'bg-[#333286] text-white border-[#333286] shadow-sm'
                           : 'bg-transparent text-slate-600 border-transparent hover:bg-indigo-50 hover:text-[#333286]'
                       }`}
                       data-testid={`button-grow-hop-${hop}`}
                     >
                       {hop} hops
                     </button>
                   ))}
                 </div>
               </div>
             </div>

             <div className="flex justify-center mb-4">
               <Button 
                 variant="ghost" 
                 size="sm" 
                 className="h-8 px-4 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-full shadow-sm border border-indigo-100"
                 onClick={() => setLocation('/grow-network')}
                 data-testid="button-grow-view-all"
               >
                 View all suggested profiles
               </Button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2 sm:px-0">
               {GROW_PROFILES_BY_HOP[growHop].map((profile, i) => (
                 <Card key={`${growHop}-${i}`} className="bg-indigo-50/30 backdrop-blur-md border-[#7c86ff]/30 shadow-[0_0_20px_-5px_rgba(124,134,255,0.15)] hover:shadow-[0_0_25px_-5px_rgba(124,134,255,0.3)] hover:border-[#7c86ff]/60 hover:-translate-y-1 transition-all duration-300 group cursor-pointer overflow-hidden ring-1 ring-white/50" data-testid={`card-grow-profile-${growHop}-${i}`}>
                   <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                   
                   <CardContent className="p-5 relative z-10">
                     <div className="flex items-start justify-between mb-4">
                       <div className="flex items-center gap-3">
                         <div className="relative">
                           <Avatar className="h-12 w-12 border-2 border-white shadow-md ring-2 ring-indigo-100 group-hover:ring-indigo-200 transition-all">
                             <AvatarImage src={profile.avatar} alt={profile.name} className="object-cover" />
                             <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-slate-200 font-bold text-indigo-700">
                               {profile.name.charAt(0)}
                             </AvatarFallback>
                           </Avatar>
                           {profile.verified && (
                             <div className="absolute -bottom-1 -right-1 bg-indigo-500 text-white rounded-full p-[2px] shadow-sm border border-white">
                               <CheckCircle2 className="h-2.5 w-2.5" />
                             </div>
                           )}
                         </div>
                         <div>
                           <div className="flex items-center gap-1.5">
                             <h4 className="font-bold text-base text-slate-900 group-hover:text-indigo-700 transition-colors" data-testid={`text-grow-profile-name-${growHop}-${i}`}>{profile.name}</h4>
                           </div>
                           <p className="text-xs text-slate-500 font-mono" data-testid={`text-grow-profile-handle-${growHop}-${i}`}>@{profile.handle}</p>
                         </div>
                       </div>
                       <div className="flex flex-col items-end">
                         <Badge variant="secondary" className="bg-white/80 backdrop-blur-sm hover:bg-white text-indigo-700 border-indigo-100 shadow-sm font-bold" data-testid={`badge-grow-profile-score-${growHop}-${i}`}>
                           {profile.score}%
                         </Badge>
                       </div>
                     </div>
                     
                     <div className="flex flex-wrap gap-1.5 mb-5">
                       {profile.tags.map((tag, j) => (
                         <span key={j} className="px-2 py-1 rounded-md bg-white border border-indigo-50 text-slate-600 text-[10px] font-medium shadow-sm" data-testid={`tag-grow-profile-${growHop}-${i}-${j}`}>{tag}</span>
                       ))}
                     </div>
                     
                     <Button size="sm" className="w-full bg-white text-indigo-700 border border-indigo-200 hover:bg-[#333286] hover:text-white hover:border-[#333286] shadow-sm text-xs font-bold h-9 transition-all tracking-wide" data-testid={`button-grow-expand-${growHop}-${i}`}>
                       <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                       Expand Graph
                     </Button>
                   </CardContent>
                 </Card>
               ))}
             </div>
          </motion.div>
          )}

          {/* Educational Strip */}
          <div className="w-screen relative left-[calc(-50vw+50%)] py-12 mb-12 overflow-hidden group">
            <div className="absolute inset-0 bg-[#020617] border-y border-indigo-500/20">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#818cf810_1px,transparent_1px),linear-gradient(to_bottom,#818cf810_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
              <div className="absolute -left-[10%] -top-[50%] w-[50%] h-[200%] bg-indigo-600/10 blur-[120px] rotate-12 animate-pulse" style={{ animationDuration: '8s' }} />
              <div className="absolute -right-[10%] -bottom-[50%] w-[50%] h-[200%] bg-violet-600/10 blur-[120px] -rotate-12 animate-pulse" style={{ animationDuration: '10s' }} />
            </div>
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-12">
                
                {/* Custom SVG Illustration - Glowing */}
                <div className="flex-shrink-0 relative group-hover:scale-110 transition-transform duration-700 ease-out">
                  <div className="absolute -inset-8 bg-indigo-500/20 blur-2xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-700 animate-pulse" />
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] text-indigo-400">
                    <title>brainstorm</title>
                    <g clipPath="url(#clip0_brain)">
                      <path d="M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M10.25 10C10.8 10 11.25 9.55 11.25 9C11.25 8.45 10.8 8 10.25 8" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M17.1504 9.75C17.5646 9.75 17.9004 9.41421 17.9004 9C17.9004 8.58579 17.5646 8.25 17.1504 8.25C16.7362 8.25 16.4004 8.58579 16.4004 9C16.4004 9.41421 16.7362 9.75 17.1504 9.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M17.1504 15.75C17.5646 15.75 17.9004 15.4142 17.9004 15C17.9004 14.5858 17.5646 14.25 17.1504 14.25C16.7362 14.25 16.4004 14.5858 16.4004 15C16.4004 15.4142 16.7362 15.75 17.1504 15.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M19.75 12.75C20.1642 12.75 20.5 12.4142 20.5 12C20.5 11.5858 20.1642 11.25 19.75 11.25C19.3358 11.25 19 11.5858 19 12C19 12.4142 19.3358 12.75 19.75 12.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M6.80078 9.75C7.21499 9.75 7.55078 9.41421 7.55078 9C7.55078 8.58579 7.21499 8.25 6.80078 8.25C6.38657 8.25 6.05078 8.58579 6.05078 9C6.05078 9.41421 6.38657 9.75 6.80078 9.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M6.80078 15.75C7.21499 15.75 7.55078 15.4142 7.55078 15C7.55078 14.5858 7.21499 14.25 6.80078 14.25C6.38657 14.25 6.05078 14.5858 6.05078 15C6.05078 15.4142 6.38657 15.75 6.80078 15.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M4.19922 12.75C4.61343 12.75 4.94922 12.4142 4.94922 12C4.94922 11.5858 4.61343 11.25 4.19922 11.25C3.78501 11.25 3.44922 11.5858 3.44922 12C3.44922 12.4142 3.78501 12.75 4.19922 12.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M15.9004 5.94922C16.3146 5.94922 16.6504 5.61343 16.6504 5.19922C16.6504 4.78501 16.3146 4.44922 15.9004 4.44922C15.4862 4.44922 15.1504 4.78501 15.1504 5.19922C15.1504 5.61343 15.4862 5.94922 15.9004 5.94922Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M8.09961 5.94922C8.51382 5.94922 8.84961 5.61343 8.84961 5.19922C8.84961 4.78501 8.51382 4.44922 8.09961 4.44922C7.6854 4.44922 7.34961 4.78501 7.34961 5.19922C7.34961 5.61343 7.6854 5.94922 8.09961 5.94922Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M15.9004 19.75C16.3146 19.75 16.6504 19.4142 16.6504 19C16.6504 18.5858 16.3146 18.25 15.9004 18.25C15.4862 18.25 15.1504 18.5858 15.1504 19C15.1504 19.4142 15.4862 19.75 15.9004 19.75Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M8.84961 19C8.84961 19.41 8.50961 19.75 8.09961 19.75C7.68961 19.75 7.34961 19.41 7.34961 19" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z" stroke="currentColor" strokeMiterlimit="10" />
                      <path d="M14.75 15C14.75 14.45 14.3 14 13.75 14C13.2 14 12.75 14.45 12.75 15" stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11.9492 2.5V2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M17.4492 2.90039V2.90039" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M17.4492 21.25V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19.9492 16.5508V16.5508" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19.9492 7.05078V7.05078" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3.94922 16.5508V16.5508" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3.94922 7.05078V7.05078" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.44922 2.90039V2.90039" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.44922 21.25V21.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11.9492 21.5508V21.5508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M1.5 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22.4492 12.0508V12.0508" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                    <defs>
                      <clipPath id="clip0_brain">
                        <rect width="24" height="24" fill="white"/>
                      </clipPath>
                    </defs>
                  </svg>
                </div>

                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                    <h3 className="text-2xl font-bold text-white tracking-tight drop-shadow-md">
                      The Power of Transitive Trust
                    </h3>
                    <Badge variant="secondary" className="hidden sm:flex bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 backdrop-blur-md shadow-sm">
                      Graph Theory
                    </Badge>
                  </div>
                  <p className="text-base sm:text-lg text-indigo-200/80 leading-relaxed max-w-2xl font-light">
                    We don't maintain a blocklist. Instead, we compute a <span className="font-semibold text-white border-b border-indigo-400/30 pb-0.5">probabilistic reliability score</span> for every interaction based on your unique social graph. <span className="text-indigo-300 italic">Trust flows through your connections.</span>
                  </p>
                </div>

                <div className="flex-shrink-0">
                  <Button
                    className="bg-white text-indigo-950 hover:bg-indigo-50 border-none font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] h-12 px-8 rounded-full transition-all duration-300 group/btn transform hover:-translate-y-0.5"
                    onClick={() => setLocation('/what-is-wot')}
                    data-testid="button-learn-wot"
                  >
                    Learn about WOT?
                    <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform text-indigo-600" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Supported Clients Carousel (Sponsor Slides) */}
          <motion.div 
             initial={{ opacity: 0, y: 30 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.9 }}
             className="mb-8"
          >
            <Carousel
              opts={{ align: "start", loop: true }}
              className="relative"
              data-testid="carousel-supported-clients"
            >
              <CarouselContent className="-ml-4">
                {/* Amethyst */}
                <CarouselItem className="pl-4 basis-full" data-testid="slide-supported-client-amethyst">
                  <Card
                    className="relative overflow-hidden border-0 bg-gradient-to-r from-[#2a1b4e] to-[#1a1638] ring-1 ring-white/10 shadow-[0_18px_58px_-40px_rgba(0,0,0,0.55)] group cursor-pointer hover:shadow-[0_22px_70px_-42px_rgba(0,0,0,0.62)] transition-all duration-500 w-full rounded-3xl"
                    onClick={() => {
                      const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                        el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
                      }
                    }}
                    data-testid="button-supported-slide-next-from-amethyst"
                    aria-label="Next supported client"
                  >
                    {/* Background Hero Image with Overlay */}
                    <div className="absolute inset-0 z-0">
                      <img src="/assets/amethyst-hero.webp" alt="Amethyst App Interface" className="w-full h-full object-cover opacity-30 mix-blend-overlay group-hover:opacity-40 transition-opacity duration-700 group-hover:scale-105 transform" />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#1a1033] via-[#1a1033]/90 to-transparent" />
                    </div>

                    <div className="relative z-10 p-5 sm:p-10 flex flex-col md:flex-row items-center gap-6 sm:gap-8 min-h-[440px] sm:min-h-[420px] pb-10">
                      {/* Left Content */}
                      <div className="flex-1 space-y-6 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-400/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md" data-testid="badge-supported-clients">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                            <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                            <line x1="12" y1="18" x2="12.01" y2="18" />
                          </svg>
                          <span>Supported Clients</span>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-4 justify-center md:justify-start">
                            <img src="/assets/amethyst-logo.png" alt="Amethyst Logo" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-lg ring-1 ring-white/10" data-testid="img-supported-amethyst-logo" />
                            <div className="space-y-1">
                              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-supported-amethyst-title">
                                Amethyst
                              </h2>
                              <p className="text-sm font-medium text-purple-300/80 uppercase tracking-widest" data-testid="text-supported-amethyst-tagline">The Future of Social</p>
                            </div>
                          </div>
                          <p className="text-base sm:text-lg text-slate-300/90 font-light leading-relaxed max-w-xl mx-auto md:mx-0" data-testid="text-supported-amethyst-description">Experience true freedom with the premier Android client for Nostr. Direct, intermediary-free communication in a beautiful, feature-rich interface.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center md:justify-start" data-testid="row-supported-amethyst-cta">
                          <a
                            href="https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="link-supported-amethyst-android"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button className="w-full sm:w-auto bg-white text-[#2a1b4e] hover:bg-purple-50 font-bold h-11 px-6 rounded-2xl sm:rounded-xl shadow-lg shadow-purple-900/20 transition-all hover:scale-105 border-none" data-testid="button-supported-amethyst-android">
                              <Download className="mr-2 h-4 w-4" />
                              Download for Android
                            </Button>
                          </a>
                          <a
                            href="https://amethyst.social/#"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="link-supported-amethyst-learn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button className="w-full sm:w-auto bg-[#3b73b4] hover:bg-[#306096] text-white border-[#3b73b4]/20 font-bold h-11 px-6 rounded-2xl sm:rounded-xl shadow-lg shadow-[#3b73b4]/30 transition-all hover:scale-105 hover:shadow-[#3b73b4]/40" data-testid="button-supported-amethyst-learn">
                              Learn More
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                      
                      {/* Right Content - Visual decoration/Mockup */}
                      <div className="hidden md:block w-1/3 relative h-64" aria-hidden="true">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-purple-500/20 rounded-full animate-pulse pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-purple-400/10 rounded-full pointer-events-none" />
                      </div>
                    </div>
                  </Card>
                </CarouselItem>

                {/* Nostria */}
                <CarouselItem className="pl-4 basis-full" data-testid="slide-supported-client-nostria">
                  <Card
                    className="relative overflow-hidden border-0 bg-gradient-to-r from-[#f26b1d] via-[#f59f2e] to-[#f7b24a] ring-1 ring-white/15 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.55)] group cursor-pointer hover:shadow-[0_28px_90px_-46px_rgba(0,0,0,0.62)] transition-all duration-500 w-full rounded-3xl"
                    onClick={() => {
                      const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                        el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
                      }
                    }}
                    data-testid="button-supported-slide-next-from-nostria"
                    aria-label="Next supported client"
                  >
                    <div
                      className="absolute -right-16 top-[1.1rem] z-20 rotate-45 bg-[#333286] px-16 py-2 text-[11px] font-extrabold uppercase tracking-widest text-white shadow-lg shadow-black/20 ring-1 ring-white/15"
                      data-testid="ribbon-nostria-coming-soon"
                      aria-label="Coming soon"
                    >
                      Coming soon
                    </div>
                    <div className="absolute inset-0 z-0">
                      <img src="/assets/nostria-hero.png" alt="Nostria" className="w-full h-full object-cover opacity-35 mix-blend-overlay group-hover:opacity-45 transition-opacity duration-700 group-hover:scale-105 transform" />

                      {/* Subtle manifesto-style overlay texture */}
                      <img
                        src="/assets/nostria-manifesto-overlay.png"
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-[0.20] mix-blend-soft-light pointer-events-none"
                        aria-hidden="true"
                        data-testid="img-nostria-manifesto-overlay"
                      />

                      {/* Teaser UI screenshot (blended + masked) */}
                      <img
                        src="/assets/nostria-teaser.png"
                        alt=""
                        className="absolute right-[-24%] top-[-14%] w-[80%] h-auto opacity-[0.52] mix-blend-soft-light saturate-[0.92] contrast-[1.04] brightness-[1.06] rotate-[-2deg] blur-[0.35px] pointer-events-none"
                        style={{
                          WebkitMaskImage: "radial-gradient(84% 86% at 60% 42%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 46%, rgba(0,0,0,0) 82%)",
                          maskImage: "radial-gradient(84% 86% at 60% 42%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 46%, rgba(0,0,0,0) 82%)",
                        }}
                        aria-hidden="true"
                        data-testid="img-nostria-ui-teaser"
                      />

                      <div className="absolute inset-0 bg-gradient-to-r from-[#3a1606] via-[#3a1606]/85 to-transparent" />
                    </div>

                    <div className="relative z-10 p-5 sm:p-10 flex flex-col md:flex-row items-center gap-6 sm:gap-8 min-h-[440px] sm:min-h-[420px] pb-10">
                      <div className="flex-1 space-y-6 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-200/10 border border-orange-200/20 text-orange-100 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md" data-testid="badge-supported-clients-nostria">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                            <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                            <line x1="12" y1="18" x2="12.01" y2="18" />
                          </svg>
                          <span>Supported Clients</span>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-4 justify-center md:justify-start">
                            <img src="/assets/nostria-icon.png" alt="Nostria Logo" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-lg ring-1 ring-white/10 bg-white object-contain" data-testid="img-supported-nostria-logo" />
                            <div className="space-y-1">
                              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-supported-nostria-title">
                                Nostria
                              </h2>
                              <p className="text-sm font-medium text-orange-100/80 uppercase tracking-widest" data-testid="text-supported-nostria-tagline">Built for human connections</p>
                            </div>
                          </div>
                          <p className="text-base sm:text-lg text-orange-50/90 font-light leading-relaxed max-w-xl mx-auto md:mx-0" data-testid="text-supported-nostria-description">
                            Get started in seconds. No email. No phone. Just you. A clean, scalable Nostr client focused on ownership, privacy, and a calmer social experience.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center md:justify-start" data-testid="row-supported-nostria-cta">
                          <a
                            href="https://play.google.com/store/apps/details?id=app.nostria.twa"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="link-supported-nostria-android"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button className="w-full sm:w-auto bg-white text-[#3a1606] hover:bg-orange-50 font-bold h-11 px-6 rounded-2xl sm:rounded-xl shadow-lg shadow-orange-900/20 transition-all hover:scale-105 border-none" data-testid="button-supported-nostria-android">
                              <Download className="mr-2 h-4 w-4" />
                              Download for Android
                            </Button>
                          </a>
                          <a
                            href="https://www.nostria.app/"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="link-supported-nostria-learn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button className="w-full sm:w-auto bg-white/10 hover:bg-white/15 text-white border border-white/15 font-bold h-11 px-6 rounded-2xl sm:rounded-xl shadow-lg shadow-orange-900/10 transition-all hover:scale-105" data-testid="button-supported-nostria-learn">
                              Learn More
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>

                      <div className="hidden md:block w-1/3 relative h-64" aria-hidden="true">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orange-300/20 rounded-full blur-[90px] pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 border border-orange-200/25 rounded-full animate-pulse pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 border border-orange-100/10 rounded-full pointer-events-none" />
                      </div>
                    </div>
                  </Card>
                </CarouselItem>
              </CarouselContent>


              {/* Dot navigation */}
              <div
                className="absolute bottom-3 right-3 sm:top-auto sm:bottom-3 sm:right-3 flex items-center gap-2 rounded-full bg-black/20 border border-white/15 px-3 py-2 backdrop-blur-md shadow-lg"
                data-testid="nav-supported-carousel-dots"
              >
                {[0, 1].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="h-2.5 w-2.5 rounded-full bg-white/40 hover:bg-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label={idx === 0 ? "Go to Amethyst slide" : "Go to Nostria slide"}
                    data-testid={idx === 0 ? "dot-supported-amethyst" : "dot-supported-nostria"}
                    onClick={(e) => {
                      e.stopPropagation();
                      const root = (e.currentTarget as HTMLButtonElement).closest('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      // Embla API is not exposed here; use click-to-advance pattern for now.
                      // Dots remain as visual affordance + future hook point.
                      root?.dispatchEvent(new KeyboardEvent('keydown', { key: idx === 0 ? 'ArrowLeft' : 'ArrowRight' }));
                    }}
                  />
                ))}
              </div>
            </Carousel>
          </motion.div>

          {/* Nostr Apps Carousel */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mb-12 hidden"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5 sm:mb-6 px-1 sm:px-2">
              <div className="flex items-start gap-3 sm:gap-2 min-w-0">
                <span className="relative h-7 w-7 shrink-0 rounded-2xl bg-white/70 border border-slate-200 shadow-sm flex items-center justify-center mt-[2px]">
                  <img src="/assets/ostrich.gif" alt="Ostrich" className="h-5 w-5" data-testid="img-ecosystem-ostrich" />
                </span>

                <div className="min-w-0">
                  <h3
                    className="text-lg sm:text-lg font-bold tracking-tight min-w-0"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    data-testid="text-ecosystem-title"
                  >
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-0.5 truncate">
                      Explore the Ecosystem
                    </span>
                  </h3>
                  <p className="text-[12px] text-slate-500 leading-snug" data-testid="text-ecosystem-subtitle">
                    Find clients and tools that amplify your Nostr graph.
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden" data-testid="row-ecosystem-meta-mobile">
                    <a
                      href="https://nostrapps.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-slate-200 px-3 py-2 text-[11px] font-bold text-indigo-700 hover:text-indigo-800 hover:bg-white transition-colors shadow-sm"
                      data-testid="link-ecosystem-view-all"
                    >
                      View all apps
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <Badge
                      variant="secondary"
                      className="bg-[#333286]/5 text-[#333286] border-[#333286]/10 text-[10px]"
                      data-testid="badge-ecosystem-powering-mobile"
                    >
                      Powering the Network
                    </Badge>
                  </div>
                </div>

              </div>

              <div className="hidden sm:flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="bg-[#333286]/5 text-[#333286] border-[#333286]/10 text-[10px]"
                  data-testid="badge-ecosystem-powering"
                >
                  Powering the Network
                </Badge>
                <div className="h-4 w-px bg-slate-200/80" aria-hidden="true" />
                <a
                  href="https://nostrapps.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-white/70 border border-slate-200 px-3 py-2 text-[11px] font-bold text-indigo-700 hover:text-indigo-800 hover:bg-white transition-colors shadow-sm"
                  data-testid="link-ecosystem-view-all-desktop"
                >
                  View all apps
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-20 bg-gradient-to-r from-[#f8fafc] to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-10 sm:w-20 bg-gradient-to-l from-[#f8fafc] to-transparent z-10 pointer-events-none" />
              
              <div 
                className="overflow-hidden py-3 sm:py-4 -my-3 sm:-my-4"
                onMouseEnter={() => isCarouselHoveredRef.current = true}
                onMouseLeave={() => isCarouselHoveredRef.current = false}
              >
                <motion.div 
                  className="flex gap-4 w-max"
                  style={{ x: carouselX }}
                >
                  {[
                    { name: "Damus", url: "https://damus.io", logo: "https://cdn.satellite.earth/cb72c77cd77b6de306e30092eb66edf2271afb85a05852e19e94188d8b83c520.png", category: "iOS Client" },
                    { name: "Primal", url: "https://primal.net", logo: "https://blossom.primal.net/0444bf8f340786d7021050a216f0401e51656d8ec3c32c04e94c8c46a1cdb5ce.png", category: "Cross-platform" },
                    { name: "Iris", url: "https://iris.to", logo: "https://image.nostr.build/5457b339d6ed801fe1c50f2cd47c3d5e2a5d41524fbea31f9bd0ae70e3c067b3.png", category: "Web Client" },
                    { name: "Coracle", url: "https://coracle.social", logo: "https://coracle-media.us-southeast-1.linodeobjects.com/logomark-light.png", category: "Web Client" },
                    { name: "YakiHonne", url: "https://yakihonne.com", logo: "https://cdn.satellite.earth/4c63603f9e9539a230d0cdb3657f9d2185830209056b7c2b38f95bfd603cca79.svg", category: "Media" },
                    { name: "zap.stream", url: "https://zap.stream", logo: "https://cdn.satellite.earth/71dcbdc1413713d148c18d92e3b66ceaef78919cba4bfbab6086d42f9cc12a96.svg", category: "Streaming" },
                    { name: "noStrudel", url: "https://nostrudel.ninja", logo: "https://cdn.satellite.earth/c8d939904dbe80b2a36badace31914984b9459794550b1a557c43936f779af13.png", category: "Web Client" },
                    { name: "ZapStore", url: "https://zap.store", logo: "https://cdn.satellite.earth/0255d7bdd965e5e54f19e4c8eafbd060c30dbaf50329d21366de09bfa6b81fb6.png", category: "App Store" },
                    { name: "Tunestr", url: "https://tunestr.io", logo: "/assets/tunestr-logo.png", category: "Music" },
                    // Duplicate for seamless loop
                    { name: "Damus", url: "https://damus.io", logo: "https://cdn.satellite.earth/cb72c77cd77b6de306e30092eb66edf2271afb85a05852e19e94188d8b83c520.png", category: "iOS Client" },
                    { name: "Primal", url: "https://primal.net", logo: "https://blossom.primal.net/0444bf8f340786d7021050a216f0401e51656d8ec3c32c04e94c8c46a1cdb5ce.png", category: "Cross-platform" },
                    { name: "Iris", url: "https://iris.to", logo: "https://image.nostr.build/5457b339d6ed801fe1c50f2cd47c3d5e2a5d41524fbea31f9bd0ae70e3c067b3.png", category: "Web Client" },
                    { name: "Coracle", url: "https://coracle.social", logo: "https://coracle-media.us-southeast-1.linodeobjects.com/logomark-light.png", category: "Web Client" },
                    { name: "YakiHonne", url: "https://yakihonne.com", logo: "https://cdn.satellite.earth/4c63603f9e9539a230d0cdb3657f9d2185830209056b7c2b38f95bfd603cca79.svg", category: "Media" },
                    { name: "zap.stream", url: "https://zap.stream", logo: "https://cdn.satellite.earth/71dcbdc1413713d148c18d92e3b66ceaef78919cba4bfbab6086d42f9cc12a96.svg", category: "Streaming" },
                    { name: "noStrudel", url: "https://nostrudel.ninja", logo: "https://cdn.satellite.earth/c8d939904dbe80b2a36badace31914984b9459794550b1a557c43936f779af13.png", category: "Web Client" },
                    { name: "ZapStore", url: "https://zap.store", logo: "https://cdn.satellite.earth/0255d7bdd965e5e54f19e4c8eafbd060c30dbaf50329d21366de09bfa6b81fb6.png", category: "App Store" },
                    { name: "Tunestr", url: "https://tunestr.io", logo: "/assets/tunestr-logo.png", category: "Music" },
                    { name: "Fountain", url: "https://fountain.fm", logo: "/assets/fountain-logo.png", category: "Podcasts" },
                  ].map((app, i) => (
                    <a 
                      key={i} 
                      href={app.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group/card relative flex-shrink-0 w-44 sm:w-48 bg-white border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col items-center gap-3 text-center cursor-pointer overflow-hidden active:scale-[0.98]"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
                      
                      <div className="relative h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 p-2 shadow-sm group-hover/card:scale-110 transition-transform duration-300 bg-white flex items-center justify-center">
                        <img src={app.logo} alt={app.name} className="w-full h-full object-contain" />
                      </div>
                      
                      <div className="relative">
                        <h4 className="font-bold text-slate-900 text-sm group-hover/card:text-indigo-700 transition-colors">{app.name}</h4>
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{app.category}</span>
                      </div>
                      
                      <div className="absolute right-2 top-2 opacity-0 group-hover/card:opacity-100 transition-all duration-300 transform translate-x-2 group-hover/card:translate-x-0">
                        <ExternalLink className="h-3 w-3 text-indigo-400" />
                      </div>
                    </a>
                  ))}
                </motion.div>
              </div>
            </div>
          </motion.div>
          
        </div>


        {/* Shortcuts Modal */}
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-indigo-600" />
                Keyboard Shortcuts
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Export data</span>
                  <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono text-slate-600">E</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">View network</span>
                  <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono text-slate-600">N</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Go home</span>
                  <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono text-slate-600">H</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Toggle shortcuts</span>
                  <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono text-slate-600">?</kbd>
                </div>
              </div>
              <Button
                className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => setShowShortcuts(false)}
              >
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}
        <Footer />
      </div>
    </TooltipProvider>
  );
}