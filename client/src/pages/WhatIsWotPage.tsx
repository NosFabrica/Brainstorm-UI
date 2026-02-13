import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ChevronRight, ChevronDown, Users, Briefcase, Music, Compass, Heart } from 'lucide-react';
import { BrainLogo } from '@/components/BrainLogo';
import { motion, AnimatePresence } from 'framer-motion';
import aliceAvatar from '@assets/generated_images/professional_woman_avatar_illustration.png';
import bobAvatar from '@assets/generated_images/creative_man_avatar_illustration.png';
import networkBg from '@assets/generated_images/abstract_network_web_background.png';
import selfAvatar from '@assets/generated_images/self_avatar_glowing_silhouette.png';
import friendAvatar from '@assets/generated_images/friendly_trusted_person_avatar.png';
import fofAvatar from '@assets/generated_images/distant_friend-of-friend_avatar.png';
import unknownAvatar from '@assets/generated_images/unknown_stranger_avatar_silhouette.png';
import socialAliceAvatar from '@assets/young_creative_woman_14461b61_1770965715586.jpg';
import socialBobAvatar from '@assets/young_man_profession_46072db4_1770965705548.jpg';
import businessClientAvatar from '@assets/stock_images/professional_man_wor_ca204bd6.jpg';
import businessVendorAvatar from '@assets/stock_images/red_brick_building_e_b5643b62.jpg';
import musicFanAvatar from '@assets/generated_images/music_fan_listener_avatar.png';
import musicArtistAvatar from '@assets/stock_images/live_band_concert_st_a3f0f7e3.jpg';
import tasteFoodieAvatar from '@assets/stock_images/food_influencer_eati_33799fa5.jpg';
import tasteRestaurantAvatar from '@assets/stock_images/upscale_fine_dining__0f9e2af1.jpg';
import showTrustImage from '@assets/generated_images/show_trust_behavioral_proof_hands.png';
import tellTrustImage from '@assets/generated_images/tell_trust_attestation_speech_bubbles.png';
import wellnessPatientAvatar from '@assets/generated_images/male_patient_portrait_headshot.png';
import wellnessNaturopathAvatar from '@assets/generated_images/naturopath_doctor_portrait_headshot.png';
import ostrichRunning from '@assets/generated_images/ostrich_running.png';
import { 
  SpamFilterIcon, 
  DiscoveryIcon, 
  CommunityIcon,
  SecureScanIcon,
  KeyControlIcon, 
  VerifyIcon,
  ShowEyeIcon,
  TellSpeechIcon,
  NormalModeIcon,
  TechModeIcon,
  SparkleStarIcon,
  CompareIcon,
  CheckPulseIcon,
  CrossFragmentIcon,
  ChevronPulseIcon,
  NetworkWebIcon,
  TunerIcon,
  InsightBulbIcon,
  FollowHeartIcon,
  ZapBoltIcon,
  RepostIcon,
  QuoteBubbleIcon,
  StarRatingIcon,
  TagLabelIcon,
  ActionProofIcon,
  ExplicitContextIcon
} from '@/components/WotIcons';

import { Footer } from '@/components/Footer';

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
  "trust_score: 0.94",
  "hops: 2 → 0.73",
  "attenuation: 0.85",
  "follows: 847",
  "wot_rank: #127",
  "sig: schnorr✓",
  "kind:3 verified",
  "npub1qx3f...ok",
];

const trustScenarios = [
  {
    id: 'social',
    label: 'Social',
    icon: 'users',
    personA: { name: 'Alice', role: 'Creator', avatar: socialAliceAvatar },
    personB: { name: 'Bob', role: 'Developer', avatar: socialBobAvatar },
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
      { title: 'Spam Filtering', description: 'Your feed automatically hides spam because it trusts your network\'s judgment about who\'s legit.' },
      { title: 'Account Verification', description: 'Know which accounts are real because your trusted connections have vouched for them.' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: 'briefcase',
    personA: { name: 'Startup', role: 'Client', avatar: businessClientAvatar },
    personB: { name: 'Agency', role: 'Vendor', avatar: businessVendorAvatar },
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
      { title: 'Vendor Vetting', description: 'Instantly see which agencies your trusted peers have successfully worked with.' },
      { title: 'Risk Assessment', description: 'Payment history and renewal patterns reveal reliability better than any pitch deck.' },
    ],
  },
  {
    id: 'wellness',
    label: 'Wellness',
    icon: 'heart',
    personA: { name: 'Marcus', role: 'Patient', avatar: wellnessPatientAvatar },
    personB: { name: 'Dr. Chen', role: 'Naturopath', avatar: wellnessNaturopathAvatar },
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
      { title: 'Beyond Insurance Limits', description: 'When coverage says "not medically necessary," trusted networks reveal practitioners who actually heal — not just prescribe.' },
      { title: 'Finding True Care', description: 'Discover practitioners your network trusts for results, not ones optimized for billing codes and 15-minute visits.' },
    ],
  },
  {
    id: 'music',
    label: 'Music',
    icon: 'music',
    personA: { name: 'Fan', role: 'Listener', avatar: musicFanAvatar },
    personB: { name: 'Artist', role: 'Musician', avatar: musicArtistAvatar },
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
      { title: 'Discovery Engine', description: 'Find amazing artists your trusted network loves, even if you\'ve never heard of them.' },
      { title: 'Taste Matching', description: 'See what people with similar listening patterns are obsessing over right now.' },
    ],
  },
  {
    id: 'recommendations',
    label: 'Taste',
    icon: 'compass',
    personA: { name: 'Foodie', role: 'Reviewer', avatar: tasteFoodieAvatar },
    personB: { name: 'Restaurant', role: 'Venue', avatar: tasteRestaurantAvatar },
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
      { title: 'Personal Curation', description: 'See different recommendations than your friend — because your taste networks are unique to you.' },
      { title: 'Hidden Gems', description: 'Surface spots loved by your trusted circle, not just places with the most generic reviews.' },
    ],
  },
];

