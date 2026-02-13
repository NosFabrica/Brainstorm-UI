import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ChevronRight, ChevronDown, Users, Briefcase, Music, Compass, Heart } from 'lucide-react';
import {
  SpamFilterIcon, DiscoveryIcon, CommunityIcon, VerifyIcon,
  ShowEyeIcon, TellSpeechIcon, NormalModeIcon, TechModeIcon,
  SparkleStarIcon, CompareIcon, KeyControlIcon, NetworkWebIcon,
  TunerIcon, InsightBulbIcon, FollowHeartIcon, ZapBoltIcon,
  RepostIcon, QuoteBubbleIcon, StarRatingIcon, TagLabelIcon,
  ActionProofIcon, ExplicitContextIcon
} from '@/components/WotIcons';

type UserMode = 'normal' | 'power';

const floatingNodes = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 5 + Math.random() * 90,
  y: 5 + Math.random() * 90,
  size: Math.random() * 3 + 2,
  duration: Math.random() * 20 + 15,
  delay: Math.random() * 5,
}));

const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 11], [0, 6], [2, 8], [4, 10]
];

const calculations = [
  "trust_score: 0.94", "hops: 2 → 0.73", "attenuation: 0.85", "follows: 847",
  "wot_rank: #127", "sig: schnorr✓", "kind:3 verified", "npub1qx3f...ok",
];

const trustScenarios = [
  {
    id: 'social', label: 'Social', icon: 'users',
    personA: { name: 'Alice', role: 'Creator', initials: 'A', color: 'emerald' },
    personB: { name: 'Bob', role: 'Developer', initials: 'B', color: 'violet' },
    showActions: [
      { icon: 'heart', text: 'Alice follows Bob', color: 'emerald' },
      { icon: 'zap', text: 'Alice zaps 10k sats', color: 'amber' },
      { icon: 'repost', text: 'Alice reposts thread', color: 'sky' },
    ],
    tellActions: [
      { icon: 'quote', text: '"Bob is a Rust expert"', color: 'violet' },
      { icon: 'star', text: 'Rates 5/5 for NIP knowledge', color: 'violet' },
      { icon: 'tag', text: 'Tags as "reliable"', color: 'violet' },
    ],
    showInsight: 'Actions prove trust — hard to fake at scale',
    tellInsight: 'Explicit context — high precision, queryable',
    applications: [
      { title: 'Spam Filtering', description: "Your feed automatically hides spam because it trusts your network's judgment about who's legit." },
      { title: 'Account Verification', description: 'Know which accounts are real because your trusted connections have vouched for them.' },
    ],
  },
  {
    id: 'business', label: 'Business', icon: 'briefcase',
    personA: { name: 'Startup', role: 'Client', initials: 'S', color: 'emerald' },
    personB: { name: 'Agency', role: 'Vendor', initials: 'A', color: 'violet' },
    showActions: [
      { icon: 'heart', text: 'Paid 3 invoices on time', color: 'emerald' },
      { icon: 'zap', text: 'Renewed contract twice', color: 'amber' },
      { icon: 'repost', text: 'Referred 2 other clients', color: 'sky' },
    ],
    tellActions: [
      { icon: 'quote', text: '"Delivers ahead of schedule"', color: 'violet' },
      { icon: 'star', text: 'Rates 5/5 for communication', color: 'violet' },
      { icon: 'tag', text: 'Tags as "enterprise-ready"', color: 'violet' },
    ],
    showInsight: 'Transaction history speaks volumes',
    tellInsight: 'Testimonials add context to numbers',
    applications: [
      { title: 'Vendor Vetting', description: "Instantly see which agencies your trusted peers have successfully worked with." },
      { title: 'Risk Assessment', description: "Payment history and renewal patterns reveal reliability better than any pitch deck." },
    ],
  },
  {
    id: 'wellness', label: 'Wellness', icon: 'heart',
    personA: { name: 'Marcus', role: 'Patient', initials: 'M', color: 'emerald' },
    personB: { name: 'Dr. Chen', role: 'Naturopath', initials: 'DC', color: 'violet' },
    showActions: [
      { icon: 'heart', text: '18 months of consistent appointments', color: 'emerald' },
      { icon: 'zap', text: 'Paid out-of-pocket, kept coming back', color: 'amber' },
      { icon: 'repost', text: 'Referred 5 people from his network', color: 'sky' },
    ],
    tellActions: [
      { icon: 'quote', text: '"Finally found someone who listens"', color: 'violet' },
      { icon: 'star', text: 'Rates care: holistic & root-cause', color: 'violet' },
      { icon: 'tag', text: 'Tags as "real-healing-not-band-aids"', color: 'violet' },
    ],
    showInsight: 'Sustained commitment reveals true value',
    tellInsight: 'Personal testimony outweighs insurance checkboxes',
    applications: [
      { title: 'Beyond Insurance Limits', description: "When coverage says 'not medically necessary,' trusted networks reveal practitioners who actually heal." },
      { title: 'Finding True Care', description: "Discover practitioners your network trusts for results, not ones optimized for billing codes." },
    ],
  },
  {
    id: 'music', label: 'Music', icon: 'music',
    personA: { name: 'Fan', role: 'Listener', initials: 'F', color: 'emerald' },
    personB: { name: 'Artist', role: 'Musician', initials: 'AR', color: 'violet' },
    showActions: [
      { icon: 'heart', text: 'Streamed 847 tracks', color: 'emerald' },
      { icon: 'zap', text: 'Bought album + merch', color: 'amber' },
      { icon: 'repost', text: 'Shared to 3 playlists', color: 'sky' },
    ],
    tellActions: [
      { icon: 'quote', text: '"Perfect for late-night coding"', color: 'violet' },
      { icon: 'star', text: 'Rates mood: chill/focused', color: 'violet' },
      { icon: 'tag', text: 'Tags as "ambient-electronic"', color: 'violet' },
    ],
    showInsight: 'Listening behavior reveals true taste',
    tellInsight: 'Reviews help others discover gems',
    applications: [
      { title: 'Discovery Engine', description: "Find amazing artists your trusted network loves, even if you've never heard of them." },
      { title: 'Taste Matching', description: "See what people with similar listening patterns are obsessing over right now." },
    ],
  },
  {
    id: 'recommendations', label: 'Taste', icon: 'compass',
    personA: { name: 'Foodie', role: 'Reviewer', initials: 'FD', color: 'emerald' },
    personB: { name: 'Restaurant', role: 'Venue', initials: 'R', color: 'violet' },
    showActions: [
      { icon: 'heart', text: 'Visited 12 times this year', color: 'emerald' },
      { icon: 'zap', text: 'Average spend: $85', color: 'amber' },
      { icon: 'repost', text: 'Brought 8 different groups', color: 'sky' },
    ],
    tellActions: [
      { icon: 'quote', text: '"Best omakase in the city"', color: 'violet' },
      { icon: 'star', text: 'Rates ambiance: intimate', color: 'violet' },
      { icon: 'tag', text: 'Tags as "date-night-perfect"', color: 'violet' },
    ],
    showInsight: 'Repeat visits beat one-time reviews',
    tellInsight: 'Curated tags power discovery',
    applications: [
      { title: 'Personal Curation', description: "See different recommendations than your friend — because your taste networks are unique to you." },
      { title: 'Hidden Gems', description: "Surface spots loved by your trusted circle, not just places with the most generic reviews." },
    ],
  },
];

