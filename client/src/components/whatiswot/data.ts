import selfAvatar from '@assets/generated_images/self_avatar_glowing_silhouette.png';
import friendAvatar from '@assets/generated_images/friendly_trusted_person_avatar.png';
import fofAvatar from '@assets/generated_images/distant_friend-of-friend_avatar.png';
import unknownAvatar from '@assets/generated_images/unknown_stranger_avatar_silhouette.png';
import socialAliceAvatar from '@assets/young_creative_woman_14461b61_1770965715586.jpg';
import socialBobAvatar from '@assets/young_man_profession_46072db4_1770965705548.jpg';
import businessClientAvatar from '@assets/stock_images/professional_man_wor_ca204bd6.jpg';
import businessVendorAvatar from '@assets/stock_images/red_brick_building_e_b5643b62.jpg';
import musicFanAvatar from '@assets/stock_images/music_fan_real_person.jpg';
import musicArtistAvatar from '@assets/stock_images/live_band_concert_st_a3f0f7e3.jpg';
import tasteFoodieAvatar from '@assets/stock_images/food_influencer_eati_33799fa5.jpg';
import tasteRestaurantAvatar from '@assets/stock_images/upscale_fine_dining__0f9e2af1.jpg';
import wellnessPatientAvatar from '@assets/generated_images/male_patient_portrait_headshot.png';
import wellnessNaturopathAvatar from '@assets/generated_images/naturopath_doctor_portrait_headshot.png';

export type UserMode = 'normal' | 'power';

export const floatingNodes = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 5 + Math.random() * 90,
  y: 5 + Math.random() * 90,
  size: Math.random() * 3 + 2,
  duration: Math.random() * 20 + 15,
  delay: Math.random() * 5,
}));

export const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 11], [0, 6], [2, 8], [4, 10]
];

export const calculations = [
  "trust_score: 0.94",
  "hops: 2 → 0.73",
  "attenuation: 0.85",
  "follows: 847",
  "wot_rank: #127",
  "sig: schnorr✓",
  "kind:3 verified",
  "npub1qx3f...ok",
];

export interface TrustScenarioAction {
  icon: string;
  text: string;
  color?: string;
}

export interface TrustScenario {
  id: string;
  label: string;
  icon: string;
  personA: { name: string; role: string; avatar: string };
  personB: { name: string; role: string; avatar: string };
  showActions: TrustScenarioAction[];
  tellActions: TrustScenarioAction[];
  showInsight: string;
  tellInsight: string;
  applications: { title: string; description: string }[];
}

export const trustScenarios: TrustScenario[] = [
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

export interface TrustNodeInfo {
  label: string;
  trust: string;
  size: string;
  color: string;
  textColor: string;
  glow: string;
  image: string;
  borderColor: string;
  explanation: string;
  insight: string;
}

export const trustNodeInfo: TrustNodeInfo[] = [
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

export interface WotFaq {
  question: string;
  answer: Record<UserMode, string>;
}

export const faqs: WotFaq[] = [
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