export default function WhatIsWoT() {
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
  
  const handleScenarioChange = (newIndex: number) => {
    if (newIndex === selectedScenario) return;
    setSelectedScenario(newIndex);
    setIsComputing(true);
    setComputingCard('both');
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
        setTimeout(() => {
          setIsComputing(false);
          setComputingCard(null);
        }, 400);
      }, 600);
    } else {
      setComputingCard(card);
      setTimeout(() => {
        setActiveShowTell(card);
        setTimeout(() => setComputingCard(null), 300);
      }, 500);
    }
  };
  
  const scenario = trustScenarios[displayedScenario];
  
  const trustNodeInfo = [
    { 
      label: 'You', 
      trust: '100%', 
      size: 'w-12 h-12', 
      color: 'from-indigo-500 to-violet-600', 
      textColor: 'text-slate-200', 
      glow: 'shadow-indigo-500/40',
      image: selfAvatar,
      borderColor: 'border-indigo-500/60',
      explanation: "This is you — your trust anchor. Everyone else's score is calculated relative to your position in the network.",
      insight: "You're the center of your own trust universe."
    },
    { 
      label: 'Friend', 
      trust: 'High', 
      size: 'w-10 h-10', 
      color: 'from-emerald-500 to-emerald-600', 
      textColor: 'text-emerald-300', 
      glow: 'shadow-emerald-500/30',
      image: friendAvatar,
      borderColor: 'border-emerald-500/60',
      explanation: "Direct connections — people you explicitly follow or have interacted with positively. They get high trust by default.",
      insight: "1 hop away. Their actions directly influence your feed."
    },
    { 
      label: 'FoF', 
      trust: 'Some', 
      size: 'w-8 h-8', 
      color: 'from-amber-500/70 to-amber-600/70', 
      textColor: 'text-amber-300/80', 
      glow: 'shadow-amber-500/20',
      image: fofAvatar,
      borderColor: 'border-amber-500/50',
      explanation: "Friends of friends — 2 hops away. Trust decays with distance, but they're still vouched for by people you trust.",
      insight: "Trust inherited through your network, but attenuated."
    },
    { 
      label: '?', 
      trust: 'Unknown', 
      size: 'w-6 h-6', 
      color: 'from-slate-600 to-slate-700', 
      textColor: 'text-slate-400', 
      glow: '',
      image: unknownAvatar,
      borderColor: 'border-slate-600/50',
      explanation: "Strangers — no connection path to you, or too many hops away. They start with minimal or zero trust.",
      insight: "No path = no inherited trust. They must earn it."
    },
  ];
  const [interactiveScore, setInteractiveScore] = useState(0.75);
  const [attenuation, setAttenuation] = useState(0.8);
  const [hops, setHops] = useState(3);
  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    if (demoStep > 0 && demoStep < 4) {
      const timer = setTimeout(() => setDemoStep(demoStep + 1), 1500);
      return () => clearTimeout(timer);
    }
  }, [demoStep]);

  const examples = [
    {
      title: "Spam Filtering",
      normal: "Your feed automatically hides spam because it trusts your friends' judgment about who's legit.",
      power: "Trust propagation with configurable attenuation factors creates a personalized spam filter. Profiles with scores below your threshold are automatically filtered.",
      icon: SpamFilterIcon,
    },
    {
      title: "Content Discovery",
      normal: "Find amazing content from people your trusted network loves, even if you don't follow them yet.",
      power: "Multi-hop trust traversal surfaces high-quality content from your extended network (2-3 degrees of separation) weighted by propagated trust scores.",
      icon: DiscoveryIcon,
    },
    {
      title: "Community Curation",
      normal: "See different content than your friend sees - because your networks are unique to you.",
      power: "Subjective trust scores create personalized information bubbles. Same query, different results based on your trust graph topology.",
      icon: CommunityIcon,
    },
    {
      title: "Verification",
      normal: "Know which accounts are real because your trusted network has verified them.",
      power: "Distributed reputation system using cryptographic assertions. Trust is computed, not declared - no central authority required.",
      icon: VerifyIcon,
    }
  ];

  const faqs = [
    {
      question: "How is this different from followers or likes?",
      answer: {
        normal: "Followers and likes are flat - 1 million followers from bots counts the same as 100 from real people. Web of Trust is personalized: it weighs connections based on YOUR network. Someone followed by people YOU trust scores higher than a stranger with millions of followers you've never heard of.",
        power: "Followers and likes are flat - 1 million followers from bots counts the same as 100 from real people. Web of Trust is personalized: it weighs connections based on YOUR network. Someone followed by people YOU trust scores higher than a stranger with millions of followers you've never heard of."
      }
    },
    {
      question: "What's the difference between 'showing' and 'telling' trust?",
      answer: {
        normal: "'Showing' is when actions prove trust - like Alice hiring Bob as a web developer. 'Telling' is when Alice says 'Bob is a great developer.' Both have value! Showing is harder to fake, but telling gives you more detail about WHY someone is trusted.",
        power: "Show = implicit trust signals (follows, zaps, reposts, hires, payments). Tell = explicit attestations with granular context (NIP-32 labels, reviews, endorsements). Show has higher signal strength but lower precision. Tell has higher precision but requires interpretation. Optimal systems combine both."
      }
    },
    {
      question: "Can I see exactly how my trust scores are calculated?",
      answer: {
        normal: "Yes! Complete transparency is a core principle. You can see who contributes to someone's score, how much each connection adds, and adjust parameters to match your preferences.",
        power: "Full algorithmic transparency. View the propagation path, per-hop attenuation, individual contributions from each node, and composite scoring. Export raw data, inspect the calculation, fork the algorithm. 'Trust me bro' is the opposite of what we're building."
      }
    },
    {
      question: "Can I use my trust graph across different apps?",
      answer: {
        normal: "Absolutely! Your trust network lives on Nostr relays, not locked inside one app. Any compatible app can read your graph - switch clients, try new tools, your reputation travels with you. No more starting from zero.",
        power: "Portable by design via NIP-XX. Your social graph is stored as signed events on relays you control. Any compliant client can compute scores from the same data. Export to JSON, migrate between clients, or run your own relay. Zero vendor lock-in, full data sovereignty."
      }
    },
    {
      question: "What if someone with a high trust score turns out to be bad?",
      answer: {
        normal: "Trust is fluid, not permanent. If you or people you trust mute or block someone, their score drops in your network immediately. The system learns from your community's collective wisdom in real-time.",
        power: "Negative signals (mutes, blocks, reports) propagate through the graph with configurable rigor parameters. The system supports both attestations (positive) and contestations (negative). Historical trust doesn't guarantee future trust - scores are recomputed dynamically."
      }
    },
    {
      question: "Isn't this just a social credit score like Black Mirror?",
      answer: {
        normal: "Great question! The key difference is sovereignty. In dystopian systems, ONE entity controls your score and you can't see how it works. With Web of Trust, YOU control your own algorithm. Your scores are calculated from YOUR network, visible only to YOU, and you can adjust how they're computed. There's no central authority - just math you can inspect.",
        power: "Critical distinction: WoT is subjective and transparent. Each user computes their own scores locally using their own social graph. There's no global 'score' - Alice's view of Bob is different from Carol's view of Bob. The algorithm is open source, parameters are user-configurable, and no central authority can manipulate outcomes. It's the opposite of a surveillance system."
      }
    },
    {
      question: "Why attach numbers to trust? Isn't that reductive?",
      answer: {
        normal: "Numbers help computers make decisions at scale - like filtering thousands of posts. But you're always in control. Think of scores as a starting point for your attention, not a final judgment.",
        power: "Quantification enables algorithmic decision-making for tasks humans can't scale (spam filtering millions of profiles). Scores are probabilistic heuristics, not ground truth. The number represents 'likelihood this account is useful to me' - it's a tool for attention allocation, not moral judgment."
      }
    },
    {
      question: "What if I'm new and don't know anyone on Nostr yet?",
      answer: {
        normal: "Everyone starts somewhere! Begin by following a few accounts you recognize - maybe people you know from Twitter, podcasters you like, or communities you're part of. Your trust network grows organically as you interact. Even 5-10 quality follows creates a useful starting graph.",
        power: "Cold start is solved via bootstrapping from known entry points: existing social imports (Twitter follow lists), curated starter packs, or organization-verified accounts. Initial trust propagates quickly - following 10 well-connected nodes typically reaches 80%+ of active profiles within 3 hops."
      }
    },
    {
      question: "Is there one 'correct' way to calculate trust?",
      answer: {
        normal: "No - and that's the point. Different situations need different approaches. A marketplace might weight financial transactions heavily; a music community might care more about creative resonance. Developers are building various models, and YOU choose which fits your worldview. We're all learning together what 'trust' means in the digital age.",
        power: "WoT is a design space, not a single algorithm. Developers are experimenting with PageRank variants, attestation schemas, context-specific weighting, and novel propagation functions. There's no monopoly on truth here - different use cases demand different models. The protocol provides primitives; the community builds interpretations. Fork it, extend it, prove us wrong. That's the point."
      }
    },
    {
      question: "Why does building freedom tech matter right now?",
      answer: {
        normal: "The digital world we live in is increasingly controlled - algorithms decide what we see, platforms decide who we trust, and centralized systems shape our reality in invisible ways. Freedom tech like Web of Trust gives us tools to break free. By building transparent, sovereign systems, we create new possibilities for genuine human connection and discovery. The acceleration of information isn't slowing down - we need moral foundations to navigate it.",
        power: "We're at an inflection point. The current paradigm treats humans as data inputs to manipulation engines - engagement metrics, attention extraction, algorithmic curation without consent. Freedom tech is the counter-movement: protocols that encode sovereignty, transparency, and user agency as first principles. Web of Trust isn't just a trust algorithm - it's an energy equation, transmitting signal through noise, enabling creation over consumption. The digital continuum will evolve with or without us. Better we build it with intentionality than let extractive systems define the future. This is what rising above looks like."
      }
    }
  ];

  const showVsTell = {
    show: {
      title: "Show Trust",
      subtitle: "Actions speak louder than words",
      examples: [
        { action: "Alice follows Bob", interpretation: "Alice trusts Bob with her attention" },
        { action: "Alice zaps Bob 10k sats", interpretation: "Alice values Bob's content financially" },
        { action: "Alice hires Bob for a project", interpretation: "Alice trusts Bob's professional skills" },
        { action: "Alice reposts Bob's thread", interpretation: "Alice endorses Bob's ideas publicly" },
      ],
      pros: ["Hard to fake at scale", "Skin in the game", "Objective evidence"],
      cons: ["Low precision - WHY did she follow?", "Context is implicit", "Can't query for specifics"],
    },
    tell: {
      title: "Tell Trust",
      subtitle: "Explicit, granular attestations",
      examples: [
        { action: "Alice says 'Bob is a Rust expert'", interpretation: "Specific skill endorsement" },
        { action: "Alice rates Bob 5/5 for NIP knowledge", interpretation: "Quantified domain expertise" },
        { action: "Alice writes 'I followed Bob for cat memes'", interpretation: "Context for the relationship" },
        { action: "Alice tags Bob as 'reliable collaborator'", interpretation: "Behavioral attestation" },
      ],
      pros: ["High precision", "Query-able context", "Granular filtering"],
      cons: ["Easy to fake", "Requires effort", "Subjective interpretation"],
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]" />
      <motion.div
        className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.2, 1],
          x: [0, 20, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full bg-violet-600/5 blur-3xl"
        animate={{
          opacity: [0.2, 0.5, 0.2],
          scale: [1, 1.3, 1],
          y: [0, -15, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      <motion.div
        className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full bg-blue-500/5 blur-2xl"
        animate={{
          opacity: [0.1, 0.4, 0.1],
          scale: [1, 1.4, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {connectionPairs.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={`${floatingNodes[a].x}%`}
            y1={`${floatingNodes[a].y}%`}
            x2={`${floatingNodes[b].x}%`}
            y2={`${floatingNodes[b].y}%`}
            stroke="url(#wotLineGradient)"
            strokeWidth="0.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.3, 0] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeInOut",
            }}
          />
        ))}
        <defs>
          <linearGradient id="wotLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      {floatingNodes.map((node) => (
        <motion.div
          key={node.id}
          className="absolute rounded-full bg-indigo-400"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size + 2,
            height: node.size + 2,
          }}
          animate={{
            y: [0, -40, 0],
            opacity: [0.2, 0.7, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: node.duration,
            repeat: Infinity,
            delay: node.delay,
            ease: "easeInOut",
          }}
        />
      ))}
      {calculations.map((calc, i) => (
        <motion.div
          key={i}
          className="absolute text-xs font-mono text-indigo-400/60 pointer-events-none select-none hidden md:block"
          style={{
            left: `${5 + (i % 4) * 25}%`,
            top: `${15 + Math.floor(i / 4) * 70}%`,
          }}
          animate={{
            opacity: [0, 0.3, 0],
            y: [0, -15, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            delay: i * 1.2,
            ease: "easeInOut",
          }}
        >
          {calc}
        </motion.div>
      ))}
      <div className="relative z-10">
        <div className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-950/80 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <motion.button
                onClick={() => window.history.length > 1 ? window.history.back() : setLocation('/')}
                className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors text-sm"
                whileHover={{ x: -4 }}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </motion.button>
              
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
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10 sm:mb-16"
          >
            <h1 
              className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-transparent"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              What is Web of Trust?
            </h1>
            
            <AnimatePresence mode="wait">
              <motion.div
                key={`subtitle-${mode}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-3xl mx-auto"
              >
                {mode === 'normal' ? (
                  <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto px-2">
                    Your social connections become a <span className="text-indigo-400 font-medium">powerful signal</span>. Trust propagates through your network to build authentic communities, surface quality content, keep you safe and filter through the mess — <span className="text-white">all controlled by you.</span>
                  </p>
                ) : (
                  <p className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto px-2">
                    A <span className="text-indigo-400 font-medium">distributed, subjective reputation system</span> using graph traversal. Compute personalized trust scores via multi-hop propagation with configurable parameters. <span className="text-white">Open source. User-sovereign. No central authority.</span>
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-10 sm:mb-16"
          >
            <div 
              className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 backdrop-blur-md max-w-3xl mx-auto overflow-hidden"
              style={{ 
                boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)'
              }}
            >
              <div 
                className="absolute inset-0 opacity-20"
                style={{ 
                  backgroundImage: `url(${networkBg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
              <motion.div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent rounded-full"
                initial={{ opacity: 0.4 }}
                animate={{ opacity: (selectedTrustNode !== null || selectedFeature !== null) ? 1 : 0.4 }}
                transition={{ duration: 0.3 }}
              />
              
              <div className="relative z-10 text-center mb-4">
                <h2 className="font-bold text-white mb-2 text-[24px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  You Are In Control
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {mode === 'normal'
                    ? "You decide how trust flows. Closer connections = more trust."
                    : "Algorithmic sovereignty: inspect, adjust, and export every parameter."}
                </p>
              </div>

              {mode === 'normal' ? (
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-2 sm:gap-3 py-4">
                    {trustNodeInfo.map((node, i) => (
                      <motion.div 
                        key={i}
                        className="flex items-center gap-2"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1, type: "spring" }}
                      >
                        {i > 0 && (
                          <motion.div
                            animate={{ x: selectedTrustNode === null ? [0, 3, 0] : 0, opacity: selectedTrustNode !== null && selectedTrustNode < i ? 0.2 : 1 }}
                            transition={{ duration: 1.5, repeat: selectedTrustNode === null ? Infinity : 0, delay: i * 0.2 }}
                          >
                            <ChevronRight className={`w-3 h-3 ${node.textColor} opacity-40`} />
                          </motion.div>
                        )}
                        <motion.div 
                          className={`flex flex-col items-center group cursor-pointer ${selectedTrustNode === i ? 'z-10' : ''}`}
                          onMouseEnter={() => setSelectedTrustNode(i)}
                          onMouseLeave={() => setSelectedTrustNode(null)}
                          whileHover={{ scale: 1.15, y: -4 }}
                          animate={{ 
                            opacity: selectedTrustNode !== null && selectedTrustNode !== i ? 0.4 : 1
                          }}
                        >
                          <motion.div 
                            className={`${node.size} rounded-full overflow-hidden shadow-lg ${node.glow} transition-all relative`}
                            animate={{ 
                              boxShadow: selectedTrustNode === i ? '0 0 25px rgba(99, 102, 241, 0.6)' : undefined
                            }}
                          >
                            <AnimatePresence mode="wait">
                              {selectedTrustNode === i ? (
                                <motion.img
                                  key="image"
                                  src={node.image}
                                  alt={node.label}
                                  className={`w-full h-full object-cover border-2 ${node.borderColor} rounded-full`}
                                  initial={{ opacity: 0, scale: 1.2 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  transition={{ duration: 0.2 }}
                                />
                              ) : (
                                <motion.div
                                  key="label"
                                  className={`w-full h-full bg-gradient-to-br ${node.color} flex items-center justify-center text-white font-semibold text-[10px]`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  {node.label}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                          <span className={`text-[9px] ${node.textColor} mt-1 opacity-70 group-hover:opacity-100 transition-opacity`}>{node.trust}</span>
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>
                  
                  <div className="h-20 flex flex-col items-center justify-center mt-1 mb-2 mx-4">
                    <AnimatePresence mode="wait">
                      {selectedTrustNode !== null ? (
                        <motion.div
                          key={selectedTrustNode}
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                          className="text-center max-w-sm px-4 py-2 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-indigo-500/20"
                          style={{ 
                            boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)'
                          }}
                        >
                          <p className="text-xs text-slate-200 leading-relaxed">
                            {trustNodeInfo[selectedTrustNode].explanation}
                          </p>
                          <p className="text-[10px] text-indigo-400 mt-1 font-medium">
                            ✦ {trustNodeInfo[selectedTrustNode].insight}
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-2"
                        >
                          <KeyControlIcon className="w-6 h-6 text-indigo-400/60" />
                          <p className="text-[10px] text-slate-500">
                            <span className="text-indigo-400/80 hidden sm:inline">Hover</span><span className="text-indigo-400/80 sm:hidden">Tap</span> to explore trust decay
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 py-3">
                    {[
                      { label: 'T(u)', sub: 'Score', color: 'indigo', expanded: 'Final trust score for user u — computed recursively from your graph\'s edge structure. Aggregates weighted contributions from all connected paths.', insight: 'Output range [0,1] normalized via softmax' },
                      { label: '=', color: 'slate', isOperator: true },
                      { label: 'Σ', sub: 'paths', color: 'violet', expanded: 'Summation over all valid paths from you to target user. Handles cycles via convergence bounds and path deduplication.', insight: 'Max path depth configurable (default: 6 hops)' },
                      { label: '×', color: 'slate', isOperator: true },
                      { label: 'α^d', sub: 'decay', color: 'emerald', expanded: 'Attenuation factor α raised to hop depth d. Each hop multiplies trust by α, so distant connections contribute less. You control α.', insight: 'Typical values: 0.5 (strict) to 0.85 (trusting)' },
                      { label: '×', color: 'slate', isOperator: true },
                      { label: 'w_ij', sub: 'weight', color: 'amber', expanded: 'Edge weight between nodes i→j. Derived from explicit attestations (follows, endorsements) plus implicit behavioral signals (interactions, replies).', insight: 'Weights stored as signed events on relays' },
                    ].map((item, i) => {
                      const formulaIndex = item.isOperator ? -1 : [0, 1, 2, 3].filter((_, idx) => idx === Math.floor(i / 2))[0];
                      const actualIndex = i === 0 ? 0 : i === 2 ? 1 : i === 4 ? 2 : i === 6 ? 3 : -1;
                      return item.isOperator ? (
                        <span key={i} className="text-slate-500 text-sm px-0.5">{item.label}</span>
                      ) : (
                        <motion.div 
                          key={i}
                          className={`rounded-lg px-2.5 py-1.5 text-center relative cursor-pointer transition-all ${
                            selectedFormula === actualIndex 
                              ? `bg-${item.color}-500/25 border border-${item.color}-400/50` 
                              : `bg-${item.color}-500/20 border border-${item.color}-500/30 hover:bg-${item.color}-500/25`
                          }`}
                          onMouseEnter={() => setSelectedFormula(actualIndex)}
                          onMouseLeave={() => setSelectedFormula(null)}
                          whileHover={{ scale: 1.08, y: -2 }}
                          animate={{ 
                            opacity: selectedFormula !== null && selectedFormula !== actualIndex ? 0.5 : 1
                          }}
                        >
                          <motion.span 
                            className={`text-sm font-mono font-bold text-${item.color}-400`}
                            animate={{ 
                              scale: selectedFormula === actualIndex ? [1, 1.1, 1] : 1
                            }}
                            transition={{ duration: 0.3 }}
                          >
                            {item.label}
                          </motion.span>
                          {item.sub && <span className="text-[9px] text-slate-500 block">{item.sub}</span>}
                        </motion.div>
                      );
                    })}
                  </div>
                  
                  {/* Expanded formula explanation */}
                  <div className="relative z-10 min-h-[4.5rem] flex items-center justify-center mt-1 mb-2 mx-4">
                    <AnimatePresence mode="wait">
                      {selectedFormula !== null ? (
                        <motion.div
                          key={selectedFormula}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="text-center max-w-md px-4 py-2.5 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-indigo-500/20"
                          style={{ 
                            boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)'
                          }}
                        >
                          <p className="text-xs text-slate-200 leading-relaxed">
                            {[
                              { expanded: 'Final trust score for user u — computed recursively from your graph\'s edge structure. Aggregates weighted contributions from all connected paths.', insight: 'Output range [0,1] normalized via softmax' },
                              { expanded: 'Summation over all valid paths from you to target user. Handles cycles via convergence bounds and path deduplication.', insight: 'Max path depth configurable (default: 6 hops)' },
                              { expanded: 'Attenuation factor α raised to hop depth d. Each hop multiplies trust by α, so distant connections contribute less. You control α.', insight: 'Typical values: 0.5 (strict) to 0.85 (trusting)' },
                              { expanded: 'Edge weight between nodes i→j. Derived from explicit attestations (follows, endorsements) plus implicit behavioral signals.', insight: 'Weights stored as signed events on relays' },
                            ][selectedFormula].expanded}
                          </p>
                          <p className="text-[10px] text-indigo-400 mt-1.5 font-medium">
                            ✦ {[
                              { insight: 'Output range [0,1] normalized via softmax' },
                              { insight: 'Max path depth configurable (default: 6 hops)' },
                              { insight: 'Typical values: 0.5 (strict) to 0.85 (trusting)' },
                              { insight: 'Weights stored as signed events on relays' },
                            ][selectedFormula].insight}
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-2"
                        >
                          <KeyControlIcon className="w-6 h-6 text-indigo-400/60" />
                          <p className="text-[10px] text-slate-500">
                            <span className="text-indigo-400/80 hidden sm:inline">Hover</span><span className="text-indigo-400/80 sm:hidden">Tap</span> to explore the formula
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}

              <div className="relative z-10 grid grid-cols-3 gap-2 pt-3 border-t border-slate-700/30">
                {[
                  { 
                    Icon: ShowEyeIcon, 
                    label: 'Transparent', 
                    desc: 'See exactly how scores are calculated',
                    expanded: mode === 'normal' 
                      ? "No black boxes. Every trust score shows its path: who vouched for whom, at what strength, through how many hops. You can trace exactly why someone has a 0.72 or a 0.31."
                      : "Full computation audit trail via NIP-XX. Export your score derivations as JSON. Verify calculations locally with open-source reference implementation."
                  },
                  { 
                    Icon: TunerIcon, 
                    label: 'Adjustable', 
                    desc: 'Tune settings to match your style',
                    expanded: mode === 'normal'
                      ? "Cautious by nature? Increase decay. Trust freely? Lower it. Your graph, your rules. Different contexts can have different settings — strict for finance, relaxed for music."
                      : "Configure hop decay factor (α), maximum path depth, attestation weighting curves, and context-specific trust domains. All parameters stored in your local profile."
                  },
                  { 
                    Icon: NetworkWebIcon, 
                    label: 'Portable', 
                    desc: 'Take your trust graph anywhere',
                    expanded: mode === 'normal'
                      ? "Your trust network isn't locked in one app. Export it, import it elsewhere, or let multiple apps read from the same source. Your reputation travels with you."
                      : "Standards-based export via NIP-XX. Interoperable with any compliant Nostr client. Your social graph lives on relays you control, not corporate servers."
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className={`flex flex-col items-center text-center cursor-pointer transition-all rounded-xl px-2 py-2 ${
                      selectedFeature === i 
                        ? 'bg-indigo-500/15 border border-indigo-400/40' 
                        : 'hover:bg-slate-800/40'
                    }`}
                    onMouseEnter={() => setSelectedFeature(i)}
                    onMouseLeave={() => setSelectedFeature(null)}
                    whileHover={{ scale: 1.03, y: -2 }}
                    animate={{ 
                      opacity: selectedFeature !== null && selectedFeature !== i ? 0.5 : 1
                    }}
                  >
                    <motion.div
                      animate={{ 
                        scale: selectedFeature === i ? [1, 1.15, 1] : 1
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <item.Icon className={`w-4 h-4 mb-1 transition-colors ${selectedFeature === i ? 'text-indigo-300' : 'text-indigo-400'}`} />
                    </motion.div>
                    <span className={`text-[11px] font-medium transition-colors ${selectedFeature === i ? 'text-white' : 'text-slate-300'}`}>{item.label}</span>
                    <span className="text-[9px] text-slate-500 leading-tight mt-0.5">{item.desc}</span>
                  </motion.div>
                ))}
              </div>
              
              {/* Expanded feature explanation */}
              <div className="relative z-10 h-16 flex items-center justify-center mt-2 mx-4">
                <AnimatePresence mode="wait">
                  {selectedFeature !== null ? (
                    <motion.div
                      key={selectedFeature}
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                      className="text-center max-w-sm px-4 py-2 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-indigo-500/20"
                      style={{ 
                        boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)'
                      }}
                    >
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {[
                          { 
                            expanded: mode === 'normal' 
                              ? "Every trust score shows its path: who vouched, at what strength, through how many hops."
                              : "Full audit trail via NIP-XX. Export derivations as JSON. Verify locally."
                          },
                          { 
                            expanded: mode === 'normal'
                              ? "Cautious? Increase decay. Trust freely? Lower it. Different contexts, different settings."
                              : "Configure decay factor, path depth, and weighting curves. Stored in your profile."
                          },
                          { 
                            expanded: mode === 'normal'
                              ? "Export your trust network, import elsewhere. Your reputation travels with you."
                              : "Standards-based export. Your graph lives on relays you control."
                          },
                        ][selectedFeature].expanded}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.p 
                      className="text-[10px] text-slate-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.4, 0.7, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <span className="hidden sm:inline">Hover</span><span className="sm:hidden">Tap</span> to explore features
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Computation Divider */}
          <div className="flex items-center justify-center gap-4 my-8">
            <motion.div 
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(to right, transparent, rgba(99, 102, 241, 0.3), rgba(100, 116, 139, 0.5))' }}
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
            <motion.div 
              className="flex items-center gap-1 px-4 py-2 bg-slate-900/70 border border-indigo-500/20 rounded-full backdrop-blur-sm overflow-hidden"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
              style={{ boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)' }}
            >
              {['Σ', '→', 'α', '×', 'T(u)'].map((symbol, i) => (
                <motion.span 
                  key={i}
                  className={`text-[10px] font-mono ${
                    symbol === 'Σ' ? 'text-indigo-400' :
                    symbol === 'α' ? 'text-violet-400' :
                    symbol === 'T(u)' ? 'text-emerald-400' :
                    'text-slate-500'
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    scale: [1, 1.2, 1],
                  }}
                  transition={{ 
                    opacity: { delay: 0.4 + i * 0.1, duration: 0.3 },
                    y: { delay: 0.4 + i * 0.1, duration: 0.3 },
                    scale: { delay: 0.6 + i * 0.15, duration: 0.4, repeat: Infinity, repeatDelay: 2 }
                  }}
                >
                  {symbol}
                </motion.span>
              ))}
            </motion.div>
            <motion.div 
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(to right, rgba(100, 116, 139, 0.5), rgba(139, 92, 246, 0.3), transparent)' }}
              initial={{ scaleX: 0, originX: 1 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </div>

          {mode === 'power' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-16"
            >
              <div className="text-center mb-8">
                <h2 
                  className="text-2xl font-bold text-white mb-2"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Interactive Parameter Tuning
                </h2>
                <p className="text-sm text-slate-400">
                  See how different settings affect trust propagation
                </p>
              </div>

              <div 
                className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 backdrop-blur-md max-w-3xl mx-auto overflow-hidden"
                style={{ 
                  boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)'
                }}
              >
                {/* Background effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
                <motion.div 
                  className="absolute -top-20 -right-20 w-48 h-48 bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 rounded-full blur-3xl pointer-events-none"
                  animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.15, 1] }}
                  transition={{ duration: 5, repeat: Infinity }}
                />
                <motion.div 
                  className="absolute -bottom-16 -left-16 w-40 h-40 bg-gradient-to-br from-violet-500/15 to-indigo-500/20 rounded-full blur-3xl pointer-events-none"
                  animate={{ opacity: [0.3, 0.5, 0.3], scale: [1.1, 1, 1.1] }}
                  transition={{ duration: 5, repeat: Infinity, delay: 2.5 }}
                />
                
                {/* Top accent */}
                <motion.div 
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent rounded-full"
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Computation grid */}
                <div 
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                  }}
                />

                <div className="relative z-10">
                  {/* Brief smart explanation - dynamic */}
                  <div className="text-center mb-5">
                    <p className="text-[11px] text-slate-400 max-w-md mx-auto leading-relaxed">
                      Trust decays exponentially: each hop multiplies by <span className="font-mono text-emerald-400">α</span>. 
                      At <span className="font-mono text-emerald-400">α={attenuation.toFixed(2)}</span> over <span className="font-mono text-violet-400">{hops} hop{hops > 1 ? 's' : ''}</span>, 
                      {hops === 1 ? ' a direct friend' : hops === 2 ? ' a friend-of-friend' : ` a ${hops}-hop connection`} contributes <motion.span 
                        className="font-mono text-indigo-400"
                        key={`${attenuation}-${hops}`}
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 1 }}
                      >{Math.round(Math.pow(attenuation, hops) * 100)}%</motion.span> of direct trust.
                    </p>
                  </div>
                  
                  {/* Compact controls row */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3 sm:gap-6 mb-6">
                    {/* Attenuation control */}
                    <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-slate-950/25 border border-slate-700/40" data-testid="control-attenuation">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">α =</span>
                        <motion.span
                          className="text-lg font-mono font-bold text-emerald-400"
                          key={attenuation}
                          initial={{ scale: 1.2, color: '#34d399' }}
                          animate={{ scale: 1, color: '#34d399' }}
                        >
                          {attenuation.toFixed(2)}
                        </motion.span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="0.95"
                        step="0.05"
                        value={attenuation}
                        onChange={(e) => setAttenuation(parseFloat(e.target.value))}
                        className="w-40 sm:w-24 h-2 bg-slate-700/70 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        data-testid="range-attenuation"
                      />
                    </div>

                    {/* Hops control */}
                    <div className="flex items-center justify-between sm:justify-start gap-3 px-3 py-2 rounded-xl bg-slate-950/25 border border-slate-700/40" data-testid="control-hops">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">d =</span>
                        <motion.span
                          className="text-lg font-mono font-bold text-violet-400"
                          key={hops}
                          initial={{ scale: 1.2 }}
                          animate={{ scale: 1 }}
                        >
                          {hops}
                        </motion.span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={hops}
                        onChange={(e) => setHops(parseInt(e.target.value))}
                        className="w-40 sm:w-20 h-2 bg-slate-700/70 rounded-lg appearance-none cursor-pointer accent-violet-500"
                        data-testid="range-hops"
                      />
                    </div>
                  </div>

                  {/* Visual decay chain */}
                  <div className="flex items-center justify-center gap-1 mb-5 flex-wrap">
                    {Array.from({ length: hops + 1 }, (_, i) => {
                      const score = Math.pow(attenuation, i);
                      const size = 32 + (1 - i / Math.max(hops, 1)) * 10;
                      return (
                        <div key={i} className="flex items-center shrink-0">
                          <motion.div
                            className="flex flex-col items-center"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.08 }}
                          >
                            <motion.div 
                              className="rounded-full flex items-center justify-center font-mono text-[10px] font-bold border-2 relative overflow-hidden"
                              style={{ 
                                width: size, 
                                height: size,
                                borderColor: i === 0 ? 'rgba(52, 211, 153, 0.6)' : `rgba(139, 92, 246, ${0.6 - i * 0.1})`,
                                background: i === 0 
                                  ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(16, 185, 129, 0.1))'
                                  : `linear-gradient(135deg, rgba(139, 92, 246, ${0.2 - i * 0.03}), rgba(99, 102, 241, ${0.1 - i * 0.02}))`
                              }}
                              animate={{ 
                                boxShadow: i === 0 
                                  ? ['0 0 12px rgba(52, 211, 153, 0.3)', '0 0 20px rgba(52, 211, 153, 0.5)', '0 0 12px rgba(52, 211, 153, 0.3)']
                                  : undefined
                              }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <span className={i === 0 ? 'text-emerald-400' : 'text-violet-300'}>
                                {score.toFixed(2)}
                              </span>
                            </motion.div>
                            <span className="text-[8px] text-slate-500 mt-1">
                              {i === 0 ? 'you' : `h${i}`}
                            </span>
                          </motion.div>
                          {i < hops && (
                            <motion.div 
                              className="flex items-center mx-1"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.08 + 0.05 }}
                            >
                              <motion.div
                                className="w-4 h-px bg-gradient-to-r from-violet-500/60 to-violet-500/30"
                                animate={{ opacity: [0.4, 0.8, 0.4] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                              />
                              <span className="text-[8px] text-slate-600 mx-0.5">×α</span>
                              <motion.div
                                className="w-4 h-px bg-gradient-to-r from-violet-500/30 to-violet-500/60"
                                animate={{ opacity: [0.4, 0.8, 0.4] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 + 0.3 }}
                              />
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact stats row */}
                  <div className="grid grid-cols-1 sm:flex sm:items-center sm:justify-center gap-2 sm:gap-4 pt-4 border-t border-slate-700/40">
                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                      <span className="text-[9px] text-slate-500">T(u) at d={hops}</span>
                      <motion.span
                        className="text-sm font-mono font-bold text-indigo-400"
                        key={`${attenuation}-${hops}`}
                        initial={{ color: '#818cf8' }}
                        animate={{ color: '#a5b4fc' }}
                        transition={{ duration: 0.3 }}
                      >
                        {Math.pow(attenuation, hops).toFixed(4)}
                      </motion.span>
                    </div>

                    <div className="hidden sm:block w-px h-4 bg-slate-700/50" />

                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                      <span className="text-[9px] text-slate-500">reach</span>
                      <span className="text-sm font-mono text-amber-400/80">
                        ~{Math.pow(150, hops).toLocaleString()}
                      </span>
                    </div>

                    <div className="hidden sm:block w-px h-4 bg-slate-700/50" />

                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30 overflow-x-auto">
                      <span className="text-[9px] text-slate-500 shrink-0">formula</span>
                      <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap">
                        α<sup>d</sup> = {attenuation}<sup>{hops}</sup>
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Bottom decorative element */}
                <motion.div 
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-16"
          >
            <div className="text-center mb-8">
              <motion.div 
                className="inline-flex items-center gap-3 mb-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <motion.div 
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 overflow-hidden"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                >
                  <img src={showTrustImage} alt="Show Trust" className="w-full h-full object-cover" />
                </motion.div>
                <h2 
                  className="text-2xl md:text-3xl lg:text-4xl font-bold text-white"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Show <span className="text-slate-500 font-normal mx-1 md:mx-2">vs</span> Tell
                </h2>
                <motion.div 
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 overflow-hidden"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
                >
                  <img src={tellTrustImage} alt="Tell Trust" className="w-full h-full object-cover" />
                </motion.div>
              </motion.div>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-3">
                {mode === 'normal' 
                  ? "Two fundamental ways to express trust in a decentralized network."
                  : "Implicit behavioral signals vs explicit semantic attestations."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                {activeShowTell !== 'both' && !computingCard && (
                  <motion.button
                    onClick={() => {
                      setIsComputing(true);
                      setComputingCard('both');
                      setTimeout(() => {
                        setActiveShowTell('both');
                        setTimeout(() => {
                          setIsComputing(false);
                          setComputingCard(null);
                        }, 400);
                      }, 600);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 via-indigo-500/20 to-violet-500/20 border border-indigo-500/30 rounded-full hover:border-indigo-400/50 transition-all"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    animate={{ 
                      boxShadow: ['0 0 0 0 rgba(99, 102, 241, 0)', '0 0 12px rgba(99, 102, 241, 0.2)', '0 0 0 0 rgba(99, 102, 241, 0)']
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CompareIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-[11px] font-medium text-white">Reveal Both</span>
                  </motion.button>
                )}
                {activeShowTell === 'both' && (
                  <motion.button
                    onClick={() => setActiveShowTell(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-600/50 rounded-full hover:border-slate-500/50 transition-all"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="text-[11px] text-slate-400">Reset</span>
                  </motion.button>
                )}
              </div>
              {activeShowTell === null && (
                <motion.p 
                  className="text-[10px] text-slate-500"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Or tap cards individually to explore
                </motion.p>
              )}
            </div>

            <motion.div 
              className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 border border-indigo-500/30 rounded-3xl p-8 backdrop-blur-xl max-w-3xl mx-auto overflow-hidden"
              initial={{ 
                boxShadow: '0 8px 40px rgba(99, 102, 241, 0.2), 0 0 80px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
              }}
              whileHover={{ 
                boxShadow: '0 12px 50px rgba(99, 102, 241, 0.3), 0 0 100px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)'
              }}
              transition={{ duration: 0.4 }}
            >
              {/* Deep space gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-violet-900/10 to-purple-900/20 pointer-events-none" />
              
              {/* Star field particles */}
              {[...Array(30)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-0.5 h-0.5 bg-white rounded-full pointer-events-none"
                  style={{
                    left: `${(i * 37 + 10) % 100}%`,
                    top: `${(i * 23 + 5) % 100}%`,
                  }}
                  animate={{ 
                    opacity: [0.2, 0.8, 0.2],
                    scale: [0.8, 1.2, 0.8]
                  }}
                  transition={{ 
                    duration: 2 + (i % 3), 
                    repeat: Infinity, 
                    delay: i * 0.15,
                    ease: "easeInOut"
                  }}
                />
              ))}
              
              {/* Floating mathematical symbols */}
              {['∫', 'Σ', 'α', 'π', '∞', 'Δ', 'λ', '∂'].map((sym, i) => (
                <motion.span
                  key={i}
                  className="absolute text-indigo-400/20 font-mono pointer-events-none select-none"
                  style={{
                    left: `${10 + (i * 12)}%`,
                    top: `${15 + (i * 10) % 70}%`,
                    fontSize: `${12 + (i % 3) * 6}px`
                  }}
                  animate={{ 
                    opacity: [0.1, 0.3, 0.1],
                    y: [0, -8, 0],
                    rotate: [0, 5, 0]
                  }}
                  transition={{ 
                    duration: 6 + i, 
                    repeat: Infinity, 
                    delay: i * 0.8,
                    ease: "easeInOut"
                  }}
                >
                  {sym}
                </motion.span>
              ))}
              
              {/* Nebula glow orbs */}
              <motion.div 
                className="absolute -top-32 -right-32 w-72 h-72 bg-gradient-to-br from-violet-500/25 to-purple-600/20 rounded-full blur-3xl pointer-events-none"
                animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, 15, 0], y: [0, -15, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div 
                className="absolute -bottom-32 -left-32 w-72 h-72 bg-gradient-to-br from-indigo-500/20 to-blue-600/25 rounded-full blur-3xl pointer-events-none"
                animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1], x: [0, -15, 0], y: [0, 15, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 4 }}
              />
              <motion.div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-radial from-indigo-500/15 via-violet-500/10 to-transparent rounded-full blur-2xl pointer-events-none"
                animate={{ opacity: [0.2, 0.4, 0.2], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              />
              
              {/* Computation grid overlay */}
              <div 
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{
                  backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.4) 1px, transparent 1px)',
                  backgroundSize: '30px 30px'
                }}
              />
              
              {/* Glowing edge lines */}
              <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent" />
              <div className="absolute bottom-0 left-1/3 right-1/3 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />
              
              {/* Animated corner brackets */}
              <motion.div 
                className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-violet-400/40 rounded-tr-2xl pointer-events-none"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div 
                className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-indigo-400/40 rounded-bl-2xl pointer-events-none"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              />
              
              <div className="relative z-10 sm:flex sm:items-center sm:justify-center gap-2 mb-6">
                {/* Mobile: 3 on first row, 2 centered on second row */}
                <div className="grid grid-cols-3 gap-2 sm:hidden mb-2">
                  {trustScenarios.slice(0, 3).map((s, i) => {
                    const IconComponent = s.icon === 'users' ? Users : s.icon === 'briefcase' ? Briefcase : s.icon === 'music' ? Music : s.icon === 'heart' ? Heart : Compass;
                    const isActive = selectedScenario === i;
                    return (
                      <motion.button
                        key={s.id}
                        onClick={() => handleScenarioChange(i)}
                        className={`relative flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[10px] font-semibold transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border border-violet-400/50 text-white shadow-lg shadow-violet-500/30' 
                            : 'bg-slate-800/60 border border-slate-600/50 text-slate-300 hover:text-white hover:border-violet-400/50 hover:bg-slate-700/60'
                        }`}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        style={isActive ? { boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)' } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                      >
                        {isActive && (
                          <motion.div 
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20"
                            layoutId="activeScenario"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <IconComponent className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-blue-100' : ''}`} />
                        <span className="relative z-10">{s.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-2 sm:hidden">
                  {trustScenarios.slice(3).map((s, idx) => {
                    const i = idx + 3;
                    const IconComponent = s.icon === 'users' ? Users : s.icon === 'briefcase' ? Briefcase : s.icon === 'music' ? Music : s.icon === 'heart' ? Heart : Compass;
                    const isActive = selectedScenario === i;
                    return (
                      <motion.button
                        key={s.id}
                        onClick={() => handleScenarioChange(i)}
                        className={`relative flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-semibold transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border border-violet-400/50 text-white shadow-lg shadow-violet-500/30' 
                            : 'bg-slate-800/60 border border-slate-600/50 text-slate-300 hover:text-white hover:border-violet-400/50 hover:bg-slate-700/60'
                        }`}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        style={isActive ? { boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)' } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                      >
                        {isActive && (
                          <motion.div 
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20"
                            layoutId="activeScenario"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <IconComponent className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-blue-100' : ''}`} />
                        <span className="relative z-10">{s.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {/* Desktop: all in one row */}
                <div className="hidden sm:flex sm:items-center sm:justify-center gap-2">
                  {trustScenarios.map((s, i) => {
                    const IconComponent = s.icon === 'users' ? Users : s.icon === 'briefcase' ? Briefcase : s.icon === 'music' ? Music : s.icon === 'heart' ? Heart : Compass;
                    const isActive = selectedScenario === i;
                    return (
                      <motion.button
                        key={s.id}
                        onClick={() => handleScenarioChange(i)}
                        className={`relative flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                          isActive 
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border border-violet-400/50 text-white shadow-lg shadow-violet-500/30' 
                            : 'bg-slate-800/60 border border-slate-600/50 text-slate-300 hover:text-white hover:border-violet-400/50 hover:bg-slate-700/60'
                        }`}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        style={isActive ? { boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)' } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                      >
                        {isActive && (
                          <motion.div 
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/20 to-indigo-500/20"
                            layoutId="activeScenario"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <IconComponent className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-blue-100' : ''}`} />
                        <span className="relative z-10">{s.label}</span>
                        {isActive && (
                          <motion.div 
                            className="absolute -bottom-px left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                            initial={{ opacity: 0, scaleX: 0 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                          />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
              
              <AnimatePresence mode="popLayout">
                <motion.div 
                  key={scenario.id}
                  className="relative z-10 flex items-center justify-between sm:justify-center sm:gap-4 mb-4 sm:mb-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <motion.div 
                    className="flex-1 sm:flex-initial flex items-center gap-2 sm:gap-3 bg-slate-800/70 border border-slate-600/50 rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-2 sm:py-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}
                  >
                    <div className="relative flex-shrink-0">
                      <motion.div 
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/50 to-cyan-400/40 blur-md"
                        animate={{ opacity: [0.5, 0.9, 0.5] }}
                        transition={{ duration: 3, repeat: Infinity }}
                      />
                      <img 
                        src={scenario.personA.avatar} 
                        alt={scenario.personA.name} 
                        className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-emerald-400/80 object-cover shadow-lg shadow-emerald-500/30"
                      />
                      <motion.div 
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full border-2 border-slate-900"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                    <div className="text-left">
                      <p className="text-xs sm:text-sm font-semibold text-white">{scenario.personA.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-emerald-400 font-medium">{scenario.personA.role}</p>
                    </div>
                  </motion.div>
                  
                  <motion.div 
                    className="hidden sm:flex flex-col items-center gap-1 px-4 flex-shrink-0"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center gap-1">
                      <motion.div 
                        className="w-8 h-0.5 bg-gradient-to-r from-emerald-400/70 to-cyan-400/70 rounded-full"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <motion.div 
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/50 flex items-center justify-center"
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.35)' }}
                      >
                        <NetworkWebIcon className="w-4 h-4 text-violet-400" />
                      </motion.div>
                      <motion.div 
                        className="w-8 h-0.5 bg-gradient-to-r from-indigo-400/70 to-violet-400/70 rounded-full"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">trust network</span>
                  </motion.div>
                  <span className="text-slate-500 sm:hidden flex-shrink-0 px-1">→</span>
                  
                  <motion.div 
                    className="flex-1 sm:flex-initial flex items-center justify-end gap-2 sm:gap-3 bg-slate-800/70 border border-slate-600/50 rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-2 sm:py-3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}
                  >
                    <div className="text-right">
                      <p className="text-xs sm:text-sm font-semibold text-white">{scenario.personB.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-violet-400 font-medium">{scenario.personB.role}</p>
                    </div>
                    <div className="relative flex-shrink-0">
                      <motion.div 
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-400/50 to-purple-400/40 blur-md"
                        animate={{ opacity: [0.5, 0.9, 0.5] }}
                        transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                      />
                      <img 
                        src={scenario.personB.avatar} 
                        alt={scenario.personB.name} 
                        className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-violet-400/80 object-cover shadow-lg shadow-violet-500/30"
                      />
                      <motion.div 
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gradient-to-br from-violet-400 to-violet-500 rounded-full border-2 border-slate-900"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              </AnimatePresence>

              <div className="relative z-10 grid md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {isComputing && (
                    <motion.div
                      className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm rounded-xl"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center gap-2">
                          {['Σ', '∫', 'α', '×', 'T(u)', '→'].map((sym, i) => (
                            <motion.span
                              key={i}
                              className="text-lg font-mono"
                              style={{ color: i % 2 === 0 ? '#a78bfa' : '#818cf8' }}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
                              transition={{ 
                                duration: 0.8, 
                                delay: i * 0.1,
                                times: [0, 0.2, 0.8, 1]
                              }}
                            >
                              {sym}
                            </motion.span>
                          ))}
                        </div>
                        <motion.div 
                          className="flex items-center gap-1.5"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                        >
                          <motion.div
                            className="w-1.5 h-1.5 bg-violet-400 rounded-full"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 0.4, repeat: 2 }}
                          />
                          <span className="text-[10px] text-slate-400 font-mono">recalculating trust scores...</span>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <motion.button
                  onClick={() => handleCardReveal('show')}
                  animate={{ 
                    opacity: (computingCard === 'show' || computingCard === 'both') ? 0.3 : 1, 
                    filter: (computingCard === 'show' || computingCard === 'both') ? 'blur(2px)' : 'blur(0px)' 
                  }}
                  transition={{ duration: 0.2 }}
                  className={`relative p-5 rounded-xl text-left transition-all overflow-hidden group ${
                    activeShowTell === 'show' || activeShowTell === 'both'
                      ? 'bg-emerald-900/30 border-2 border-emerald-400/50'
                      : 'bg-slate-800/50 border border-slate-600/50 hover:border-emerald-400/40 hover:bg-slate-800/70'
                  }`}
                  whileHover={{ scale: 1.02, y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ 
                    boxShadow: activeShowTell === 'show' || activeShowTell === 'both' 
                      ? '0 4px 20px rgba(16, 185, 129, 0.25), inset 0 1px 0 rgba(255,255,255,0.05)' 
                      : 'inset 0 1px 0 rgba(255,255,255,0.03)' 
                  }}
                >
                  <AnimatePresence>
                    {computingCard === 'show' && (
                      <motion.div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm rounded-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="flex items-center gap-2">
                          {['Σ', '→', 'T(s)'].map((sym, i) => (
                            <motion.span
                              key={i}
                              className="text-base font-mono text-emerald-400"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -8] }}
                              transition={{ duration: 0.5, delay: i * 0.12, times: [0, 0.2, 0.7, 1] }}
                            >
                              {sym}
                            </motion.span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!(activeShowTell === 'show' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      animate={{ 
                        boxShadow: ['inset 0 0 0 1px rgba(16, 185, 129, 0)', 'inset 0 0 0 2px rgba(16, 185, 129, 0.4)', 'inset 0 0 0 1px rgba(16, 185, 129, 0)']
                      }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    />
                  )}
                  {(activeShowTell === 'show' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    />
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center overflow-hidden"
                        animate={!(activeShowTell === 'show' || activeShowTell === 'both') ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                      >
                        <img src={showTrustImage} alt="Show Trust" className="w-full h-full object-cover" />
                      </motion.div>
                      <div>
                        <span className="text-sm font-semibold text-white block">Show Trust</span>
                        <span className="text-[10px] text-emerald-400">Behavioral signals</span>
                      </div>
                    </div>
                    {!(activeShowTell === 'show' || activeShowTell === 'both') && (
                      <motion.div
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 border border-emerald-400/30 rounded-full"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <span className="text-[9px] text-emerald-400 font-medium">Tap to reveal</span>
                        <ChevronRight className="w-3 h-3 text-emerald-400" />
                      </motion.div>
                    )}
                  </div>
                  <AnimatePresence mode="popLayout">
                    {(activeShowTell === 'show' || activeShowTell === 'both') ? (
                      <motion.div
                        key={`show-${scenario.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2.5"
                      >
                        {scenario.showActions.map((action, idx) => {
                          const IconComponent = action.icon === 'heart' ? FollowHeartIcon : action.icon === 'zap' ? ZapBoltIcon : RepostIcon;
                          const colorClass = action.color === 'emerald' ? 'text-emerald-400' : action.color === 'amber' ? 'text-amber-400' : 'text-sky-400';
                          return (
                            <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                              <IconComponent className={`w-4 h-4 ${colorClass} flex-shrink-0`} />
                              <span>{action.text}</span>
                            </div>
                          );
                        })}
                        <div className="pt-3 mt-3 border-t border-emerald-500/30 flex items-start gap-2">
                          <ActionProofIcon className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-slate-400 leading-relaxed">{scenario.showInsight}</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        className="flex items-center gap-2 py-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="flex -space-x-1">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                            <FollowHeartIcon className="w-2.5 h-2.5 text-emerald-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
                            <ZapBoltIcon className="w-2.5 h-2.5 text-amber-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
                            <RepostIcon className="w-2.5 h-2.5 text-sky-400" />
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400">{scenario.showActions.length} action types</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>

                <motion.button
                  onClick={() => handleCardReveal('tell')}
                  animate={{ 
                    opacity: (computingCard === 'tell' || computingCard === 'both') ? 0.3 : 1, 
                    filter: (computingCard === 'tell' || computingCard === 'both') ? 'blur(2px)' : 'blur(0px)' 
                  }}
                  transition={{ duration: 0.2 }}
                  className={`relative p-5 rounded-xl text-left transition-all overflow-hidden group ${
                    activeShowTell === 'tell' || activeShowTell === 'both'
                      ? 'bg-violet-900/30 border-2 border-violet-400/50'
                      : 'bg-slate-800/50 border border-slate-600/50 hover:border-violet-400/40 hover:bg-slate-800/70'
                  }`}
                  whileHover={{ scale: 1.02, y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ 
                    boxShadow: activeShowTell === 'tell' || activeShowTell === 'both' 
                      ? '0 4px 20px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255,255,255,0.05)' 
                      : 'inset 0 1px 0 rgba(255,255,255,0.03)' 
                  }}
                >
                  <AnimatePresence>
                    {computingCard === 'tell' && (
                      <motion.div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm rounded-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="flex items-center gap-2">
                          {['α', '×', 'A(t)'].map((sym, i) => (
                            <motion.span
                              key={i}
                              className="text-base font-mono text-violet-400"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -8] }}
                              transition={{ duration: 0.5, delay: i * 0.12, times: [0, 0.2, 0.7, 1] }}
                            >
                              {sym}
                            </motion.span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!(activeShowTell === 'tell' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      animate={{ 
                        boxShadow: ['inset 0 0 0 1px rgba(139, 92, 246, 0)', 'inset 0 0 0 2px rgba(139, 92, 246, 0.4)', 'inset 0 0 0 1px rgba(139, 92, 246, 0)']
                      }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
                    />
                  )}
                  {(activeShowTell === 'tell' || activeShowTell === 'both') && (
                    <motion.div 
                      className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    />
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-400/40 flex items-center justify-center overflow-hidden"
                        animate={!(activeShowTell === 'tell' || activeShowTell === 'both') ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, delay: 0.3 }}
                      >
                        <img src={tellTrustImage} alt="Tell Trust" className="w-full h-full object-cover" />
                      </motion.div>
                      <div>
                        <span className="text-sm font-semibold text-white block">Tell Trust</span>
                        <span className="text-[10px] text-violet-400">Explicit attestations</span>
                      </div>
                    </div>
                    {!(activeShowTell === 'tell' || activeShowTell === 'both') && (
                      <motion.div
                        className="flex items-center gap-1 px-2 py-1 bg-violet-500/15 border border-violet-400/30 rounded-full"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                      >
                        <span className="text-[9px] text-violet-400 font-medium">Tap to reveal</span>
                        <ChevronRight className="w-3 h-3 text-violet-400" />
                      </motion.div>
                    )}
                  </div>
                  <AnimatePresence mode="popLayout">
                    {(activeShowTell === 'tell' || activeShowTell === 'both') ? (
                      <motion.div
                        key={`tell-${scenario.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2.5"
                      >
                        {scenario.tellActions.map((action, idx) => {
                          const IconComponent = action.icon === 'quote' ? QuoteBubbleIcon : action.icon === 'star' ? StarRatingIcon : TagLabelIcon;
                          return (
                            <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-300">
                              <IconComponent className="w-4 h-4 text-violet-400 flex-shrink-0" />
                              <span>{action.text}</span>
                            </div>
                          );
                        })}
                        <div className="pt-3 mt-3 border-t border-violet-500/30 flex items-start gap-2">
                          <ExplicitContextIcon className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-slate-400 leading-relaxed">{scenario.tellInsight}</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        className="flex items-center gap-2 py-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="flex -space-x-1">
                          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <QuoteBubbleIcon className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <StarRatingIcon className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                            <TagLabelIcon className="w-2.5 h-2.5 text-violet-400" />
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400">{scenario.tellActions.length} attestation types</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>

              {activeShowTell === 'both' && (
                <motion.div 
                  className="relative z-10 mt-5 pt-4 border-t border-indigo-500/30"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/15 border border-indigo-400/30 rounded-full">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                      <p className="text-[10px] text-indigo-300 font-medium">
                        When Show + Tell combine, real-world applications unlock
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {scenario.applications.map((app, idx) => (
                      <motion.div
                        key={idx}
                        className="bg-slate-800/60 border border-slate-600/50 rounded-lg p-4 group hover:border-indigo-400/50 transition-colors"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + idx * 0.1 }}
                        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center">
                            <NetworkWebIcon className="w-3 h-3 text-indigo-400" />
                          </div>
                          <h4 className="text-xs font-semibold text-white">{app.title}</h4>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{app.description}</p>
                      </motion.div>
                    ))}
                  </div>
                  
                  <motion.div 
                    className="mt-6 pt-5 border-t border-indigo-500/20"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
                  >
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                      <span className="text-[9px] uppercase tracking-widest text-amber-400/80 font-medium">The Outcome</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                    </div>
                    <p className="text-sm text-slate-300 text-center leading-relaxed max-w-lg mx-auto">
                      {scenario.id === 'social' && "Genuine connections compound. Alice discovered Bob through a friend's zap — now they're building together."}
                      {scenario.id === 'business' && "Trust reduces friction. The startup found a vetted agency through their network — shipped faster, paid in sats."}
                      {scenario.id === 'music' && "Discovery travels through trust. A friend's endorsement led to a new favorite artist — value flowed back to the creator."}
                      {scenario.id === 'recommendations' && "Quality surfaces organically. The foodie's recommendation became dinner — the restaurant earned a loyal regular."}
                      {scenario.id === 'wellness' && "Healing happens outside the system. When insurance gatekeepers said no, Marcus found Dr. Chen through someone who'd walked the same path — and got his life back."}
                    </p>
                    <div className="flex justify-center mt-4">
                      <img src="/nostr-ostrich.gif" alt="Ostrich running" className="w-10 h-10 object-contain" />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>

          {/* Galaxy Divider */}
          <div className="relative flex items-center justify-center my-10">
            {/* Left nebula trail */}
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-indigo-400/30" />
            
            {/* Central galaxy icon */}
            <div className="relative mx-3 flex items-center justify-center opacity-40">
              <svg 
                viewBox="0 0 64 64" 
                xmlns="http://www.w3.org/2000/svg" 
                className="w-6 h-6"
              >
                <g fill="#818cf8">
                  <path d="m32.81 7.54a2.9 2.9 0 0 0 -.5 3.92c1 1.75 4.79 1.54 4.59-1.5s-2.9-3.56-4.09-2.42zm2.93 2.33a1.37 1.37 0 0 1 -2.51.82 1.59 1.59 0 0 1 .28-2.14c.64-.62 2.11-.34 2.23 1.32zm-29.68 15.63c.21 0 1 .29 1.46-.09s.17-.37.25-1.54a26.66 26.66 0 0 1 1.83-6.62c1-2.13 4.92-6.79 10.38-9.34s11.92-2.62 17.83-1.16 12.09 6.62 15.19 11.66.46 14.92-1.29 18.88-9.71 8.58-15.71 8.83a16.45 16.45 0 0 1 -13.08-6c-2-2.71-3.84-9.46-1.34-14a9.93 9.93 0 0 1 8.63-5c1.75-.13 3.16 1.54 3.54 1.67a1.17 1.17 0 0 0 1.12-1.42c-.2-.92-3.62-3.58-10.7-.21s-6.17 10.25-5.77 13.3 2.08 11.2 12.5 13.12a21.83 21.83 0 0 0 20-6.46c2.25-2.58 5.59-7 5.46-15.62s-2.84-11.25-9.76-16.75-18-5.88-24-3.79-13.6 7.37-15.41 12.37-1.34 8.17-1.13 8.17zm2.88 8.62c-.42-1.79-1.94-2.61-3.34-1.91s-1.2 2.33-.33 3.79 4.08-.09 3.67-1.88zm-2.94 1.03c-.44-.74-.57-1.57.17-1.94a1.21 1.21 0 0 1 1.71 1c.21.9-1.43 1.69-1.88.94zm30.85-3.9c.8-5.71-4.58-5.9-6.79-5.38-5.41 1.29-4.79 6.59-2.71 8.63s8.71 2.5 9.5-3.25zm-6.29 2.54a3 3 0 0 1 -2.41-2.71 3.08 3.08 0 0 1 2.25-3.67c.93-.36 3.37-.12 4.2 1s.38 3.29.38 3.29-.5-.87-.63-.87-.66.17-.62.33a7.45 7.45 0 0 1 .54 1.59c-.08.2-.62.83-.75.66s-1.08-2.79-1.33-2.83-.79 0-.75.21 1.41 2.87 1.21 3.08-.75.38-.88.08-1-2.66-1.12-2.7-.92.2-.84.5.92 2 .75 2.04zm5.84 16.37c-1.42.84-1.88 2.5-1.13 4.55s5.17 2.41 5.79-.75a3.36 3.36 0 0 0 -4.66-3.8zm3.6 3.47c-.4 2-3.23 1.79-3.71.48s-.19-2.37.72-2.91a2.15 2.15 0 0 1 2.99 2.43zm-15.44-18.13c-1.46.71-1.21 2.33-.33 3.79s4.08-.08 3.67-1.88-1.9-2.61-3.34-1.91zm.4 2.94c-.44-.74-.57-1.57.17-1.93a1.2 1.2 0 0 1 1.71 1c.21.89-1.43 1.68-1.84.93zm24.6-18c0-1.88-2-3.16-3.16-2.3a2.25 2.25 0 0 0 -.55 3.25c.88 1.23 3.75.94 3.71-.93zm-2.62-1.37c.57-.43 1.55.21 1.57 1.14s-1.41 1.08-1.84.48a1.11 1.11 0 0 1 .27-1.6zm-31.62 9.24a1.71 1.71 0 0 0 -.41 2.48c.72 1 2.84.72 2.83-.7s-1.38-2.43-2.42-1.78zm1.51 1.68c-.15.73-1.09.88-1.46.36a.87.87 0 0 1 .21-1.27c.46-.35 1.4.18 1.25.91zm22.84 22.75c-1.38 1.09-.8 3 .54 3.71s3.08-.54 2.79-2.54-2-2.26-3.33-1.17zm2.34 2.09c-.29 1.29-1.84 1.36-2.2.41s.63-1.66 1.25-1.58 1.12.47.95 1.17z"/>
                </g>
              </svg>
            </div>
            
            {/* Right nebula trail */}
            <div className="flex-1 h-px bg-gradient-to-r from-indigo-400/30 via-violet-500/20 to-transparent" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-16 relative"
          >
            {/* FAQ container - matching "You Are In Control" style */}
            <div 
              className="relative bg-gradient-to-br from-indigo-500/15 via-slate-900/95 to-violet-500/15 border border-indigo-500/40 rounded-2xl p-6 backdrop-blur-md max-w-3xl mx-auto overflow-hidden"
              style={{ 
                boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 24px 80px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.07)'
              }}
            >
              {/* Network background */}
              <div 
                className="absolute inset-0 opacity-20"
                style={{ 
                  backgroundImage: `url(${networkBg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-950/60 to-slate-950/80" />
              <motion.div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent rounded-full"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              
              {/* Header */}
              <div className="relative z-10 text-center mb-8">
                <h2 
                  className="text-2xl font-bold bg-gradient-to-r from-white via-indigo-200 to-violet-200 bg-clip-text text-transparent mb-3"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Frequently Asked Questions
                </h2>
                <p className="text-sm text-slate-400 max-w-xl mx-auto">
                  {mode === 'normal' 
                    ? "Common concerns addressed honestly"
                    : "Technical deep-dives on implementation considerations"}
                </p>
              </div>

              {/* FAQ Items with staggered animation */}
              <div className="relative z-10 space-y-3 max-w-2xl mx-auto">
                {(faqExpanded ? faqs : faqs.slice(0, 4)).map((faq, i) => (
                  <motion.div
                    key={i}
                    className={`relative overflow-hidden rounded-xl transition-all duration-300 ${
                      expandedFaq === i 
                        ? 'bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-purple-500/10 border-2 border-indigo-400/40' 
                        : 'bg-slate-800/40 border border-slate-700/50 hover:border-indigo-400/30 hover:bg-slate-800/60'
                    }`}
                    initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    style={{ 
                      boxShadow: expandedFaq === i 
                        ? '0 4px 20px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)' 
                        : 'inset 0 1px 0 rgba(255,255,255,0.02)'
                    }}
                  >
                    {/* Animated border glow when not expanded */}
                    {expandedFaq !== i && (
                      <motion.div 
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        animate={{ 
                          boxShadow: ['inset 0 0 0 1px rgba(99, 102, 241, 0)', 'inset 0 0 0 1px rgba(99, 102, 241, 0.2)', 'inset 0 0 0 1px rgba(99, 102, 241, 0)']
                        }}
                        transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
                      />
                    )}
                    
                    {/* Top glow line when expanded */}
                    {expandedFaq === i && (
                      <motion.div 
                        className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                      />
                    )}
                    
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left group"
                      data-testid={`faq-${i}`}
                    >
                      <div className="flex items-center gap-3 pr-4">
                        <motion.div 
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all relative ${
                            expandedFaq === i 
                              ? 'bg-gradient-to-br from-indigo-500/40 to-violet-500/40 border border-indigo-400/60' 
                              : 'bg-slate-700/50 border border-slate-600/50 group-hover:bg-indigo-500/20 group-hover:border-indigo-400/30'
                          }`}
                          animate={expandedFaq === i 
                            ? { rotateY: [0, 180, 360], scale: [1, 1.15, 1] } 
                            : { scale: [1, 1.05, 1] }
                          }
                          transition={expandedFaq === i 
                            ? { duration: 0.5, ease: "easeOut" }
                            : { duration: 2, repeat: Infinity, delay: i * 0.2 }
                          }
                          style={{ transformStyle: 'preserve-3d' }}
                        >
                          {expandedFaq === i && (
                            <motion.div
                              className="absolute inset-0 rounded-lg pointer-events-none"
                              initial={{ scale: 1, opacity: 0.8 }}
                              animate={{ scale: 2, opacity: 0 }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              style={{ 
                                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)',
                              }}
                            />
                          )}
                          <AnimatePresence mode="wait">
                            {expandedFaq === i ? (
                              <motion.div
                                key="brain-icon"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.2, delay: 0.15 }}
                              >
                                <BrainLogo size={16} className="text-indigo-300" />
                              </motion.div>
                            ) : (
                              <motion.span 
                                key="number"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.2 }}
                                className="text-xs font-mono text-slate-400 group-hover:text-indigo-400"
                              >
                                {String(i + 1).padStart(2, '0')}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.div>
                        <span className={`text-sm font-medium transition-colors ${expandedFaq === i ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                          {faq.question}
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: expandedFaq === i ? 180 : 0 }}
                        transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          expandedFaq === i 
                            ? 'bg-indigo-500/30 border border-indigo-400/50' 
                            : 'bg-slate-700/50 border border-slate-600/50 group-hover:bg-indigo-500/20'
                        }`}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 ${expandedFaq === i ? 'text-indigo-300' : 'text-slate-400'}`} />
                      </motion.div>
                    </button>
                    <AnimatePresence>
                      {expandedFaq === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                          <div className="px-6 pb-5">
                            <motion.div 
                              className="pl-11 relative"
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 }}
                            >
                              {/* Connecting line */}
                              <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-indigo-500/40 to-transparent" />
                              
                              <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
                                {faq.answer[mode]}
                              </p>
                            </motion.div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
                
                {/* Expand/Collapse button */}
                {faqs.length > 4 && (
                  <motion.button
                    onClick={() => setFaqExpanded(!faqExpanded)}
                    className="w-full mt-4 py-3 px-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-400/40 hover:bg-slate-800/60 transition-all group flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    data-testid="button-faq-expand"
                  >
                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                      {faqExpanded ? 'Show less' : `Show ${faqs.length - 4} more questions`}
                    </span>
                    <motion.div
                      animate={{ rotate: faqExpanded ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-400" />
                    </motion.div>
                  </motion.button>
                )}
              </div>
              
              {/* Bottom decorative element */}
              <motion.div 
                className="relative z-10 mt-8 flex justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-px bg-gradient-to-r from-transparent to-indigo-500/40" />
                  <motion.div 
                    className="w-2 h-2 rounded-full bg-indigo-500/40"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <div className="w-8 h-px bg-gradient-to-l from-transparent to-indigo-500/40" />
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Simple Dots Divider */}
          <div className="flex items-center justify-center gap-3 my-10">
            <div className="w-1 h-1 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
            <div className="w-1 h-1 rounded-full bg-slate-600" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <motion.div 
              className="relative bg-gradient-to-br from-indigo-500/20 via-slate-900/95 to-violet-500/20 backdrop-blur-xl rounded-2xl p-6 overflow-hidden border border-indigo-500/50"
              initial={{ 
                boxShadow: '0 8px 40px rgba(99, 102, 241, 0.3), 0 16px 80px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
              }}
              animate={{ 
                boxShadow: [
                  '0 8px 40px rgba(99, 102, 241, 0.3), 0 16px 80px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                  '0 12px 60px rgba(99, 102, 241, 0.4), 0 24px 100px rgba(139, 92, 246, 0.28), 0 0 0 1px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  '0 8px 40px rgba(99, 102, 241, 0.3), 0 16px 80px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                ]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              whileHover={{ 
                y: -4,
                boxShadow: '0 20px 80px rgba(99, 102, 241, 0.5), 0 40px 120px rgba(139, 92, 246, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
              }}
            >
              {/* Network background */}
              <div 
                className="absolute inset-0 opacity-25"
                style={{ 
                  backgroundImage: `url(${networkBg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-950/50 to-slate-950/70" />
              
              {/* Extra glow orbs */}
              <motion.div 
                className="absolute -top-10 -left-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"
                animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.2, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              <motion.div 
                className="absolute -bottom-10 -right-10 w-40 h-40 bg-violet-500/20 rounded-full blur-3xl"
                animate={{ opacity: [0.3, 0.6, 0.3], scale: [1.2, 1, 1.2] }}
                transition={{ duration: 4, repeat: Infinity, delay: 2 }}
              />
              
              {/* Top glow line */}
              <motion.div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent rounded-full"
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              
              {/* Shooting stars - diagonal, coming down from different angles */}
              {[
                { startX: '10%', startY: '-5%', angle: 35, delay: 0 },
                { startX: '60%', startY: '-5%', angle: 45, delay: 4 },
                { startX: '30%', startY: '-5%', angle: 25, delay: 8 },
                { startX: '80%', startY: '-5%', angle: 55, delay: 12 },
              ].map((star, i) => (
                <motion.div
                  key={`shooting-star-${i}`}
                  className="absolute w-20 h-px pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), rgba(200,200,255,0.4), transparent)',
                    left: star.startX,
                    top: star.startY,
                    transform: `rotate(${star.angle}deg)`,
                    transformOrigin: 'left center',
                  }}
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  animate={{ 
                    x: [0, 300],
                    y: [0, 250],
                    opacity: [0, 0.8, 0.6, 0]
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity, 
                    repeatDelay: 10 + i * 2,
                    delay: star.delay,
                    ease: "linear"
                  }}
                />
              ))}
              
              {/* Twinkling stars */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.8 }}>
                {Array.from({ length: 20 }, (_, i) => (
                  <motion.circle
                    key={`cta-star-${i}`}
                    cx={`${8 + Math.random() * 84}%`}
                    cy={`${10 + Math.random() * 80}%`}
                    r={Math.random() * 1.2 + 0.5}
                    fill="white"
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: [0.2, 0.9, 0.2] }}
                    transition={{ duration: Math.random() * 2 + 1.5, repeat: Infinity, delay: Math.random() * 2 }}
                  />
                ))}
              </svg>

              <motion.div
                className="absolute top-1/2 left-1/2 w-40 h-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)' }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute top-1/2 left-1/2 w-56 h-56 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)' }}
                animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              />

              <div className="relative z-10 text-center">
                <h2 
                  className="text-xl font-bold text-white mb-2"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Ready to explore your trust network?
                </h2>
                <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">
                  {mode === 'normal' 
                    ? "See who your network trusts and discover new connections"
                    : "Compute your personalized trust scores with full parameter control"}
                </p>
                <motion.button
                  onClick={() => setLocation('/')}
                  className="px-5 py-2 text-sm font-medium text-indigo-300 rounded-lg transition-all inline-flex items-center gap-2 border border-indigo-500/40 hover:border-indigo-400/60 hover:text-white hover:bg-indigo-500/10"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  data-testid="button-get-started"
                >
                  Get Started
                  <NetworkWebIcon className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
          
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