const trustNodeInfo = [
  { label: 'You', trust: '100%', size: 'w-12 h-12', color: 'from-indigo-500 to-violet-600', textColor: 'text-slate-200', explanation: "This is you — your trust anchor.", insight: "You're the center of your own trust universe." },
  { label: 'Friend', trust: 'High', size: 'w-10 h-10', color: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-300', explanation: "Direct connections — people you explicitly follow.", insight: "1 hop away." },
  { label: 'FoF', trust: 'Some', size: 'w-8 h-8', color: 'from-amber-500/70 to-amber-600/70', textColor: 'text-amber-300/80', explanation: "Friends of friends — 2 hops away. Trust decays with distance.", insight: "Trust inherited through your network, but attenuated." },
  { label: '?', trust: 'Unknown', size: 'w-6 h-6', color: 'from-slate-600 to-slate-700', textColor: 'text-slate-400', explanation: "Strangers — no connection path to you.", insight: "No path = no inherited trust." },
];

const examples = [
  { title: "Spam Filtering", icon: SpamFilterIcon, normal: "Your feed automatically hides spam because it trusts your friends' judgment.", power: "Trust propagation with configurable attenuation factors creates a personalized spam filter." },
  { title: "Content Discovery", icon: DiscoveryIcon, normal: "Find amazing content from people your trusted network loves.", power: "Multi-hop trust traversal surfaces high-quality content from extended network." },
  { title: "Community Curation", icon: CommunityIcon, normal: "See different content than your friend sees - because your networks are unique.", power: "Subjective trust scores create personalized information bubbles." },
  { title: "Verification", icon: VerifyIcon, normal: "Know which accounts are real because your trusted network has verified them.", power: "Distributed reputation system using cryptographic assertions." },
];

const faqs = [
  { question: "How is this different from followers or likes?", answer: { normal: "Followers and likes are flat - 1 million followers from bots counts the same as 100 from real people. Web of Trust is personalized: it weighs connections based on YOUR network.", power: "Traditional social metrics are global and gameable. WoT scores are ego-centric graph traversals." } },
  { question: "What's the difference between 'showing' and 'telling' trust?", answer: { normal: "'Showing' is when actions prove trust. 'Telling' is when Alice says 'Bob is a great developer.'", power: "Show = implicit trust signals. Tell = explicit attestations with granular context." } },
  { question: "Can I see exactly how my trust scores are calculated?", answer: { normal: "Yes! Complete transparency is a core principle.", power: "Full algorithmic transparency. View the propagation path, per-hop attenuation." } },
  { question: "Can I use my trust graph across different apps?", answer: { normal: "Absolutely! Your trust network lives on Nostr relays, not locked inside one app.", power: "Portable by design via NIP-XX. Your social graph is stored as signed events." } },
  { question: "What if someone with a high trust score turns out to be bad?", answer: { normal: "Trust is fluid, not permanent. If you or people you trust mute or block someone, their score drops.", power: "Negative signals propagate through the graph with configurable rigor parameters." } },
  { question: "Isn't this just a social credit score like Black Mirror?", answer: { normal: "The key difference is sovereignty. YOU control your own algorithm.", power: "WoT is subjective and transparent. Each user computes their own scores locally." } },
  { question: "Why attach numbers to trust? Isn't that reductive?", answer: { normal: "Numbers help computers make decisions at scale - like filtering thousands of posts.", power: "Quantification enables algorithmic decision-making for tasks humans can't scale." } },
  { question: "What if I'm new and don't know anyone on Nostr yet?", answer: { normal: "Everyone starts somewhere! Begin by following a few accounts you recognize.", power: "Cold start is solved via bootstrapping from known entry points." } },
  { question: "Is there one 'correct' way to calculate trust?", answer: { normal: "No - and that's the point. Different situations need different approaches.", power: "WoT is a design space, not a single algorithm." } },
  { question: "Why does building freedom tech matter right now?", answer: { normal: "The digital world is increasingly controlled. Freedom tech gives us tools to break free.", power: "We're at an inflection point. Freedom tech is the counter-movement." } },
];

const formulaParts = [
  { symbol: 'T(u)', label: 'Trust score', explanation: 'Final computed trust for user u, relative to you.' },
  { symbol: '=', label: '', explanation: '' },
  { symbol: 'Σ', label: 'Sum', explanation: 'Aggregate over all paths from you to user u.' },
  { symbol: '×', label: '', explanation: '' },
  { symbol: 'α', label: 'Attenuation', explanation: 'Decay factor per hop. Lower = faster trust decay.' },
  { symbol: '^d', label: 'Distance', explanation: 'Number of hops. Trust decreases exponentially.' },
  { symbol: '×', label: '', explanation: '' },
  { symbol: 'w_ij', label: 'Edge weight', explanation: 'Strength of connection between nodes i and j.' },
];

const featureCards = [
  { title: 'Transparent', description: 'Every score is inspectable. See exactly why someone is trusted.', icon: InsightBulbIcon },
  { title: 'Adjustable', description: 'Tune parameters to match your risk tolerance and preferences.', icon: TunerIcon },
  { title: 'Portable', description: 'Your trust graph travels with you across any compatible app.', icon: NetworkWebIcon },
];

function getScenarioIcon(iconName: string) {
  switch (iconName) {
    case 'users': return Users;
    case 'briefcase': return Briefcase;
    case 'heart': return Heart;
    case 'music': return Music;
    case 'compass': return Compass;
    default: return Users;
  }
}

function getActionIcon(iconName: string) {
  switch (iconName) {
    case 'heart': return FollowHeartIcon;
    case 'zap': return ZapBoltIcon;
    case 'repost': return RepostIcon;
    case 'quote': return QuoteBubbleIcon;
    case 'star': return StarRatingIcon;
    case 'tag': return TagLabelIcon;
    default: return SparkleStarIcon;
  }
}

function getColorClasses(color: string) {
  const map: Record<string, { bg: string; border: string; text: string }> = {
    emerald: { bg: 'from-emerald-400 to-emerald-600', border: 'border-emerald-500/40', text: 'text-emerald-400' },
    violet: { bg: 'from-violet-400 to-violet-600', border: 'border-violet-500/40', text: 'text-violet-400' },
    amber: { bg: 'from-amber-400 to-amber-600', border: 'border-amber-500/40', text: 'text-amber-400' },
    sky: { bg: 'from-sky-400 to-sky-600', border: 'border-sky-500/40', text: 'text-sky-400' },
    indigo: { bg: 'from-indigo-400 to-indigo-600', border: 'border-indigo-500/40', text: 'text-indigo-400' },
  };
  return map[color] || map.emerald;
}

function SectionDivider() {
  return (
    <div className="flex items-center justify-center gap-3 my-10">
      <div className="w-1 h-1 rounded-full bg-slate-600" />
      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
      <div className="w-1 h-1 rounded-full bg-slate-600" />
    </div>
  );
}

export default function WhatIsWotPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<UserMode>('normal');
  const [activeShowTell, setActiveShowTell] = useState<'show' | 'tell' | 'both' | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [selectedTrustNode, setSelectedTrustNode] = useState<number | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [selectedFormula, setSelectedFormula] = useState<number | null>(null);
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [isComputing, setIsComputing] = useState(false);
  const [displayedScenario, setDisplayedScenario] = useState(0);
  const [computingCard, setComputingCard] = useState<'show' | 'tell' | 'both' | null>(null);
  const [faqExpanded, setFaqExpanded] = useState(false);
  const [attenuation, setAttenuation] = useState(0.8);
  const [hops, setHops] = useState(3);

  const handleScenarioChange = (newIndex: number) => {
    if (newIndex === selectedScenario) return;
    setSelectedScenario(newIndex);
    setIsComputing(true);
    setComputingCard('both');
    setActiveShowTell(null);
    setTimeout(() => {
      setDisplayedScenario(newIndex);
      setTimeout(() => {
        setIsComputing(false);
        setComputingCard(null);
      }, 400);
    }, 600);
  };

  const handleCardReveal = (card: 'show' | 'tell') => {
    if (computingCard) return;
    const isClosing = (card === 'show' && (activeShowTell === 'show' || activeShowTell === 'both')) ||
                      (card === 'tell' && (activeShowTell === 'tell' || activeShowTell === 'both'));
    if (isClosing) {
      if (card === 'show') {
        setActiveShowTell(activeShowTell === 'both' ? 'tell' : null);
      } else {
        setActiveShowTell(activeShowTell === 'both' ? 'show' : null);
      }
      return;
    }
    const willRevealBoth = (card === 'show' && activeShowTell === 'tell') || (card === 'tell' && activeShowTell === 'show');
    if (willRevealBoth) {
      setIsComputing(true);
      setComputingCard('both');
      setTimeout(() => {
        setActiveShowTell('both');
        setTimeout(() => { setIsComputing(false); setComputingCard(null); }, 400);
      }, 600);
    } else {
      setComputingCard(card);
      setTimeout(() => {
        setActiveShowTell(card);
        setTimeout(() => setComputingCard(null), 300);
      }, 500);
    }
  };

  const handleRevealBoth = () => {
    setIsComputing(true);
    setComputingCard('both');
    setTimeout(() => {
      setActiveShowTell('both');
      setTimeout(() => { setIsComputing(false); setComputingCard(null); }, 400);
    }, 600);
  };

  const scenario = trustScenarios[displayedScenario];
  const visibleFaqs = faqExpanded ? faqs : faqs.slice(0, 4);

  return (
    <>
      <style>{`
        @keyframes wot-float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          25% { transform: translateY(-8px) translateX(4px); }
          50% { transform: translateY(-4px) translateX(-4px); }
          75% { transform: translateY(-10px) translateX(2px); }
        }
        @keyframes wot-pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes wot-fade-in-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wot-computing {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes wot-calc-float {
          0%, 100% { transform: translateY(0px); opacity: 0.15; }
          50% { transform: translateY(-6px); opacity: 0.3; }
        }
        .wot-node { animation: wot-float var(--dur) ease-in-out infinite; animation-delay: var(--delay); }
        .wot-computing-bg { background: linear-gradient(270deg, rgba(99,102,241,0.15), rgba(139,92,246,0.25), rgba(99,102,241,0.15)); background-size: 200% 200%; animation: wot-computing 1.5s ease infinite; }
      `}</style>

      <div className="min-h-screen bg-slate-950 text-white relative" data-testid="page-what-is-wot">
        {/* Background Layer */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.15),_transparent_70%)]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          />
          {floatingNodes.map((node) => (
            <div
              key={node.id}
              className="absolute rounded-full bg-indigo-400/40 wot-node"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                width: node.size,
                height: node.size,
                '--dur': `${node.duration}s`,
                '--delay': `${node.delay}s`,
              } as React.CSSProperties}
            />
          ))}
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.06 }}>
            {connectionPairs.map(([a, b], i) => (
              <line
                key={i}
                x1={`${floatingNodes[a].x}%`}
                y1={`${floatingNodes[a].y}%`}
                x2={`${floatingNodes[b].x}%`}
                y2={`${floatingNodes[b].y}%`}
                stroke="rgb(129,140,248)"
                strokeWidth="0.5"
              />
            ))}
          </svg>
          {calculations.map((calc, i) => (
            <span
              key={i}
              className="absolute font-mono text-[10px] text-indigo-400/20 pointer-events-none select-none hidden md:block"
              style={{
                left: `${10 + (i * 11) % 80}%`,
                top: `${12 + (i * 13) % 75}%`,
                animation: `wot-calc-float ${4 + i}s ease-in-out infinite`,
                animationDelay: `${i * 0.7}s`,
              }}
            >
              {calc}
            </span>
          ))}
        </div>

        {/* Sticky Nav */}
        <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5" data-testid="nav-wot">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <button
              onClick={() => { try { window.history.back(); } catch { setLocation('/'); } }}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Back</span>
            </button>
            <div className="flex items-center bg-slate-800/80 rounded-full p-0.5 border border-slate-700/50" data-testid="toggle-mode">
              <button
                onClick={() => setMode('normal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${mode === 'normal' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-400 hover:text-white'}`}
                data-testid="button-mode-normal"
              >
                <NormalModeIcon className="w-3.5 h-3.5" />
                Why
              </button>
              <button
                onClick={() => setMode('power')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${mode === 'power' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30' : 'text-slate-400 hover:text-white'}`}
                data-testid="button-mode-power"
              >
                <TechModeIcon className="w-3.5 h-3.5" />
                How
              </button>
            </div>
          </div>
        </nav>

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
          {/* Hero */}
          <section className="text-center mb-16" style={{ animation: 'wot-fade-in-up 0.6s ease-out' }} data-testid="section-hero">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-400 to-violet-400"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              data-testid="text-hero-title"
            >
              What is Web of Trust?
            </h1>
            <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              {mode === 'normal'
                ? "A personalized trust system where your connections help you navigate the digital world."
                : "An ego-centric graph traversal algorithm computing subjective trust scores via configurable multi-hop propagation."}
            </p>
          </section>

          <SectionDivider />

          {/* You Are In Control */}
          <section className="mb-16" style={{ animation: 'wot-fade-in-up 0.6s ease-out 0.1s both' }} data-testid="section-control">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3">
                <KeyControlIcon className="w-5 h-5 text-indigo-400" />
                <h2 className="text-2xl md:text-3xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-control-title">
                  You Are In Control
                </h2>
              </div>
              <p className="text-sm text-slate-400 max-w-lg mx-auto">
                {mode === 'normal' ? "Your trust network is unique to you. Here's how it works." : "The trust function: configurable, transparent, sovereign."}
              </p>
            </div>

            <div
              className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 md:p-8 backdrop-blur-md max-w-3xl mx-auto"
              style={{ boxShadow: '0 12px 48px rgba(99, 102, 241, 0.2), 0 0 0 1px rgba(99, 102, 241, 0.1)' }}
            >
              <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-2xl"
                style={{
                  backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.3) 1px, transparent 1px), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.3) 1px, transparent 1px)',
                  backgroundSize: '30px 30px, 40px 40px'
                }}
              />

              <div className="relative z-10">
                {mode === 'normal' ? (
                  <div>
                    <div className="flex items-center justify-center gap-3 md:gap-6 flex-wrap mb-6" data-testid="row-trust-nodes">
                      {trustNodeInfo.map((node, i) => (
                        <div key={i} className="flex items-center gap-2 md:gap-4">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setSelectedTrustNode(selectedTrustNode === i ? null : i)}
                              className={`${node.size} rounded-full bg-gradient-to-br ${node.color} flex items-center justify-center text-white text-xs font-bold cursor-pointer transition-all duration-300 border-2 border-white/20 ${selectedTrustNode === i ? 'ring-2 ring-indigo-400 scale-110' : 'hover:scale-105'}`}
                              data-testid={`button-trust-node-${i}`}
                            >
                              {node.label === '?' ? '?' : node.label.charAt(0)}
                            </button>
                            <span className={`text-[10px] font-medium ${node.textColor}`}>{node.label}</span>
                            <span className="text-[9px] text-slate-500">{node.trust}</span>
                          </div>
                          {i < trustNodeInfo.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div
                      className="overflow-hidden transition-all duration-300"
                      style={{ maxHeight: selectedTrustNode !== null ? 80 : 0, opacity: selectedTrustNode !== null ? 1 : 0 }}
                    >
                      {selectedTrustNode !== null && (
                        <div className="text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/30" data-testid="text-trust-node-detail">
                          <p className="text-xs text-slate-300 mb-1">{trustNodeInfo[selectedTrustNode].explanation}</p>
                          <p className="text-[10px] text-slate-500 italic">{trustNodeInfo[selectedTrustNode].insight}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-center gap-1 flex-wrap mb-4 font-mono text-lg" data-testid="row-formula">
                      {formulaParts.map((part, i) => (
                        <button
                          key={i}
                          onClick={() => part.explanation ? setSelectedFormula(selectedFormula === i ? null : i) : null}
                          className={`px-1.5 py-0.5 rounded transition-all duration-200 ${
                            part.explanation ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'
                          } ${
                            selectedFormula === i ? 'bg-white/15 ring-1 ring-indigo-400' : ''
                          } ${
                            part.symbol === 'Σ' ? 'text-indigo-400' :
                            part.symbol === 'α' ? 'text-violet-400' :
                            part.symbol === 'T(u)' ? 'text-emerald-400' :
                            part.symbol === 'w_ij' ? 'text-amber-400' :
                            part.symbol === '^d' ? 'text-violet-300' :
                            'text-slate-500'
                          }`}
                          data-testid={`button-formula-${i}`}
                        >
                          {part.symbol}
                        </button>
                      ))}
                    </div>
                    <div
                      className="overflow-hidden transition-all duration-300"
                      style={{ maxHeight: selectedFormula !== null && formulaParts[selectedFormula].explanation ? 60 : 0, opacity: selectedFormula !== null ? 1 : 0 }}
                    >
                      {selectedFormula !== null && formulaParts[selectedFormula].explanation && (
                        <div className="text-center p-2 bg-slate-800/50 rounded-xl border border-slate-700/30" data-testid="text-formula-detail">
                          <p className="text-xs text-slate-300"><span className="text-indigo-400 font-mono mr-1">{formulaParts[selectedFormula].symbol}</span>{formulaParts[selectedFormula].explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6" data-testid="row-feature-cards">
                  {featureCards.map((card, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedFeature(selectedFeature === i ? null : i)}
                      className={`text-left p-3 rounded-xl border transition-all duration-300 ${
                        selectedFeature === i
                          ? 'bg-indigo-500/15 border-indigo-500/40'
                          : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50'
                      }`}
                      data-testid={`button-feature-${i}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <card.icon className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-white">{card.title}</span>
                      </div>
                      <div
                        className="overflow-hidden transition-all duration-300"
                        style={{ maxHeight: selectedFeature === i ? 60 : 0, opacity: selectedFeature === i ? 1 : 0 }}
                      >
                        <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{card.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Interactive Parameter Tuning (Power mode only) */}
          {mode === 'power' && (
            <>
              <SectionDivider />
              <section className="mb-16" style={{ animation: 'wot-fade-in-up 0.5s ease-out' }} data-testid="section-tuning">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Interactive Parameter Tuning
                  </h2>
                  <p className="text-sm text-slate-400">See how different settings affect trust propagation</p>
                </div>

                <div
                  className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 backdrop-blur-md max-w-3xl mx-auto overflow-hidden"
                  style={{ boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 0 0 1px rgba(99, 102, 241, 0.12)' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
                  <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none"
                    style={{
                      backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)',
                      backgroundSize: '24px 24px'
                    }}
                  />

                  <div className="relative z-10">
                    <div className="text-center mb-5">
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                        Trust decays exponentially: each hop multiplies by <span className="font-mono text-emerald-400">α</span>.
                        At <span className="font-mono text-emerald-400">α={attenuation.toFixed(2)}</span> over <span className="font-mono text-violet-400">{hops} hop{hops > 1 ? 's' : ''}</span>,
                        {hops === 1 ? ' a direct friend' : hops === 2 ? ' a friend-of-friend' : ` a ${hops}-hop connection`} contributes <span className="font-mono text-indigo-400">{Math.round(Math.pow(attenuation, hops) * 100)}%</span> of direct trust.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3 sm:gap-6 mb-6">
                      <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-slate-950/25 border border-slate-700/40" data-testid="control-attenuation">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-slate-500">α =</span>
                          <span className="text-lg font-mono font-bold text-emerald-400">{attenuation.toFixed(2)}</span>
                        </div>
                        <input
                          type="range" min="0.5" max="0.95" step="0.05" value={attenuation}
                          onChange={(e) => setAttenuation(parseFloat(e.target.value))}
                          className="w-40 sm:w-24 h-2 bg-slate-700/70 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          data-testid="range-attenuation"
                        />
                      </div>
                      <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-slate-950/25 border border-slate-700/40" data-testid="control-hops">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-slate-500">d =</span>
                          <span className="text-lg font-mono font-bold text-violet-400">{hops}</span>
                        </div>
                        <input
                          type="range" min="1" max="5" step="1" value={hops}
                          onChange={(e) => setHops(parseInt(e.target.value))}
                          className="w-40 sm:w-20 h-2 bg-slate-700/70 rounded-lg appearance-none cursor-pointer accent-violet-500"
                          data-testid="range-hops"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-1 mb-5 flex-wrap" data-testid="row-decay-chain">
                      {Array.from({ length: hops + 1 }, (_, i) => {
                        const score = Math.pow(attenuation, i);
                        const size = 32 + (1 - i / Math.max(hops, 1)) * 10;
                        return (
                          <div key={i} className="flex items-center shrink-0">
                            <div className="flex flex-col items-center">
                              <div
                                className="rounded-full flex items-center justify-center font-mono text-[10px] font-bold border-2"
                                style={{
                                  width: size, height: size,
                                  borderColor: i === 0 ? 'rgba(52, 211, 153, 0.6)' : `rgba(139, 92, 246, ${0.6 - i * 0.1})`,
                                  background: i === 0
                                    ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(16, 185, 129, 0.1))'
                                    : `linear-gradient(135deg, rgba(139, 92, 246, ${0.2 - i * 0.03}), rgba(99, 102, 241, ${0.1 - i * 0.02}))`
                                }}
                              >
                                <span className={i === 0 ? 'text-emerald-400' : 'text-violet-300'}>{score.toFixed(2)}</span>
                              </div>
                              <span className="text-[8px] text-slate-500 mt-1">{i === 0 ? 'you' : `h${i}`}</span>
                            </div>
                            {i < hops && (
                              <div className="flex items-center mx-1">
                                <div className="w-4 h-px bg-gradient-to-r from-violet-500/60 to-violet-500/30" style={{ animation: 'wot-pulse-glow 1.5s ease-in-out infinite' }} />
                                <span className="text-[8px] text-slate-600 mx-0.5">&times;α</span>
                                <div className="w-4 h-px bg-gradient-to-r from-violet-500/30 to-violet-500/60" style={{ animation: 'wot-pulse-glow 1.5s ease-in-out infinite 0.3s' }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:flex sm:items-center sm:justify-center gap-2 sm:gap-4 pt-4 border-t border-slate-700/40">
                      <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                        <span className="text-[9px] text-slate-500">T(u) at d={hops}</span>
                        <span className="text-sm font-mono font-bold text-indigo-400">{Math.pow(attenuation, hops).toFixed(4)}</span>
                      </div>
                      <div className="hidden sm:block w-px h-4 bg-slate-700/50" />
                      <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                        <span className="text-[9px] text-slate-500">reach</span>
                        <span className="text-sm font-mono text-amber-400/80">~{Math.pow(150, hops).toLocaleString()}</span>
                      </div>
                      <div className="hidden sm:block w-px h-4 bg-slate-700/50" />
                      <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                        <span className="text-[9px] text-slate-500 shrink-0">formula</span>
                        <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap">
                          α<sup>d</sup> = {attenuation}<sup>{hops}</sup>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          <SectionDivider />

          {/* Show vs Tell */}
          <section className="mb-16" style={{ animation: 'wot-fade-in-up 0.6s ease-out 0.2s both' }} data-testid="section-show-tell">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                  <ShowEyeIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <h2
                  className="text-2xl md:text-3xl lg:text-4xl font-bold text-white"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Show <span className="text-slate-500 font-normal mx-1 md:mx-2">vs</span> Tell
                </h2>
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30">
                  <TellSpeechIcon className="w-5 h-5 text-violet-400" />
                </div>
              </div>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-3">
                {mode === 'normal'
                  ? "Two fundamental ways to express trust in a decentralized network."
                  : "Implicit behavioral signals vs explicit semantic attestations."}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                {activeShowTell !== 'both' && !computingCard && (
                  <button
                    onClick={handleRevealBoth}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 via-indigo-500/20 to-violet-500/20 border border-indigo-500/30 rounded-full hover:border-indigo-400/50 transition-all duration-300"
                    data-testid="button-reveal-both"
                  >
                    <CompareIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-[11px] font-medium text-white">Reveal Both</span>
                  </button>
                )}
                {activeShowTell === 'both' && (
                  <button
                    onClick={() => setActiveShowTell(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-600/50 rounded-full hover:border-slate-500/50 transition-all duration-300"
                    data-testid="button-reset-show-tell"
                  >
                    <span className="text-[11px] text-slate-400">Reset</span>
                  </button>
                )}
              </div>
              {activeShowTell === null && (
                <p className="text-[10px] text-slate-500" style={{ animation: 'wot-pulse-glow 2s ease-in-out infinite' }}>
                  Or tap cards individually to explore
                </p>
              )}
            </div>

            {/* Scenario tabs */}
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap" data-testid="row-scenario-tabs">
              {trustScenarios.map((s, i) => {
                const Icon = getScenarioIcon(s.icon);
                return (
                  <button
                    key={s.id}
                    onClick={() => handleScenarioChange(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border ${
                      selectedScenario === i
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                        : 'bg-slate-800/50 border-slate-700/30 text-slate-400 hover:text-white hover:border-slate-600/50'
                    }`}
                    data-testid={`button-scenario-${s.id}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Scenario card */}
            <div
              className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 border border-indigo-500/30 rounded-3xl p-6 md:p-8 backdrop-blur-xl max-w-3xl mx-auto overflow-hidden"
              style={{ boxShadow: '0 8px 40px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255,255,255,0.05)' }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-violet-900/10 to-purple-900/20 pointer-events-none" />
              <div
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.4) 1px, transparent 1px)',
                  backgroundSize: '30px 30px'
                }}
              />

              <div className="relative z-10">
                {/* Person cards */}
                <div className="flex items-center justify-center gap-4 sm:gap-8 mb-6">
                  <div className="flex flex-col items-center gap-2" data-testid="card-person-a">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${getColorClasses(scenario.personA.color).bg} flex items-center justify-center text-white text-lg font-bold border-2 border-white/20`}>
                      {scenario.personA.initials}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-white">{scenario.personA.name}</p>
                      <p className="text-[10px] text-slate-500">{scenario.personA.role}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-px bg-gradient-to-r from-emerald-500/50 via-indigo-500/50 to-violet-500/50" />
                    <span className="text-[9px] text-slate-500">trust signals</span>
                  </div>
                  <div className="flex flex-col items-center gap-2" data-testid="card-person-b">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${getColorClasses(scenario.personB.color).bg} flex items-center justify-center text-white text-lg font-bold border-2 border-white/20`}>
                      {scenario.personB.initials}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-white">{scenario.personB.name}</p>
                      <p className="text-[10px] text-slate-500">{scenario.personB.role}</p>
                    </div>
                  </div>
                </div>

                {/* Show & Tell cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* Show Trust */}
                  <button
                    onClick={() => handleCardReveal('show')}
                    className={`relative text-left p-4 rounded-xl border transition-all duration-300 ${
                      activeShowTell === 'show' || activeShowTell === 'both'
                        ? 'bg-emerald-500/15 border-emerald-500/40'
                        : 'bg-slate-800/40 border-slate-700/30 hover:border-emerald-500/30'
                    }`}
                    data-testid="button-show-trust"
                  >
                    {computingCard === 'show' || (computingCard === 'both') ? (
                      <div className="absolute inset-0 rounded-xl wot-computing-bg flex items-center justify-center">
                        <span className="text-[10px] font-mono text-indigo-300">computing...</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 mb-2">
                      <ActionProofIcon className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-400">Show Trust</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2">Behavioral signals</p>
                    <div
                      className="overflow-hidden transition-all duration-500"
                      style={{
                        maxHeight: (activeShowTell === 'show' || activeShowTell === 'both') ? 200 : 0,
                        opacity: (activeShowTell === 'show' || activeShowTell === 'both') ? 1 : 0,
                      }}
                    >
                      <div className="space-y-2 pt-1">
                        {scenario.showActions.map((action, j) => {
                          const ActionIcon = getActionIcon(action.icon);
                          return (
                            <div key={j} className="flex items-center gap-2">
                              <ActionIcon className={`w-3.5 h-3.5 ${getColorClasses(action.color).text}`} />
                              <span className="text-[11px] text-slate-300">{action.text}</span>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-emerald-400/80 italic mt-2 pt-2 border-t border-slate-700/30">{scenario.showInsight}</p>
                      </div>
                    </div>
                  </button>

                  {/* Tell Trust */}
                  <button
                    onClick={() => handleCardReveal('tell')}
                    className={`relative text-left p-4 rounded-xl border transition-all duration-300 ${
                      activeShowTell === 'tell' || activeShowTell === 'both'
                        ? 'bg-violet-500/15 border-violet-500/40'
                        : 'bg-slate-800/40 border-slate-700/30 hover:border-violet-500/30'
                    }`}
                    data-testid="button-tell-trust"
                  >
                    {computingCard === 'tell' || (computingCard === 'both') ? (
                      <div className="absolute inset-0 rounded-xl wot-computing-bg flex items-center justify-center">
                        <span className="text-[10px] font-mono text-indigo-300">computing...</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 mb-2">
                      <ExplicitContextIcon className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-semibold text-violet-400">Tell Trust</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2">Explicit attestations</p>
                    <div
                      className="overflow-hidden transition-all duration-500"
                      style={{
                        maxHeight: (activeShowTell === 'tell' || activeShowTell === 'both') ? 200 : 0,
                        opacity: (activeShowTell === 'tell' || activeShowTell === 'both') ? 1 : 0,
                      }}
                    >
                      <div className="space-y-2 pt-1">
                        {scenario.tellActions.map((action, j) => {
                          const ActionIcon = getActionIcon(action.icon);
                          return (
                            <div key={j} className="flex items-center gap-2">
                              <ActionIcon className={`w-3.5 h-3.5 ${getColorClasses(action.color).text}`} />
                              <span className="text-[11px] text-slate-300">{action.text}</span>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-violet-400/80 italic mt-2 pt-2 border-t border-slate-700/30">{scenario.tellInsight}</p>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Applications (shown when both revealed) */}
                <div
                  className="overflow-hidden transition-all duration-500"
                  style={{
                    maxHeight: activeShowTell === 'both' ? 300 : 0,
                    opacity: activeShowTell === 'both' ? 1 : 0,
                  }}
                >
                  <div className="pt-4 border-t border-indigo-500/20">
                    <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-3">Applications</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {scenario.applications.map((app, j) => (
                        <div key={j} className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20" data-testid={`card-application-${j}`}>
                          <p className="text-xs font-semibold text-white mb-1">{app.title}</p>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{app.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* Use Cases */}
          <section className="mb-16" style={{ animation: 'wot-fade-in-up 0.6s ease-out 0.3s both' }} data-testid="section-use-cases">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Use Cases
              </h2>
              <p className="text-sm text-slate-400">
                {mode === 'normal' ? "Real-world applications of trust networks." : "Technical applications of trust graph traversal."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {examples.map((ex, i) => (
                <div
                  key={i}
                  className="p-5 bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-slate-700/40 rounded-2xl hover:border-indigo-500/30 transition-all duration-300"
                  data-testid={`card-use-case-${i}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                      <ex.icon className="w-4.5 h-4.5 text-indigo-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white">{ex.title}</h3>
                  </div>
                  <p className="text-[12px] text-slate-400 leading-relaxed">
                    {mode === 'normal' ? ex.normal : ex.power}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <SectionDivider />

          {/* FAQ */}
          <section className="mb-16" style={{ animation: 'wot-fade-in-up 0.6s ease-out 0.4s both' }} data-testid="section-faq">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Frequently Asked Questions
              </h2>
            </div>
            <div className="max-w-3xl mx-auto space-y-2">
              {visibleFaqs.map((faq, i) => (
                <div
                  key={i}
                  className="border border-slate-700/40 rounded-xl overflow-hidden transition-all duration-200"
                  data-testid={`faq-item-${i}`}
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-800/30 transition-colors"
                    data-testid={`button-faq-${i}`}
                  >
                    <span className="text-sm font-medium text-white">{faq.question}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${expandedFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: expandedFaq === i ? 200 : 0 }}
                  >
                    <div className="px-4 pb-4">
                      <p className="text-[12px] text-slate-400 leading-relaxed">
                        {mode === 'normal' ? faq.answer.normal : faq.answer.power}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {!faqExpanded && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setFaqExpanded(true)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    data-testid="button-show-more-faq"
                  >
                    Show more
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </section>

          <SectionDivider />

          {/* CTA */}
          <section className="mb-16 text-center" data-testid="section-cta">
            <div
              className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-8 md:p-12 backdrop-blur-md max-w-2xl mx-auto"
              style={{ boxShadow: '0 12px 48px rgba(99, 102, 241, 0.2)' }}
            >
              <h2
                className="text-2xl md:text-3xl font-bold text-white mb-3"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Ready to explore your trust network?
              </h2>
              <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
                {mode === 'normal'
                  ? "Start building your personalized Web of Trust today."
                  : "Configure your trust parameters and start computing."}
              </p>
              <button
                onClick={() => setLocation('/')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full text-sm font-semibold text-white hover:from-indigo-400 hover:to-violet-400 transition-all duration-300 shadow-lg shadow-indigo-500/30"
                data-testid="button-get-started"
              >
                Get Started
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
