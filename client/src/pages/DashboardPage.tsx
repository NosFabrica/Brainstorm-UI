import { useEffect, useState, useRef, useMemo } from "react";
import { getVerifiedThreshold } from "@/services/trustThreshold";
import amethystHeroImg from "../assets/amethyst-hero.webp";
import amethystLogoImg from "../assets/amethyst-logo.png";
import nostriaHeroImg from "../assets/nostria-hero.png";
import nostriaManifestoImg from "../assets/nostria-manifesto-overlay.png";
import nostriaTeaserImg from "../assets/nostria-teaser.png";
import nostriaIconImg from "../assets/nostria-icon.png";
import brainstormHeroImg from "@assets/image_1773159756760.png";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  User as UserIcon,
  Check,
  Loader2,
  TrendingUp,
  Users,
  UserPlus,
  UserMinus,
  VolumeX,
  ShieldAlert,
  Star,
  Home,
  Info,
  RefreshCw,
  Network,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Award,
  ExternalLink,
  Search,
  Settings as SettingsIcon,
  BookOpen,
  Smartphone,
  ArrowRight,
  Download,
  Keyboard,
  Code,
  Music,
  Palette,
  Bitcoin,
  Ban,
  Sparkles,
  CheckCircle2,
  Terminal,
  Mail,
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { BrainLogo } from "@/components/BrainLogo";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getCurrentUser, logout, updateCurrentUser, fetchProfile, fetchOutboxRelayList, applyProfileToUser, type NostrUser, isUsingBrainstorm } from "@/services/nostr";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { toPubkeys } from "../services/graphHelpers";
import { ActivateBrainstormModal } from "@/components/ActivateBrainstormModal";

import protocolDevImg from "@/assets/stock_images/protocol_dev.jpg";
import bitcoinImg from "@/assets/stock_images/bitcoin_network.jpg";
import digitalArtImg from "@/assets/stock_images/digital_art.jpg";
import musicSceneImg from "@/assets/stock_images/music_scene.jpg";

const ONBOARDING_SLIDES = [
  {
    title: "No Algorithm Overlords",
    subtitle: "Your network, your rules",
    content: "Traditional platforms use opaque algorithms to decide what you see. Brainstorm gives you algorithmic clarity.",
    detail: "Every score is explainable, traceable back through your network. You're in control.",
    tone: "from-emerald-500/20 via-teal-500/10 to-transparent",
  },
  {
    title: "The Extended Follows Network",
    subtitle: "More than just friends",
    content: "Your network isn't just who you follow. It's who they follow, and who they follow, ad infinitum.",
    detail: "We calculate trust across N hops. You'll be amazed at how vast your true network really is when you look beyond the surface.",
    tone: "from-indigo-500/20 via-violet-500/10 to-transparent",
  },
  {
    title: "Not A Popularity Contest",
    subtitle: "A different kind of score",
    content: "Finally, a metric that isn't about clout. A high score simply means your Grapevine verifies this person is real.",
    detail: 'Low score \u2260 uncool. It just means "we haven\'t had the pleasure of meeting yet." Trust is earned, not farmed.',
    tone: "from-fuchsia-500/20 via-purple-500/10 to-transparent",
  },
  {
    title: "Safety in Numbers",
    subtitle: "Crowdsourced immunity",
    content: "Accidentally followed a bot farm? Your network knows things you don't. We'll flag it before it spams you.",
    detail: "Get alerts if you follow someone highly reported or muted by your trusted peers. It's herd immunity for your feed.",
    tone: "from-amber-500/20 via-orange-500/10 to-transparent",
  },
  {
    title: "Computation In Progress",
    subtitle: "Your scores are being prepared",
    content: "We're calculating your trust graph and generating explainable scores you can use across the Brainstorm experience.",
    detail: "This usually takes a few minutes \u2014 you can keep browsing while we build your view of the network.",
    tone: "from-cyan-500/20 via-sky-500/10 to-transparent",
  },
  {
    title: "Trusted Assertions",
    subtitle: "Technical deep dive",
    content: "Brainstorm uses cryptographic proofs to deliver trust scores. These 'assertions' can be verified but never forged.",
    detail: "Each assertion is a kind 3038x event containing your personalized trust scores, signed by you.",
    tone: "from-rose-500/20 via-pink-500/10 to-transparent",
  },
  {
    title: "What This Unlocks",
    subtitle: "The future",
    content: "Spam filtering, content recommendations, reputation systems, marketplace trust \u2014 all powered by your personal web of trust.",
    detail: "Developers can build on top of your trust scores, creating experiences tailored to your unique social graph.",
    tone: "from-yellow-500/20 via-amber-500/10 to-transparent",
  },
  {
    title: "You're in control",
    subtitle: "Last slide \u2014 explore anytime",
    content: "There's no timer here. Click through at your own pace while your trust graph continues computing in the background.",
    detail: "When scores are ready, the dashboard will reflect them \u2014 until then, explore and learn how the system works.",
    tone: "from-fuchsia-500/20 via-indigo-500/10 to-transparent",
  },
];

const isStatusDone = (s: unknown): boolean => typeof s === "string" && s.toLowerCase() === "success";

const INTEREST_CLUSTERS = [
  { id: "dev", label: "Protocol Devs", icon: Code, count: 1240, color: "bg-blue-500", unit: "builders", image: protocolDevImg },
  { id: "btc", label: "Bitcoiners", icon: Bitcoin, count: 8500, color: "bg-orange-500", unit: "peers", image: bitcoinImg },
  { id: "art", label: "Digital Artists", icon: Palette, count: 3200, color: "bg-pink-500", unit: "creators", image: digitalArtImg },
  { id: "music", label: "Music Scene", icon: Music, count: 1800, color: "bg-purple-500", unit: "artists", image: musicSceneImg },
];


const NETWORK_METRICS = [
  { key: "followed_by", label: "Followers", icon: UserPlus, color: "text-emerald-500", bgColor: "bg-emerald-500" },
  { key: "following", label: "Following", icon: Users, color: "text-indigo-500", bgColor: "bg-indigo-500" },
  { key: "muted_by", label: "Muted By", icon: VolumeX, color: "text-amber-500", bgColor: "bg-amber-500" },
  { key: "muting", label: "Muting", icon: UserMinus, color: "text-slate-500", bgColor: "bg-slate-400" },
  { key: "reported_by", label: "Reported By", icon: ShieldAlert, color: "text-red-500", bgColor: "bg-red-500" },
  { key: "reporting", label: "Reporting", icon: ShieldAlert, color: "text-orange-500", bgColor: "bg-orange-500" },
] as const;


export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [hopRange, setHopRange] = useState([1, 3]);
  const [extendedNetworkCount, setExtendedNetworkCount] = useState(250000);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const riskTeaserTimerRef = useRef<number | null>(null);
  const [networkViewMode, setNetworkViewMode] = useState<"trust" | "activity">("trust");
  const [healthView, setHealthView] = useState<"followers" | "following">("followers");
  const [activeOnboardingIndex, setActiveOnboardingIndex] = useState(0);
  const [isOnboardingCollapsed, setIsOnboardingCollapsed] = useState(true);
  const [nip85ModalOpen, setNip85ModalOpen] = useState(false);
  const [nip85Activated, setNip85Activated] = useState(() => localStorage.getItem("brainstorm_nip85_activated") === "true");
  const [nip85Dismissed, setNip85Dismissed] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    setUser(u);
  }, [navigate]);

  const needsProfile = !!user && !user.displayName && !user.picture;
  const profileQuery = useQuery({
    queryKey: ["profile", user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return null;
      await fetchOutboxRelayList(user.pubkey);
      const content = await fetchProfile(user.pubkey);
      if (content) {
        const updates = applyProfileToUser(content);
        updateCurrentUser(updates);
        setUser((prev) => prev ? { ...prev, ...updates } : prev);
        return content;
      }
      throw new Error("Profile not found");
    },
    enabled: needsProfile,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: Infinity,
  });

  const selfQuery = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user,
    retry: false,
    refetchInterval: () => {
      const grData = queryClient.getQueryData<any>(["/api/auth/graperankResult"]);
      const d = grData?.data;
      if (!d || typeof d !== "object") return 10_000;
      const done = isStatusDone((d as any).ta_status);
      return done ? false : 10_000;
    },
  });

  const grapeRankQuery = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    retry: false,
    refetchInterval: (query) => {
      const d = query.state.data?.data;
      if (!d || typeof d !== "object") return 10_000;
      const done = isStatusDone((d as any).ta_status);
      return done ? false : 10_000;
    },
  });

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: (data) => {
      if (data?.data && typeof data.data === "object") {
        queryClient.setQueryData(["/api/auth/graperankResult"], data);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/graperankResult"] });
      toast({
        title: "Calculation started",
        description: "Your trust scores are being recalculated. Results will update shortly.",
        duration: 5000,
      });
      setTimeout(() => triggerGrapeRankMutation.reset(), 5000);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Calculation failed",
        description: error instanceof Error ? error.message : "Something went wrong. Please wait a moment and try again.",
        duration: 8000,
      });
      setTimeout(() => triggerGrapeRankMutation.reset(), 8000);
    },
  });

  const selfData = selfQuery.data?.data;
  const network = selfData?.graph || user?.userData?.data?.graph || null;

  const trustServiceProvider = useQuery({
    queryKey: ["trustServiceProvider", user?.pubkey, selfQuery.data?.data?.history?.ta_pubkey],
    queryFn: async () => {
      console.log("trustServiceProvider", selfQuery.data?.data?.history?.ta_pubkey)
      if (!user?.pubkey || !selfQuery.data?.data?.history?.ta_pubkey) return null;
      const isBrainstormClient = await isUsingBrainstorm(user.pubkey, selfQuery.data?.data?.history?.ta_pubkey);

      if (isBrainstormClient && localStorage.getItem("brainstorm_nip85_activated") !== "true") {
        localStorage.setItem("brainstorm_nip85_activated", "true");
      }

      if (nip85Activated !== isBrainstormClient) {
        setNip85Activated(isBrainstormClient)
      }
      
      return isBrainstormClient
    },
    enabled: !!user,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: Infinity,
  });

  const grapeRankRaw = grapeRankQuery.data?.data;
  const grapeRank = grapeRankRaw && typeof grapeRankRaw === "object" ? grapeRankRaw : null;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";

  const followersCount = network?.followed_by?.length ?? 0;
  const followingCount = network?.following?.length ?? 0;
  const mutedByCount = network?.muted_by?.length ?? 0;
  const mutingCount = network?.muting?.length ?? 0;
  const reportedByCount = network?.reported_by?.length ?? 0;
  const reportingCount = network?.reporting?.length ?? 0;
  const flaggedCount = (() => {
    const raw = network?.low_and_reported_by_2_or_more_trusted_pubkeys;
    if (!raw) return 0;
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === "object") {
      return Object.values(raw).reduce((sum: number, v: any) => sum + (typeof v === "number" ? v : 0), 0);
    }
    return 0;
  })();
  const influence = network?.influence ?? 0;

  const { verifiedFollowersCount, verifiedFollowingCount } = useMemo(() => {
    if (!network) return { verifiedFollowersCount: 0, verifiedFollowingCount: 0 };
    const countVerified = (arr: any[] | undefined) => {
      if (!Array.isArray(arr)) return 0;
      const threshold = getVerifiedThreshold();
      return arr.filter(m => typeof m.influence === "number" && m.influence >= threshold).length;
    };
    return {
      verifiedFollowersCount: countVerified(network.followed_by),
      verifiedFollowingCount: countVerified(network.following),
    };
  }, [network]);

  const grapeRankStatus = grapeRank
    ? (grapeRank as any).status || "complete"
    : triggerGrapeRankMutation.isPending
    ? "calculating"
    : "idle";

  const grapeRankScoreNum = grapeRank
    ? [
        (grapeRank as any).average,
        (grapeRank as any).score,
        (grapeRank as any).graperank,
        (grapeRank as any).result,
        (grapeRank as any).confidence,
        (grapeRank as any).value,
      ].find((v) => typeof v === "number") ?? null
    : null;
  const grapeRankScore = grapeRankScoreNum !== null
    ? grapeRankScoreNum.toFixed(4)
    : null;

  const queuePosition = grapeRank
    ? typeof (grapeRank as any).how_many_others_with_priority === "number"
      ? (grapeRank as any).how_many_others_with_priority
      : null
    : null;

  const grapeRankCreatedAt = grapeRank && (grapeRank as any).created_at ? new Date((grapeRank as any).created_at.endsWith("Z") ? (grapeRank as any).created_at : (grapeRank as any).created_at + "Z") : null;
  const grapeRankUpdatedAt = grapeRank && (grapeRank as any).updated_at ? new Date((grapeRank as any).updated_at.endsWith("Z") ? (grapeRank as any).updated_at : (grapeRank as any).updated_at + "Z") : null;

  const calcDone = grapeRank ? isStatusDone((grapeRank as any).internal_publication_status) : false;
  const publishDone = calcDone && grapeRank ? isStatusDone((grapeRank as any).ta_status) : false;

  const isGrapeRankFailed = grapeRank
    ? typeof (grapeRank as any).status === "string" && (grapeRank as any).status.toLowerCase() === "failure"
    : false;

  const isPublishFailed = calcDone && grapeRank
    ? typeof (grapeRank as any).ta_status === "string" && (grapeRank as any).ta_status.toLowerCase() === "failure"
    : false;

  const hasNoFollowing = selfQuery.isSuccess && network !== null && Array.isArray(network?.following) && network.following.length === 0;

  const prevCalcDoneRef = useRef(false);
  useEffect(() => {
    if (calcDone && !prevCalcDoneRef.current) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/self"] });
    }
    prevCalcDoneRef.current = calcDone;
  }, [calcDone]);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isGrapeRankFailed && !isPublishFailed) {
      setRetryCount(0);
    }
  }, [isGrapeRankFailed, isPublishFailed]);

  const formatRelativeTime = (date: Date | null): string => {
    if (!date || isNaN(date.getTime())) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatTimestamp = (date: Date | null): string => {
    if (!date || isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  };

  const TIER_CONFIG = [
    { key: "high", name: "Highly Trusted", color: "#059669" },
    { key: "medium_high", name: "Trusted", color: "#0ea5e9" },
    { key: "medium", name: "Neutral", color: "#6366f1" },
    { key: "medium_low", name: "Low Trust", color: "#f59e0b" },
    { key: "low", name: "Unverified", color: "#a1a1aa" },
    { key: "flagged", name: "Flagged", color: "#ef4444" },
  ] as const;

  const countValues = useMemo(() => {
    if (!grapeRank) return null;
    const raw = (grapeRank as any).count_values;
    if (!raw) return null;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, Record<string, number>>;
    } catch { /* ignore parse errors */ }
    return null;
  }, [grapeRank]);

  const maxHopInData = useMemo(() => {
    if (!countValues) return 5;
    let maxH = 1;
    for (const tierKey of Object.keys(countValues)) {
      const hopMap = countValues[tierKey];
      if (!hopMap || typeof hopMap !== "object") continue;
      for (const hopStr of Object.keys(hopMap)) {
        const h = parseInt(hopStr, 10);
        if (!isNaN(h) && h < 900 && h > maxH) maxH = h;
      }
    }
    return Math.max(maxH, 5);
  }, [countValues]);

  useEffect(() => {
    return () => {
      if (riskTeaserTimerRef.current) window.clearTimeout(riskTeaserTimerRef.current);
    };
  }, []);


  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    const x = clientX - left;
    const y = clientY - top;
    mouseX.set(x);
    mouseY.set(y);
    (currentTarget as HTMLElement).style.setProperty("--flash-x", `${x}px`);
    (currentTarget as HTMLElement).style.setProperty("--flash-y", `${y}px`);
  }

  const aggregateByHopRange = (tierKey: string, lo: number, hi: number): number => {
    if (!countValues || !countValues[tierKey]) return 0;
    const hopMap = countValues[tierKey];
    let total = 0;
    for (const hopStr of Object.keys(hopMap)) {
      const h = parseInt(hopStr, 10);
      if (isNaN(h)) continue;
      if (h >= lo && h <= hi) {
        total += hopMap[hopStr] || 0;
      }
    }
    return total;
  };

  useEffect(() => {
    if (countValues) {
      let total = 0;
      for (const tier of TIER_CONFIG) {
        total += aggregateByHopRange(tier.key, hopRange[0], hopRange[1]);
      }
      setExtendedNetworkCount(total);
    } else {
      const base = 500;
      const count = Math.floor(base * Math.pow(8, hopRange[1]));
      setExtendedNetworkCount(count > 1000000 ? 1000000 : count);
    }
  }, [hopRange, countValues]);

  const enhancedPieData = useMemo(() => {
    if (countValues) {
      return TIER_CONFIG.map((tier) => {
        let value = aggregateByHopRange(tier.key, hopRange[0], hopRange[1]);
        if (tier.name === "Flagged" && value === 0 && flaggedCount > 0) {
          value = Math.floor(flaggedCount * (1 + (hopRange[1] - 1) * 0.5));
        }
        return { name: tier.name, value, color: tier.color };
      }).filter(d => d.value > 0 || d.name === "Flagged");
    }
    const fallback = [
      { label: "Highly Trusted", count: followersCount, color: "#059669" },
      { label: "Trusted", count: followingCount, color: "#0ea5e9" },
      { label: "Neutral", count: Math.max(100, followersCount * 2), color: "#6366f1" },
      { label: "Low Trust", count: mutedByCount + mutingCount, color: "#f59e0b" },
      { label: "Unverified", count: Math.max(10, mutedByCount), color: "#a1a1aa" },
      { label: "Flagged", count: flaggedCount, color: "#ef4444" },
    ];
    const currentHops = hopRange[1];
    return fallback.map((d) => {
      let multiplier = 1;
      if (d.label === "Highly Trusted") multiplier = Math.max(0.2, 1 - (currentHops - 1) * 0.15);
      else if (d.label === "Trusted") multiplier = Math.max(0.4, 1 - (currentHops - 1) * 0.08);
      else if (d.label === "Neutral") multiplier = 1 + (currentHops - 1) * 0.4;
      else if (d.label === "Low Trust") multiplier = 1 + (currentHops - 1) * 0.6;
      else if (d.label === "Flagged") multiplier = 1 + (currentHops - 1) * 0.5;
      else multiplier = 1 + (currentHops - 1) * 0.8;
      return { name: d.label, value: Math.floor(d.count * multiplier), color: d.color };
    }).filter(d => d.value > 0 || d.name === "Flagged");
  }, [countValues, hopRange, followersCount, followingCount, mutedByCount, mutingCount, flaggedCount]);

  const totalNetworkProfiles = enhancedPieData.reduce((acc: number, curr: { value: number }) => acc + curr.value, 0);

  const activityBreakdown = [
    { name: "Very active (7 days)", value: Math.floor(extendedNetworkCount * 0.18), color: "#059669" },
    { name: "Active (90 days)", value: Math.floor(extendedNetworkCount * 0.32), color: "#0ea5e9" },
    { name: "Quiet (90+ days)", value: Math.floor(extendedNetworkCount * 0.3), color: "#6366f1" },
    {
      name: "Dormant (1+ year)",
      value: Math.max(
        0,
        extendedNetworkCount -
          Math.floor(extendedNetworkCount * 0.18) -
          Math.floor(extendedNetworkCount * 0.32) -
          Math.floor(extendedNetworkCount * 0.3)
      ),
      color: "#d1d5db",
    },
  ];

  const totalActivityProfiles = activityBreakdown.reduce((acc, curr) => acc + curr.value, 0);

  const currentPieData: Array<{ name: string; value: number; color: string }> = networkViewMode === "trust" ? enhancedPieData : activityBreakdown;
  const totalCurrentProfiles = networkViewMode === "trust" ? totalNetworkProfiles : totalActivityProfiles;

  const directTierCounts = useMemo(() => {
    if (!network) return {} as Record<string, number>;
    const followers = network.followed_by;
    if (!Array.isArray(followers)) return {} as Record<string, number>;
    // When API returns an object (aggregate counts by hop), flaggedSet stays empty
    // because individual pubkeys aren't available — per-contact flagged detection
    // only works when API returns an array of pubkeys.
    const flaggedSet = new Set<string>();
    const flaggedApiList = (network as any).low_and_reported_by_2_or_more_trusted_pubkeys;
    if (Array.isArray(flaggedApiList)) {
      for (const m of flaggedApiList) flaggedSet.add(typeof m === "string" ? m : m.pubkey);
    }
    const counts: Record<string, number> = { high: 0, medium: 0, neutral: 0, low: 0, flagged: 0, unverified: 0 };
    for (const m of followers) {
      if (flaggedSet.size > 0 && flaggedSet.has(m.pubkey)) {
        counts.flagged++;
        continue;
      }
      const inf = typeof m.influence === "number" ? m.influence : null;
      const vt = getVerifiedThreshold();
      if (inf === null) { counts.unverified++; continue; }
      if (inf >= 0.50) counts.high++;
      else if (inf >= 0.20) counts.medium++;
      else if (inf >= 0.07) counts.neutral++;
      else if (inf >= vt) counts.low++;
      else counts.unverified++;
    }
    return counts;
  }, [network]);

  const directFollowingTierCounts = useMemo(() => {
    if (!network) return {} as Record<string, number>;
    const following = network.following;
    if (!Array.isArray(following)) return {} as Record<string, number>;
    // When API returns an object (aggregate counts by hop), flaggedSet stays empty
    // because individual pubkeys aren't available — per-contact flagged detection
    // only works when API returns an array of pubkeys.
    const flaggedSet = new Set<string>();
    const flaggedApiList = (network as any).low_and_reported_by_2_or_more_trusted_pubkeys;
    if (Array.isArray(flaggedApiList)) {
      for (const m of flaggedApiList) flaggedSet.add(typeof m === "string" ? m : m.pubkey);
    }
    const counts: Record<string, number> = { high: 0, medium: 0, neutral: 0, low: 0, flagged: 0, unverified: 0 };
    for (const m of following) {
      if (flaggedSet.size > 0 && flaggedSet.has(m.pubkey)) {
        counts.flagged++;
        continue;
      }
      const inf = typeof m.influence === "number" ? m.influence : null;
      const vt = getVerifiedThreshold();
      if (inf === null) { counts.unverified++; continue; }
      if (inf >= 0.50) counts.high++;
      else if (inf >= 0.20) counts.medium++;
      else if (inf >= 0.07) counts.neutral++;
      else if (inf >= vt) counts.low++;
      else counts.unverified++;
    }
    return counts;
  }, [network]);

  const followingPieData = useMemo(() => {
    return TIER_CONFIG.map((tier) => ({
      name: tier.name,
      value: directFollowingTierCounts[tier.key] ?? 0,
      color: tier.color,
    })).filter(d => d.value > 0 || d.name === "Flagged");
  }, [directFollowingTierCounts]);

  const handleExport = () => {
    const data = {
      format: "brainstorm-v1",
      observer: user?.npub,
      calculatedAt: new Date().toISOString(),
      stats: {
        followersCount,
        followingCount,
        mutedByCount,
        mutingCount,
        reportedByCount,
        reportingCount,
        influence,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brainstorm-scores-${Date.now()}.json`;
    a.click();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case "e":
          handleExport();
          break;
        case "h":
          navigate("/dashboard");
          break;
        case "?":
          setShowShortcuts((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, user]);

  if (!user || isAuthRedirecting()) return null;

  const isCalculationComplete = calcDone;
  const showOnboarding = !grapeRankQuery.isLoading && !publishDone && !hasNoFollowing;
  const isErrorState = isGrapeRankFailed || isPublishFailed || (hasNoFollowing && !triggerGrapeRankMutation.isPending);
  const isRecalculation = !publishDone && !!(grapeRankScore || nip85Activated || grapeRank);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-dashboard">
        <PageBackground />

        <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="lg:hidden">
                  <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <BrainLogo size={28} className="text-indigo-500" />
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-logo">
                    Brainstorm
                  </h1>
                </div>
                <div className="hidden lg:flex gap-2">
                  <Button variant="ghost" size="sm" className="gap-2 text-white bg-white/10 no-default-hover-elevate no-default-active-elevate" data-testid="button-dashboard-nav">
                    <Home className="h-4 w-4" />
                    Dashboard
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5" onClick={() => navigate("/search")} data-testid="button-nav-search">
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                  <Button variant="ghost" size="sm" className={`gap-2 no-default-hover-elevate no-default-active-elevate ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-600 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} title={!calcDone ? "Available after calculation completes" : undefined} data-testid="button-nav-network">
                    <Users className="h-4 w-4" />
                    Network
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-user-menu">
                      <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                        {user.picture ? (
                          <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" />
                        ) : null}
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                          {needsProfile && profileQuery.isFetching ? <BrainLogo size={18} className="animate-pulse text-indigo-400" /> : (user.displayName?.charAt(0) || "U")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden md:flex flex-col items-start mr-2">
                        <span className="text-sm font-bold text-white leading-none mb-0.5">{user.displayName || "Anon"}</span>
                        <span className="text-xs text-indigo-300 font-mono leading-none">{user.npub.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anonymous"}</p>
                        <p className="text-xs leading-none text-slate-500">{user.npub.slice(0, 16)}...</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="dropdown-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>

        {mobileMenuOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} data-testid="overlay-mobile-menu" />
            <div className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-xl flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950" data-testid="panel-mobile-menu">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
                <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/18 blur-[110px]" />
              </div>

              <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
                    <BrainLogo size={22} className="text-indigo-200" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-mobile-menu-kicker">Brainstorm</p>
                    <h2 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-mobile-menu-title">Menu</h2>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-slate-200/80 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-close-mobile-menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="relative flex-1 flex flex-col overflow-y-auto py-4 px-3">
                <div className="space-y-2">
                  <p className="px-3 text-xs font-semibold text-slate-300/70 uppercase tracking-[0.22em]" data-testid="text-mobile-menu-section-nav">Navigation</p>
                  <Button variant="ghost" className="w-full justify-start gap-3 text-base font-semibold text-white bg-white/10 border border-white/10 rounded-2xl shadow-[0_12px_26px_-18px_rgba(124,134,255,0.35)] no-default-hover-elevate no-default-active-elevate" onClick={() => setMobileMenuOpen(false)} data-testid="button-mobile-nav-dashboard">
                    <Home className="h-5 w-5 text-indigo-200" />
                    Dashboard
                  </Button>
                  <Button variant="ghost" className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate" onClick={() => { setMobileMenuOpen(false); navigate("/search"); }} data-testid="button-mobile-nav-search">
                    <Search className="h-5 w-5 text-slate-200/80" />
                    Search
                  </Button>
                  <Button variant="ghost" className={`w-full justify-start gap-3 text-base font-medium border border-transparent rounded-2xl no-default-hover-elevate no-default-active-elevate ${calcDone ? "text-slate-200/90 hover:text-white hover:bg-white/10 hover:border-white/10" : "text-slate-500 opacity-40 cursor-not-allowed"}`} onClick={() => { if (calcDone) { setMobileMenuOpen(false); navigate("/network"); } }} disabled={!calcDone} title={!calcDone ? "Available after calculation completes" : undefined} data-testid="button-mobile-nav-network">
                    <Users className={`h-5 w-5 ${calcDone ? "text-slate-200/80" : "text-slate-500"}`} />
                    Network
                  </Button>
                  <Button variant="ghost" className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate" onClick={() => { setMobileMenuOpen(false); navigate("/what-is-wot"); }} data-testid="button-mobile-nav-wot">
                    <BookOpen className="h-5 w-5 text-slate-200/80" />
                    What is WoT?
                  </Button>
                </div>
                <div className="mt-auto pt-4 px-0">
                  <Button variant="ghost" className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate" onClick={() => { setMobileMenuOpen(false); navigate("/settings"); }} data-testid="button-mobile-nav-settings">
                    <SettingsIcon className="h-5 w-5 text-slate-200/80" />
                    Settings
                  </Button>
                </div>
              </div>

              <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
                <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                  <Avatar className="h-10 w-10 border border-white/10">
                    {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} /> : null}
                    <AvatarFallback className="bg-indigo-900 text-white font-bold">{needsProfile && profileQuery.isFetching ? <BrainLogo size={20} className="animate-pulse text-indigo-400" /> : (user.displayName?.charAt(0) || "U")}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate" data-testid="text-mobile-menu-user-label">{user.displayName || "Anonymous"}</p>
                    <p className="text-xs text-slate-300/70 font-mono truncate" data-testid="text-mobile-menu-user-npub">{truncatedNpub}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full justify-center gap-2 text-red-200 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl" onClick={() => { setMobileMenuOpen(false); handleLogout(); }} data-testid="button-mobile-sign-out">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">

          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-2" data-testid="section-dashboard-header-copy">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit" data-testid="pill-dashboard-kicker">
                  <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" aria-hidden="true" />
                  <p className="text-xs font-bold tracking-[0.15em] text-[#333286] uppercase" data-testid="text-dashboard-header-kicker">Brainstorm Dashboard</p>
                </div>
                <h1
                  className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  data-testid="text-dashboard-header-title"
                >
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                    Welcome back, {user.displayName || "Traveler"}
                  </span>
                </h1>
                <div className="flex items-center gap-3">
                  <p className="text-slate-600 font-medium" data-testid="text-dashboard-header-subtitle">
                    {hasNoFollowing ? "Set up your trust network" : "Your trust network is active and growing."}
                  </p>
                </div>
              </div>

              {nip85Activated && publishDone ? (
              <div
                className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative self-start md:self-end max-w-xs"
                data-testid="badge-nip85-active"
              >
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] rounded-t-2xl" />
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#7c86ff] via-[#333286] to-[#7c86ff] p-[1.5px] shadow-sm">
                          <div className="h-full w-full rounded-xl bg-white flex items-center justify-center">
                            <BrainLogo size={16} className="text-[#333286]" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 tracking-tight block leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          WoT Service Provider
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 block mt-0.5 leading-none">
                          NIP-85 Declaration
                        </span>
                        {selfData?.history?.last_time_calculated_graperank && (
                          <span className="text-[9px] text-slate-400 block mt-1 leading-none">
                            Updated {formatTimestamp(new Date(selfData.history.last_time_calculated_graperank.endsWith("Z") ? selfData.history.last_time_calculated_graperank : selfData.history.last_time_calculated_graperank + "Z"))}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">Active</span>
                      </div>
                      <button
                        onClick={() => setRecalcConfirmOpen(true)}
                        disabled={triggerGrapeRankMutation.isPending || hasNoFollowing}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#333286]/8 text-[#333286] hover:bg-[#333286]/15 transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none border border-[#7c86ff]/15 hover:border-[#7c86ff]/30"
                        data-testid="button-recalculate-wot-card"
                      >
                        {triggerGrapeRankMutation.isPending ? (
                          <>
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span className="text-[9px] font-semibold tracking-wide">Calculating</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span className="text-[9px] font-semibold tracking-wide">Recalculate</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1.5">
                    <div className="rounded-lg bg-gradient-to-br from-indigo-50/50 to-slate-50/50">
                      <div className="border-l-2 border-[#7c86ff] px-3 py-2.5">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Compatible Clients</span>
                          <div className="relative group/info">
                            <button
                              type="button"
                              className="h-3.5 w-3.5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/40"
                              aria-label="What are Compatible Clients?"
                              data-testid="button-compatible-clients-info"
                            >
                              <Info className="h-2 w-2" />
                            </button>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 sm:w-80 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs text-slate-200 leading-relaxed opacity-0 invisible group-focus-within/info:opacity-100 group-focus-within/info:visible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 z-50 pointer-events-none group-focus-within/info:pointer-events-auto group-hover/info:pointer-events-auto" data-testid="tooltip-compatible-clients">
                              These are Nostr clients that use personalized trust scores calculated by Brainstorm and other Web of Trust Service Providers via NIP-85: Trusted Assertions or other integration methods.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-slate-200/80 shadow-sm hover:border-purple-300 hover:shadow-md transition-all group/client" data-testid="link-compatible-amethyst">
                            <img src={amethystLogoImg} alt="Amethyst" className="w-5 h-5 rounded-md" />
                            <span className="text-[10px] font-semibold text-slate-700 group-hover/client:text-purple-700 transition-colors">Amethyst</span>
                          </a>
                          <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white border border-slate-200/80 shadow-sm hover:border-orange-300 hover:shadow-md transition-all group/client" data-testid="link-compatible-nostria">
                            <img src={nostriaIconImg} alt="Nostria" className="w-5 h-5 rounded-md bg-white object-contain" />
                            <span className="text-[10px] font-semibold text-slate-700 group-hover/client:text-orange-700 transition-colors">Nostria</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ) : (
              <div
                className="flex items-center gap-2.5 rounded-xl bg-white border border-slate-200 shadow-sm px-3 py-2 self-start md:self-end transition-all duration-200"
                data-testid="card-overall-trust-score"
              >
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-400">Trust signals</span>
                  {triggerGrapeRankMutation.isPending ? (
                    <span className="text-xs text-indigo-600 font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Recalculating...
                    </span>
                  ) : grapeRankScore ? (
                    <span className="text-xs text-slate-700 font-semibold" data-testid="text-overall-trust-score-sub">
                      Score: {grapeRankScore}
                    </span>
                  ) : publishDone ? (
                    <span className="text-xs text-emerald-600 font-semibold" data-testid="text-overall-trust-score-sub">
                      Complete
                    </span>
                  ) : isErrorState ? (
                    <span className="text-xs text-red-500 font-medium" data-testid="text-overall-trust-score-sub">
                      {isGrapeRankFailed ? "Calculation failed" : isPublishFailed ? "Publishing failed" : "Action needed"}
                    </span>
                  ) : isRecalculation ? (
                    <span className="text-xs text-indigo-500 font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {calcDone ? "Publishing…" : "Calculating…"}
                    </span>
                  ) : triggerGrapeRankMutation.isPending ? (
                    <span className="text-xs text-indigo-500 font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Calculating…
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-medium" data-testid="text-overall-trust-score-sub">
                      Awaiting calculation
                    </span>
                  )}
                  {publishDone && (grapeRankUpdatedAt || grapeRankCreatedAt) && (
                    <span className="text-xs text-slate-400 mt-0.5" data-testid="text-trust-signals-updated">
                      Last updated — {formatTimestamp(grapeRankUpdatedAt || grapeRankCreatedAt)}
                    </span>
                  )}
                </div>
                <div className="w-px h-6 bg-slate-200 shrink-0" />
                <button
                  onClick={() => setRecalcConfirmOpen(true)}
                  disabled={triggerGrapeRankMutation.isPending || hasNoFollowing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#333286]/10 text-[#333286] hover:bg-[#333286]/20 transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0 ring-1 ring-[#7c86ff]/20"
                  data-testid="button-trigger-graperank"
                >
                  {triggerGrapeRankMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-[10px] font-semibold tracking-wide">Calculating</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      <span className="text-[10px] font-semibold tracking-wide">Recalculate</span>
                    </>
                  )}
                </button>
              </div>
              )}

            </div>

            <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
              <AlertDialogContent
                className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-indigo-500/20 bg-white/80 backdrop-blur-xl shadow-[0_0_18px_rgba(99,102,241,0.10)] p-0 overflow-hidden"
                data-testid="dialog-confirm-recalculate-dashboard"
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />
                  <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-indigo-500/15 to-transparent" />
                </div>
                <div className="relative p-4 sm:p-5">
                  <AlertDialogHeader className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-2xl bg-indigo-800/10 border border-indigo-800/10 flex items-center justify-center shadow-[0_12px_26px_-18px_rgba(99,102,241,0.22)] shrink-0" data-testid="icon-confirm-recalculate-dashboard">
                        <BrainLogo size={18} className="text-indigo-800" />
                      </div>
                      <div className="min-w-0">
                        <AlertDialogTitle className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-recalculate-dashboard-title">
                          Recalculate GrapeRank?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed" data-testid="text-confirm-recalculate-dashboard-desc">
                          This re-runs your full network trust calculation. It typically takes 10-20 minutes and your current scores will be replaced with updated results.
                        </AlertDialogDescription>
                      </div>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-4 gap-2 sm:gap-2">
                    <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-recalculate-dashboard-cancel">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl bg-indigo-800 hover:bg-indigo-900"
                      onClick={() => {
                        setRecalcConfirmOpen(false);
                        triggerGrapeRankMutation.mutate();
                      }}
                      data-testid="button-confirm-recalculate-dashboard-continue"
                    >
                      Recalculate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </div>
              </AlertDialogContent>
            </AlertDialog>

            <AnimatePresence>
              {isGrapeRankFailed && !triggerGrapeRankMutation.isError && !triggerGrapeRankMutation.isPending && !triggerGrapeRankMutation.isSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-red-200/60 shadow-[0_8px_30px_-12px_rgba(239,68,68,0.15)] w-fit md:ml-auto"
                  data-testid="graperank-failed"
                >
                  <div className="h-8 w-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-700">Calculation incomplete</p>
                    <p className="text-xs text-red-600/80 mt-0.5">Please wait a few minutes, then try again.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {hasNoFollowing && !triggerGrapeRankMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-indigo-200/60 shadow-[0_8px_30px_-12px_rgba(99,102,241,0.15)] w-fit md:ml-auto"
                  data-testid="graperank-no-following"
                >
                  <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                    <Info className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-indigo-700">No follows yet</p>
                    <p className="text-xs text-indigo-600/80 mt-0.5">Follow some people on Nostr first for the best results. You can still try calculating.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showOnboarding && (
              <div
                className="group rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950 to-indigo-950 border border-white/10 shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:shadow-[0_28px_70px_-20px_rgba(124,134,255,0.35)] overflow-hidden relative transition-shadow"
                onMouseMove={handleMouseMove}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.setProperty("--flash-o", "0");
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.setProperty("--flash-o", "1");
                }}
                data-testid="container-onboarding-flashlight"
                style={{
                  ["--flash-x" as any]: "50%",
                  ["--flash-y" as any]: "50%",
                  ["--flash-o" as any]: 0,
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                  style={{
                    opacity: "var(--flash-o, 0)" as any,
                    background: [
                      "radial-gradient(520px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(124,134,255,0.26), rgba(124,134,255,0.08) 32%, rgba(2,6,23,0) 66%)",
                      "radial-gradient(860px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(51,50,134,0.11), rgba(2,6,23,0) 70%)",
                    ].join(", "),
                  }}
                  data-testid="overlay-onboarding-flashlight"
                />

                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                  style={{
                    opacity: "var(--flash-o, 0)" as any,
                    WebkitMaskImage:
                      "radial-gradient(380px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 65%)",
                    maskImage:
                      "radial-gradient(380px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0) 65%)",
                  }}
                  aria-hidden="true"
                  data-testid="overlay-onboarding-equations"
                >
                  <div
                    className="absolute inset-0 mix-blend-screen"
                    style={{
                      opacity: 0.22,
                      background: "linear-gradient(180deg, rgba(124,134,255,0.16), rgba(255,255,255,0.03) 55%, rgba(124,134,255,0.06))",
                    }}
                  />
                  <div
                    className="absolute inset-x-0 top-[88px] bottom-[280px]"
                    style={{
                      opacity: 0.36,
                      transform: "translateZ(0)",
                      fontFamily: "var(--font-mono)",
                      color: "rgba(226,232,240,0.70)",
                      textShadow: "0 1px 0 rgba(0,0,0,0.22), 0 0 12px rgba(124,134,255,0.12)",
                    }}
                    data-testid="container-onboarding-equations-safe"
                  >
                    {[
                      { x: "18%", y: "20%", r: "-8deg", a: 0.4, lines: ["WOT(u) = \u03a3\u1d65 w(u,v) \u00b7 t(v)", "w(u,v) = 1/(1+dist(u,v))", "trust(u) \u2208 [0,100]"] },
                      { x: "78%", y: "28%", r: "10deg", a: 0.34, lines: ["id = SHA256(serialized)", "sig = Schnorr(sk, id)", "event = {kind, pubkey, tags}"] },
                      { x: "22%", y: "72%", r: "7deg", a: 0.32, lines: ["G = (V,E) from follows", "score = f(G, seeds, hops)", "relays = {r\u2081\u2026r\u2099}"] },
                      { x: "76%", y: "78%", r: "-12deg", a: 0.3, lines: ["compute(graph) \u2192 scores", "verify(sig) \u2192 authentic", "\u0394t \u2248 4\u20135 min"] },
                    ].map((b, i) => {
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
                            <div key={idx} className={idx === 0 ? "font-medium" : idx === 1 ? "opacity-75" : "opacity-60"}>
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
                      <p className="text-xs font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-onboarding-kicker">
                        {isRecalculation ? "Recalculating" : isErrorState ? "Action needed" : "Brainstorm onboarding"}
                      </p>
                      <h2
                        className="text-xl sm:text-2xl font-bold text-white tracking-tight"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        data-testid="text-onboarding-title"
                      >
                        {isRecalculation ? "Refreshing your trust scores" : isErrorState ? "Something went wrong" : "Clarity in a fragmented world"}
                      </h2>
                      <p className="text-sm text-slate-300/90 mt-1 max-w-3xl" data-testid="text-onboarding-subtitle">
                        {isRecalculation
                          ? <>Your trust scores are being recalculated. This usually takes <span className="font-semibold text-white" data-testid="text-onboarding-duration">10-20 minutes</span>. Previous scores will be replaced with fresh results once complete.</>
                          : isErrorState
                            ? <>Your {isGrapeRankFailed ? "trust score calculation" : "trusted assertion publishing"} didn't complete successfully. You can retry below, or head to <span className="font-semibold text-white">Settings</span> to try again later.</>
                            : <>Welcome. Your trust score is being calculated. It usually takes <span className="font-semibold text-white" data-testid="text-onboarding-duration">10-20 minutes</span> to calculate. In the meantime, browse the dashboard and see how Brainstorm turns your Nostr graph into explainable trust.</>
                        }
                      </p>
                    </div>
                  </div>

                  <div className="mt-4" data-testid="section-onboarding-carousel">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setIsOnboardingCollapsed((v) => !v)}
                        className={`inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors ${isOnboardingCollapsed ? "animate-[softPulse_2.6s_ease-in-out_infinite] ring-1 ring-indigo-400/20 shadow-[0_0_0_4px_rgba(99,102,241,0.06)]" : ""}`}
                        data-testid="button-toggle-onboarding"
                        aria-expanded={!isOnboardingCollapsed}
                      >
                        {isOnboardingCollapsed ? "Learn More" : "Hide"}
                        <ChevronRight className={`h-4 w-4 transition-transform ${isOnboardingCollapsed ? "" : "rotate-90"}`} />
                      </button>
                      <div
                        className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-slate-200/90"
                        data-testid="badge-queue-position"
                        aria-label={isErrorState ? "Idle" : calcDone ? "Calculation in progress" : queuePosition !== null && queuePosition > 0 ? `${queuePosition} people ahead of you in queue` : "Processing your scores"}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isErrorState ? "bg-slate-500" : calcDone ? "bg-indigo-400 animate-pulse" : "bg-emerald-400/90"}`} data-testid="dot-queue" />
                        <span className="font-semibold" data-testid="text-queue-label">
                          {isErrorState ? "Idle" : calcDone ? "Processing" : (queuePosition !== null && queuePosition > 0) ? "Queue" : "Processing"}
                        </span>
                        {!calcDone && !isErrorState && queuePosition !== null && queuePosition > 0 && (
                          <span className="font-mono" data-testid="text-queue-value">
                            {queuePosition} ahead
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3" data-testid="row-onboarding-status">
                      <div
                        className="mb-2.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                        data-testid="card-onboarding-progress"
                        aria-label="Trust score calculation progress"
                      >
                        <div className="flex items-center justify-between gap-3" data-testid="row-onboarding-progress-header">
                          <div className="min-w-0">
                            <p className="text-xs font-bold tracking-[0.22em] uppercase text-slate-300/80" data-testid="text-onboarding-progress-kicker">
                              Calculation
                            </p>
                            <p
                              className="text-sm font-semibold text-white truncate"
                              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                              data-testid="text-onboarding-progress-step"
                            >
                              {isGrapeRankFailed
                                ? "Calculation failed"
                                : isPublishFailed
                                  ? "Publishing failed"
                                  : hasNoFollowing && !triggerGrapeRankMutation.isPending
                                    ? "Ready to calculate"
                                    : publishDone
                                      ? "Calculation complete"
                                      : calcDone
                                        ? "Publishing Trusted Assertion"
                                        : "Computing network trust"}
                            </p>
                          </div>
                          {!isErrorState && (
                            publishDone ? (
                              <span
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-400/30 shrink-0 animate-[scale-in_0.3s_ease-out]"
                                data-testid="check-onboarding-complete"
                                aria-label="All steps complete"
                              >
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              </span>
                            ) : (
                              <span
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 border border-white/10 shrink-0"
                                data-testid="spinner-onboarding-progress"
                                aria-label="In progress"
                              >
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/25 border-t-white/80 animate-spin" />
                              </span>
                            )
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2" data-testid="grid-onboarding-status">
                          <div
                            className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl border transition-all duration-500 ${calcDone ? "bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : isGrapeRankFailed ? "bg-red-500/10 border-red-500/20" : !calcDone && grapeRank ? "bg-white/7 border-white/15" : "bg-white/5 border-white/10 opacity-50"}`}
                            data-testid="status-onboarding-graph"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {calcDone ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 animate-[scale-in_0.3s_ease-out]" data-testid="check-onboarding-graph" />
                              ) : (
                                <div
                                  className={`w-2 h-2 rounded-full shrink-0 ${isGrapeRankFailed ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]" : !calcDone && grapeRank ? "bg-violet-300 shadow-[0_0_10px_rgba(167,139,250,0.45)] animate-pulse" : "bg-slate-600"}`}
                                  data-testid="dot-onboarding-graph"
                                />
                              )}
                              <span className={`text-xs uppercase tracking-wider font-semibold truncate ${calcDone ? "text-emerald-300" : isGrapeRankFailed ? "text-red-200" : !calcDone && grapeRank ? "text-slate-200" : "text-slate-400"}`} data-testid="text-onboarding-graph">{calcDone ? "Calculated" : "Calculating"}</span>
                            </div>
                            <span className={`hidden sm:inline text-xs font-bold tracking-[0.18em] uppercase ${calcDone ? "text-emerald-300/80" : isGrapeRankFailed ? "text-red-200/80" : grapeRank ? "text-violet-200/80" : "text-slate-400/70"}`} data-testid="badge-onboarding-graph-state">
                              {calcDone ? "Complete" : isGrapeRankFailed ? "Failed" : isErrorState ? "\u2014" : grapeRank ? "Working" : "Waiting"}
                            </span>
                          </div>

                          <div
                            className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl border transition-all duration-500 ${publishDone ? "bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : isPublishFailed ? "bg-red-500/10 border-red-500/20" : calcDone && !publishDone ? "bg-white/7 border-white/15" : "bg-white/5 border-white/10 opacity-50"}`}
                            data-testid="status-onboarding-scores"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {publishDone ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 animate-[scale-in_0.3s_ease-out]" data-testid="check-onboarding-scores" />
                              ) : (
                                <div
                                  className={`w-2 h-2 rounded-full shrink-0 ${isPublishFailed ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]" : calcDone && !publishDone ? "bg-fuchsia-300 shadow-[0_0_10px_rgba(232,121,249,0.45)] animate-pulse" : "bg-slate-600"}`}
                                  data-testid="dot-onboarding-scores"
                                />
                              )}
                              <span className={`text-xs uppercase tracking-wider font-semibold truncate ${publishDone ? "text-emerald-300" : isPublishFailed ? "text-red-200" : calcDone && !publishDone ? "text-slate-200" : "text-slate-400"}`} data-testid="text-onboarding-scores">{publishDone ? "Published" : "Publishing"}</span>
                              <span className={`hidden lg:inline text-xs font-semibold tracking-wide ${publishDone ? "text-emerald-300/70" : "text-slate-400/60"}`} data-testid="text-onboarding-scores-ta">
                                (Trusted Assertion)
                              </span>
                            </div>
                            <span className={`hidden sm:inline text-xs font-bold tracking-[0.18em] uppercase ${publishDone ? "text-emerald-300/80" : isPublishFailed ? "text-red-200/80" : calcDone ? "text-fuchsia-200/80" : "text-slate-400/70"}`} data-testid="badge-onboarding-scores-state" title="Trusted Assertion">
                              {publishDone ? "Complete" : isPublishFailed ? "Failed" : isErrorState ? "\u2014" : calcDone ? "Working" : "Waiting"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 sm:hidden text-center" data-testid="text-onboarding-status-footnote">
                        <span className="text-xs text-slate-400">
                          Final step publishes a <span className="text-slate-200 font-semibold">Trusted Assertion</span> event.
                        </span>
                      </div>

                      {(isGrapeRankFailed || isPublishFailed) && !hasNoFollowing && (
                        <div className="mt-3 flex items-center justify-center gap-3" data-testid="row-onboarding-retry">
                          {retryCount === 0 ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={triggerGrapeRankMutation.isPending}
                              onClick={() => {
                                setRetryCount(1);
                                triggerGrapeRankMutation.mutate();
                              }}
                              data-testid="button-onboarding-retry"
                            >
                              {triggerGrapeRankMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              Try Again
                            </button>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <p className="text-xs text-slate-400">Still having trouble?</p>
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all"
                                onClick={() => navigate("/settings")}
                                data-testid="button-onboarding-go-settings"
                              >
                                <SettingsIcon className="w-3.5 h-3.5" />
                                Go to Settings
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {!isOnboardingCollapsed && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
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
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setActiveOnboardingIndex((i) => (i + 1) % ONBOARDING_SLIDES.length);
                              }
                            }}
                          >
                            <div className={`h-1.5 w-full bg-gradient-to-r ${ONBOARDING_SLIDES[activeOnboardingIndex].tone}`} />

                            <div className="p-4 sm:p-5">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-400" data-testid="text-onboarding-active-subtitle">
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
                                  <p className="text-xs text-slate-400 mt-3" data-testid="text-onboarding-hint">
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
                                    className={`h-2 rounded-full transition-all ${idx === activeOnboardingIndex ? "w-6 bg-white" : "w-2 bg-white/25 hover:bg-white/40"}`}
                                    data-testid={`button-onboarding-dot-${idx}`}
                                    aria-label={`Go to slide ${idx + 1}`}
                                  />
                                ))}
                              </div>

                              <div
                                className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-slate-200 backdrop-blur-md"
                                data-testid="badge-onboarding-step"
                                aria-label={`Slide ${activeOnboardingIndex + 1} of ${ONBOARDING_SLIDES.length}`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" data-testid="dot-onboarding-step" />
                                <span className="text-xs font-semibold tracking-[0.18em] uppercase" data-testid="text-onboarding-step">
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
            )}
          </div>

          {publishDone && !nip85Activated && !nip85Dismissed && trustServiceProvider.isFetched && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="mb-6"
            >
              <Card
                className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden rounded-xl relative"
                data-testid="card-nip85-cta"
              >
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 pointer-events-none" />

                <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-white/70 border border-[#7c86ff]/20 shadow-sm flex items-center justify-center text-[#333286] shrink-0">
                    <BrainLogo size={24} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-nip85-cta-title">
                      Select Brainstorm as your Web of Trust Service Provider
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed" data-testid="text-nip85-cta-subtitle">
                      Sign a nostr note that tells compatible clients where to find your personalized trust scores.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setNip85ModalOpen(true)}
                      className="flex-1 sm:flex-none h-10 px-5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 flex items-center justify-center gap-2"
                      data-testid="button-nip85-cta"
                    >
                      <BrainLogo size={14} className="text-white/80" />
                      Select Brainstorm
                    </button>
                    <button
                      type="button"
                      onClick={() => setNip85Dismissed(true)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap"
                      data-testid="button-nip85-dismiss"
                    >
                      Maybe later
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          <ActivateBrainstormModal
            open={nip85ModalOpen}
            onOpenChange={setNip85ModalOpen}
            serviceKey={selfData?.history?.ta_pubkey || ""}
            onActivated={() => {
              setNip85Activated(true);
              setNip85ModalOpen(false);
              toast({ title: "Brainstorm activated!", description: "Your trust scores are now available across the nostr ecosystem." });
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card
                className={`bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group transition-all duration-500 rounded-xl relative h-full flex flex-col p-4 ${calcDone ? "" : "opacity-50 cursor-not-allowed"}`}
                title={!calcDone ? "Available after calculation completes" : undefined}
                data-testid="card-social-graph"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />

                <div className="flex flex-col h-full gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      Social Graph
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div
                      className={`relative rounded-xl border bg-gradient-to-br from-white via-white to-indigo-50/40 p-3 transition-all duration-300 overflow-hidden ${calcDone ? "cursor-pointer border-slate-200/80 hover:border-[#7c86ff]/40 hover:shadow-[0_8px_24px_-8px_rgba(124,134,255,0.2)] hover:-translate-y-0.5" : "border-slate-100"}`}
                      onClick={() => calcDone && navigate("/network?group=followed_by&view=list")}
                      role={calcDone ? "button" : undefined}
                      tabIndex={calcDone ? 0 : -1}
                      onKeyDown={(e) => { if (calcDone && (e.key === "Enter" || e.key === " ")) navigate("/network?group=followed_by&view=list"); }}
                      data-testid="card-trusted-followers"
                    >
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#7c86ff] to-[#333286]" />
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="p-1 rounded-md bg-[#333286]/8 text-[#333286]">
                          <Award className="h-3 w-3" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Followers</span>
                      </div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none" data-testid="text-followers-count">
                        {selfQuery.isLoading ? <BrainLogo size={20} className="animate-pulse text-indigo-300" /> : verifiedFollowersCount}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-tight" data-testid="text-followers-label">Verified followers</p>
                      {calcDone && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[#333286]/60">
                          <span>Explore</span>
                          <ChevronRight className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </div>

                    <div
                      className={`relative rounded-xl border bg-gradient-to-br from-white via-white to-violet-50/40 p-3 transition-all duration-300 overflow-hidden ${calcDone ? "cursor-pointer border-slate-200/80 hover:border-violet-400/40 hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.2)] hover:-translate-y-0.5" : "border-slate-100"}`}
                      onClick={() => calcDone && navigate("/network?group=following&view=list")}
                      role={calcDone ? "button" : undefined}
                      tabIndex={calcDone ? 0 : -1}
                      onKeyDown={(e) => { if (calcDone && (e.key === "Enter" || e.key === " ")) navigate("/network?group=following&view=list"); }}
                      data-testid="card-trusted-following"
                    >
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-[#7c86ff]" />
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="p-1 rounded-md bg-violet-500/8 text-violet-600">
                          <UserPlus className="h-3 w-3" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Following</span>
                      </div>
                      <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none" data-testid="text-following-count">
                        {selfQuery.isLoading ? <BrainLogo size={20} className="animate-pulse text-indigo-300" /> : verifiedFollowingCount}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-tight" data-testid="text-following-label">Verified following</p>
                      {calcDone && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-violet-500/60">
                          <span>Explore</span>
                          <ChevronRight className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live
                    </div>
                    <span
                      className={`inline-flex items-center h-7 px-3 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 ${calcDone ? "cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors" : ""}`}
                      onClick={() => calcDone && navigate("/network")}
                      role={calcDone ? "button" : undefined}
                      tabIndex={calcDone ? 0 : -1}
                      data-testid="button-view-all-network"
                    >
                      View All
                      <ChevronRight className="ml-1.5 h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Card>
            </motion.div>

            <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
              <DialogContent
                className="sm:max-w-[620px] rounded-3xl border border-[#7c86ff]/20 bg-gradient-to-b from-white/92 via-white/88 to-indigo-50/60 backdrop-blur-xl shadow-[0_60px_140px_-70px_rgba(51,50,134,0.75)] overflow-hidden p-0"
                data-testid="dialog-network-alerts-preview"
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
                  <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/15 blur-[110px]" />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,134,255,0.14)_0%,rgba(255,255,255,0.00)_40%,rgba(51,50,134,0.12)_100%)]" />
                </div>

                <div
                  className="absolute -right-14 top-[1.1rem] z-30 rotate-45 bg-[#333286] px-14 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-lg shadow-black/20 ring-1 ring-white/15"
                  data-testid="ribbon-dialog-network-alerts-coming-soon"
                  aria-label="Coming soon"
                >
                  Coming soon
                </div>

                <div className="relative">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" />
                  <div className="px-6 pt-6 pb-5">
                    <DialogHeader>
                      <div className="flex items-start justify-between gap-4 pr-10">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-white/70 border border-[#7c86ff]/20 shadow-sm flex items-center justify-center text-[#333286]" data-testid="icon-network-alerts-dialog">
                            <ShieldAlert className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <DialogTitle className="text-xl font-bold text-slate-900 leading-none tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-network-alerts-dialog-title">
                              Network Alerts
                            </DialogTitle>
                            <DialogDescription className="text-sm text-slate-600 mt-1 leading-relaxed" data-testid="text-network-alerts-dialog-subtitle">
                              This feature is coming soon. We'll flag accounts that may be impersonators, spammers, or behaving unusually so you can keep your network clean.
                            </DialogDescription>
                          </div>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-30 pointer-events-none select-none" data-testid="grid-network-alerts-dialog-signals">
                      {[{ label: "Spoof detection", desc: "Look-alikes & impostors" }, { label: "Spam pressure", desc: "Mass-follow patterns" }, { label: "Trust drops", desc: "Fast score collapse" }].map((s, idx) => (
                        <div key={s.label} className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md px-3 py-2.5 shadow-sm" data-testid={`card-network-alerts-dialog-signal-${idx}`}>
                          <div className="text-xs font-bold text-slate-900" data-testid={`text-network-alerts-dialog-signal-label-${idx}`}>{s.label}</div>
                          <div className="text-xs text-slate-600 mt-1" data-testid={`text-network-alerts-dialog-signal-desc-${idx}`}>{s.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-6 pb-6 relative">
                    <div className="rounded-3xl border border-slate-200/70 bg-white/65 backdrop-blur-md shadow-sm overflow-hidden opacity-30 pointer-events-none select-none blur-[2px]">
                      <div className="px-4 py-3 border-b border-slate-200/60 bg-gradient-to-r from-white/75 to-indigo-50/45">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-bold text-slate-900" data-testid="text-network-alerts-dialog-summary-title">Your Network Signals</div>
                          <div className="text-xs font-mono text-slate-500" data-testid="text-network-alerts-dialog-summary-meta">From your social graph</div>
                        </div>
                      </div>

                      <div className="p-4 space-y-2" data-testid="list-network-alerts-dialog-signals">
                        {reportedByCount > 0 && (
                          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200/60 bg-gradient-to-r from-white/70 to-red-50/35 px-3 py-2.5" data-testid="row-dialog-reported-by">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-red-100 border border-red-200 flex items-center justify-center">
                                <ShieldAlert className="h-4 w-4 text-red-500" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-900">Reported By</div>
                                <div className="text-xs text-slate-500">{reportedByCount} {reportedByCount === 1 ? "user has" : "users have"} reported you</div>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 no-default-hover-elevate no-default-active-elevate">{reportedByCount}</Badge>
                          </div>
                        )}
                        {mutedByCount > 0 && (
                          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-white/70 to-amber-50/35 px-3 py-2.5" data-testid="row-dialog-muted-by">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
                                <VolumeX className="h-4 w-4 text-amber-500" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-900">Muted By</div>
                                <div className="text-xs text-slate-500">{mutedByCount} {mutedByCount === 1 ? "user has" : "users have"} muted you</div>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 no-default-hover-elevate no-default-active-elevate">{mutedByCount}</Badge>
                          </div>
                        )}
                        {reportedByCount === 0 && mutedByCount === 0 && (
                          <div className="text-center py-6" data-testid="row-dialog-no-signals">
                            {selfQuery.isLoading ? (
                              <>
                                <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-2 animate-pulse" />
                                <p className="text-sm font-bold text-slate-500">Loading signals...</p>
                              </>
                            ) : (
                              <>
                                <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-2">
                                  <Check className="h-5 w-5 text-emerald-500" />
                                </div>
                                <p className="text-sm font-bold text-slate-900">All clear</p>
                                <p className="text-xs text-slate-500 mt-0.5">No reports or mutes detected in your network.</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card
                className="bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 rounded-xl relative h-full flex flex-col p-4 cursor-pointer"
                onClick={() => {
                  setRiskDialogOpen(true);
                  if (riskTeaserTimerRef.current) { window.clearTimeout(riskTeaserTimerRef.current); riskTeaserTimerRef.current = null; }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { setRiskDialogOpen(true); }
                }}
                data-testid="card-network-alerts"
                aria-label="Open Network Alerts preview"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />

                <div
                  className="absolute -right-12 top-[0.85rem] z-30 rotate-45 bg-[#333286] px-12 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white shadow-lg shadow-black/20 ring-1 ring-white/15"
                  data-testid="ribbon-network-alerts-coming-soon"
                  aria-label="Coming soon"
                >
                  Coming soon
                </div>
                <div
                  className="absolute inset-0 z-10"
                  data-testid="overlay-network-alerts-coming-soon"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRiskDialogOpen(true); }}
                  role="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{ pointerEvents: "auto" }}
                >
                  <div className="absolute -inset-16 bg-[conic-gradient(from_210deg_at_50%_50%,rgba(124,134,255,0.0),rgba(124,134,255,0.10),rgba(51,50,134,0.10),rgba(124,134,255,0.0))] blur-2xl opacity-70" />
                  <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px]" />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.02)_45%,rgba(15,23,42,0.00)_60%)]" />
                </div>

                <div className="absolute top-0 right-0 p-3 z-20">
                  {(reportedByCount + mutedByCount) > 0 && <div className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />}
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

                  <p className="text-xs text-slate-500 leading-tight">
                    {selfQuery.isLoading ? (
                      <span className="text-slate-400">Loading signals...</span>
                    ) : (reportedByCount + mutedByCount) > 0 ? (
                      <><strong className="text-slate-900">{reportedByCount + mutedByCount} signals</strong> from your network.</>
                    ) : (
                      <span className="text-slate-400">No risk signals detected.</span>
                    )}
                  </p>

                  <div className="space-y-1.5 mt-1">
                    {reportedByCount > 0 && (
                      <div className="flex items-center justify-between p-1.5 rounded bg-red-50/50 border border-red-200/60" data-testid="row-reported-by-count">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                            <ShieldAlert className="h-2.5 w-2.5 text-red-500" />
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <p className="text-xs font-bold text-slate-800 leading-none">Reported By</p>
                            <p className="text-xs text-red-600/70 font-medium leading-none mt-0.5">{reportedByCount} {reportedByCount === 1 ? "user" : "users"}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {mutedByCount > 0 && (
                      <div className="flex items-center justify-between p-1.5 rounded bg-amber-50/50 border border-amber-200/60" data-testid="row-muted-by-count">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                            <VolumeX className="h-2.5 w-2.5 text-amber-500" />
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <p className="text-xs font-bold text-slate-800 leading-none">Muted By</p>
                            <p className="text-xs text-amber-600/70 font-medium leading-none mt-0.5">{mutedByCount} {mutedByCount === 1 ? "user" : "users"}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className={`bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden rounded-xl relative h-full flex flex-col p-4 transition-all duration-500 ${isCalculationComplete ? "group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1" : ""}`}>
                {!isCalculationComplete && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center rounded-xl" data-testid="overlay-extended-reach-calculating">
                    {isErrorState ? (
                      <>
                        <Network className="w-5 h-5 text-slate-300 mb-2" />
                        <span className="text-xs font-semibold text-slate-500 tracking-wide">Calculate scores to unlock</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mb-2" />
                        <span className="text-xs font-semibold text-slate-500 tracking-wide">Scores calculating...</span>
                      </>
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className={`h-1 w-full absolute top-0 left-0 ${isCalculationComplete ? "bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" : "bg-slate-200"}`} />

                <div className={`flex flex-col h-full gap-2 ${!isCalculationComplete ? "opacity-30 pointer-events-none select-none" : ""}`}>
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
                          <p className="text-xs leading-relaxed">
                            This metric represents your total discoverable network size. It counts unique identities connected to you through your trusted followers.
                          </p>
                          <p className="text-xs leading-relaxed border-t border-slate-100 pt-1 mt-1">
                            <span className="font-semibold text-indigo-600">Hops:</span> Increasing hops expands your view to friends of friends (2 hops) and further, exponentially growing your reach.
                          </p>
                        </div>
                      </TooltipContent>
                    </UITooltip>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight leading-none mb-1" data-testid="text-extended-network-count">
                      {selfQuery.isLoading || !isCalculationComplete ? <BrainLogo size={20} className="animate-pulse text-indigo-300" /> : extendedNetworkCount.toLocaleString()}
                    </div>
                    <p className="text-xs text-slate-400" data-testid="text-extended-network-label">Unique profiles in range</p>
                  </div>

                  <div className="mt-auto space-y-2 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between text-xs font-medium text-slate-600">
                      <span>Reach Depth</span>
                      <span className="text-indigo-600 font-bold">{hopRange[0] === hopRange[1] ? `${hopRange[0]}` : `${hopRange[0]}\u2013${hopRange[1]}`} Hops</span>
                    </div>
                    <Slider
                      value={hopRange}
                      onValueChange={(v) => {
                        if (!isCalculationComplete) return;
                        const next = (v ?? [1, maxHopInData]).slice(0, 2) as number[];
                        const lo = Math.min(next[0] ?? 1, next[1] ?? 1);
                        const hi = Math.min(maxHopInData, Math.max(next[0] ?? 1, next[1] ?? 1));
                        setHopRange([lo, hi]);
                        if (lo !== 1 || hi !== 1) setHealthView("followers");
                      }}
                      max={maxHopInData}
                      min={1}
                      step={1}
                      className={isCalculationComplete ? "cursor-pointer py-1" : "cursor-not-allowed py-1 opacity-50"}
                      disabled={!isCalculationComplete}
                    />
                    <div className="flex justify-between text-xs text-slate-400 uppercase tracking-wider font-semibold">
                      <span>Direct</span>
                      <span>Global</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {!hasNoFollowing && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-3 space-y-6">
              <Card className={`bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden rounded-xl relative min-h-[300px] transition-all duration-500 ${isCalculationComplete ? "group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1" : ""}`}>
                {!isCalculationComplete && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center rounded-xl" data-testid="overlay-network-health-calculating">
                    {isErrorState ? (
                      <>
                        <Users className="w-6 h-6 text-slate-300 mb-2" />
                        <span className="text-sm font-semibold text-slate-500 tracking-wide">Calculate scores to unlock</span>
                        <span className="text-xs text-slate-400 mt-1">Network health data will appear once scores are ready</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-2" />
                        <span className="text-sm font-semibold text-slate-500 tracking-wide">Scores calculating...</span>
                        <span className="text-xs text-slate-400 mt-1">Network health data will appear once scores are ready</span>
                      </>
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className={`h-1 w-full ${isCalculationComplete ? "bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x" : "bg-slate-200"}`} />

                <div className={!isCalculationComplete ? "opacity-30 pointer-events-none select-none" : ""}>
                <CardHeader className="bg-gradient-to-b from-[#7c86ff]/15 to-white/60 border-b border-[#7c86ff]/10 py-3 px-5 transition-colors duration-500 group-hover:from-[#7c86ff]/25 group-hover:to-white/80">
                  <div className="flex flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-100 shadow-sm text-[#333286] ring-1 ring-slate-100">
                        <Users className="h-3.5 w-3.5" />
                      </div>
                      <div className="bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-2xl border border-slate-100 shadow-sm relative">
                        <CardTitle className="text-xs font-bold text-slate-800 tracking-tight relative z-10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          Network Health
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs font-medium uppercase tracking-wide relative z-10" data-testid="text-network-health-subtitle">
                          {selfQuery.isLoading || !isCalculationComplete ? "Computing\u2026" : hopRange[0] === 1 && hopRange[1] === 1 ? "Your direct followers" : `${extendedNetworkCount.toLocaleString()} people within ${hopRange[0]}\u2013${hopRange[1]} hops`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="px-2 py-0.5 rounded-full bg-[#7c86ff]/10 text-xs font-bold text-[#333286] border border-[#7c86ff]/20 uppercase tracking-wider flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                      <span className="text-[#333286]">WITHIN {hopRange[0] === hopRange[1] ? `${hopRange[0]} HOP` : `${hopRange[0]}\u2013${hopRange[1]} HOPS`}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col md:flex-row items-center gap-6 px-4 sm:px-8">
                    <div className="h-48 w-full md:w-5/12">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={(() => { const isHop1 = hopRange[0] === 1 && hopRange[1] === 1; return (isHop1 && healthView === "following" ? followingPieData : currentPieData).filter((d: { value: number }) => d.value > 0); })()} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" stroke="none" style={isCalculationComplete && calcDone ? { cursor: "pointer" } : undefined} onClick={(_data: any, index: number) => { if (!isCalculationComplete || !calcDone) return; const isHop1 = hopRange[0] === 1 && hopRange[1] === 1; const sliceData = (isHop1 && healthView === "following" ? followingPieData : currentPieData).filter((d: { value: number }) => d.value > 0); const tierMap: Record<string, string> = { "Highly Trusted": "high", "Trusted": "medium", "Neutral": "neutral", "Low Trust": "low", "Unverified": "unverified", "Flagged": "flagged" }; const tier = tierMap[sliceData[index]?.name]; const group = isHop1 && healthView === "following" ? "following" : "followed_by"; if (tier) navigate(`/network?trust=${tier}&group=${group}`); }}>
                            {(() => { const isHop1 = hopRange[0] === 1 && hopRange[1] === 1; const sliceData = (isHop1 && healthView === "following" ? followingPieData : currentPieData).filter((d: { value: number }) => d.value > 0); return sliceData.map((entry: { color: string }, index: number) => (
                              <Cell key={`cell-${index}`} fill={isCalculationComplete ? entry.color : "#cbd5e1"} style={isCalculationComplete && calcDone ? { cursor: "pointer" } : undefined} />
                            )); })()}
                          </Pie>
                          {isCalculationComplete && (
                          <Tooltip
                            formatter={(value: number, _name: string) => {
                              if (selfQuery.isLoading) return ["\u2014", ""];
                              const hopLabel = hopRange[0] === hopRange[1] ? `Hop ${hopRange[0]}` : `Hops ${hopRange[0]}–${hopRange[1]}`;
                              return [`${value.toLocaleString()} profiles · ${hopLabel}`, ""];
                            }}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "1px solid #e2e8f0",
                              backgroundColor: "#ffffff",
                              color: "#0f172a",
                              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              fontSize: "12px",
                            }}
                            itemStyle={{ color: "#0f172a" }}
                          />
                          )}
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {(() => {
                      const isHop1 = hopRange[0] === 1 && hopRange[1] === 1;
                      const activePieData = isHop1 && healthView === "following" ? followingPieData : currentPieData;
                      const activeTierCounts = isHop1 && healthView === "following" ? directFollowingTierCounts : directTierCounts;
                      const activeGroup = isHop1 && healthView === "following" ? "following" : "followed_by";
                      const totalActive = activePieData.reduce((acc, curr) => acc + curr.value, 0);
                      return (
                    <div className="w-full md:w-7/12 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 sm:gap-y-3">
                      <div className="col-span-1 sm:col-span-2 mb-1">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{isHop1 ? (healthView === "following" ? "Following Trust Breakdown" : "Follower Trust Breakdown") : "Network Composition"}</h4>
                            <p className="text-xs text-slate-500">{isHop1 ? (healthView === "following" ? "Trust quality of who you follow" : "How your followers rank by trust") : "Breakdown by trust signal strength"}</p>
                          </div>
                          {isHop1 && (
                            <div className="flex items-center rounded-full bg-slate-100 p-0.5 shrink-0" data-testid="toggle-health-view">
                              <button type="button" className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${healthView === "followers" ? "bg-[#3730a3] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setHealthView("followers")} data-testid="toggle-health-followers">Followers</button>
                              <button type="button" className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${healthView === "following" ? "bg-[#3730a3] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setHealthView("following")} data-testid="toggle-health-following">Following</button>
                            </div>
                          )}
                        </div>
                      </div>
                      {activePieData.map((dist, i) => {
                        const tierMap: Record<string, string> = { "Highly Trusted": "high", "Trusted": "medium", "Neutral": "neutral", "Low Trust": "low", "Unverified": "unverified", "Flagged": "flagged" };
                        const tier = tierMap[dist.name];
                        const canClick = isCalculationComplete && calcDone && !!tier;
                        const directCount = tier ? activeTierCounts[tier] ?? 0 : 0;
                        return (
                        <div key={i} className={`group flex items-center gap-2 p-2 rounded-lg transition-colors border border-transparent hover:border-slate-100 ${canClick ? "cursor-pointer hover:bg-indigo-50/60" : "cursor-default hover:bg-slate-50"}`} onClick={() => { if (canClick) navigate(`/network?trust=${tier}&group=${activeGroup}`); }} data-testid={`link-pie-tier-${tier || i}`}>
                          <div className="w-2.5 h-2.5 rounded-full shadow-sm ring-2 ring-white shrink-0" style={{ backgroundColor: isCalculationComplete ? dist.color : "#cbd5e1" }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1 gap-2">
                              <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5 min-w-0">
                                <p className="font-bold text-xs text-slate-900 truncate">{dist.name}</p>
                                {isCalculationComplete && tier && <span className="text-[10px] text-slate-400 truncate">{isHop1 ? (healthView === "following" ? `${directCount} following` : `${directCount} of your followers`) : `${dist.value.toLocaleString()} profiles`}</span>}
                              </div>
                              <span className="text-xs font-mono text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" data-testid={`text-network-composition-percent-${i}`}>
                                {selfQuery.isLoading || !isCalculationComplete ? <BrainLogo size={12} className="animate-pulse text-indigo-300 inline-block" /> : `${((dist.value / totalActive) * 100).toFixed(1)}%`}
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: isCalculationComplete ? `${(dist.value / totalActive) * 100}%` : "0%" }}
                                transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: isCalculationComplete ? dist.color : "#cbd5e1" }}
                              />
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                      );
                    })()}
                  </div>
                </CardContent>
                </div>
              </Card>
            </motion.div>
          </div>)}

          {false && (
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mb-8">
              <Card className="bg-gradient-to-br from-[#333286] via-[#1e1b4b] to-slate-950 text-white border-[#7c86ff]/20 shadow-[0_20px_60px_-15px_rgba(51,50,134,0.3)] overflow-hidden relative group" onMouseMove={handleMouseMove}>
                <div className="relative z-10 p-6 sm:p-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Discover Your Tribe
                  </h2>
                  <p className="text-indigo-200/70 mt-2 max-w-xl text-sm sm:text-base font-light">
                    Identify and connect with high-signal clusters in the global trust graph matching your interests.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    {INTEREST_CLUSTERS.map((cluster) => (
                      <div key={cluster.id} className="relative rounded-2xl overflow-hidden cursor-pointer group/cluster">
                        <img src={cluster.image} alt={cluster.label} className="w-full h-32 object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-sm font-bold text-white">{cluster.label}</p>
                          <p className="text-xs text-white/60">{cluster.count.toLocaleString()} {cluster.unit}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {false && (
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mb-8 text-center">
              <h2 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Grow Your Network
                </span>
              </h2>
            </motion.div>
          )}

          <div className="w-screen relative left-[calc(-50vw+50%)] py-12 mb-12 overflow-hidden group">
            <div className="absolute inset-0 bg-[#020617] border-y border-indigo-500/20">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#818cf810_1px,transparent_1px),linear-gradient(to_bottom,#818cf810_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
              <div className="absolute -left-[10%] -top-[50%] w-[50%] h-[200%] bg-indigo-600/10 blur-[120px] rotate-12 animate-pulse" style={{ animationDuration: "8s" }} />
              <div className="absolute -right-[10%] -bottom-[50%] w-[50%] h-[200%] bg-violet-600/10 blur-[120px] -rotate-12 animate-pulse" style={{ animationDuration: "10s" }} />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-12">
                <div className="flex-shrink-0 relative group-hover:scale-110 transition-transform duration-700 ease-out">
                  <div className="absolute -inset-8 bg-indigo-500/20 blur-2xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-700 animate-pulse" />
                  <BrainLogo size={80} className="relative z-10 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)] text-indigo-400" />
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
                    variant="ghost"
                    className="!bg-white !text-indigo-950 border-none font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] h-12 px-8 rounded-full transition-all duration-300 group/btn transform hover:-translate-y-0.5"
                    onClick={() => navigate("/what-is-wot")}
                    data-testid="button-learn-wot"
                  >
                    Learn about WOT?
                    <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform text-indigo-600" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mb-8">
            <Carousel opts={{ align: "start", loop: true }} className="relative" data-testid="carousel-supported-clients">
              <CarouselContent className="-ml-4">
                <CarouselItem className="pl-4 basis-full" data-testid="slide-supported-client-amethyst">
                  <Card
                    className="relative overflow-hidden border-0 bg-gradient-to-r from-[#2a1b4e] to-[#1a1638] ring-1 ring-white/10 shadow-[0_18px_58px_-40px_rgba(0,0,0,0.55)] group cursor-pointer hover:shadow-[0_22px_70px_-42px_rgba(0,0,0,0.62)] transition-all duration-500 w-full rounded-3xl"
                    onClick={() => {
                      const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      el?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("a, button:not([data-testid='button-supported-slide-next-from-amethyst'])")) {
                        e.preventDefault();
                        const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                        el?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
                      }
                    }}
                    data-testid="button-supported-slide-next-from-amethyst"
                    aria-label="Next supported client"
                  >
                    <div className="absolute inset-0 z-0">
                      <img src={amethystHeroImg} alt="Amethyst App Interface" className="w-full h-full object-cover opacity-30 mix-blend-overlay group-hover:opacity-40 transition-opacity duration-700 group-hover:scale-105 transform" />
                      <div className="absolute inset-0 bg-gradient-to-b sm:bg-gradient-to-r from-[#1a1033] via-[#1a1033]/90 to-[#1a1033]/60 sm:to-transparent" />
                    </div>

                    <div className="relative z-10 p-5 sm:p-10 flex flex-col md:flex-row items-center gap-4 sm:gap-8 min-h-[340px] sm:min-h-[420px] pb-8 sm:pb-10">
                      <div className="flex-1 space-y-4 sm:space-y-6 text-center md:text-left">
                        <div className="inline-flex items-center gap-2" data-testid="badge-supported-clients">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-400/20 text-purple-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                              <line x1="12" y1="18" x2="12.01" y2="18" />
                            </svg>
                            <span>Supported Clients</span>
                          </div>
                          <div className="relative group/info">
                            <button
                              type="button"
                              className="h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-purple-300 hover:bg-white/20 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="What are Supported Clients?"
                              data-testid="button-supported-clients-info"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                            <div className="absolute left-0 top-full mt-2 w-64 sm:w-80 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs text-slate-200 leading-relaxed opacity-0 invisible group-focus-within/info:opacity-100 group-focus-within/info:visible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 z-50 pointer-events-none group-focus-within/info:pointer-events-auto group-hover/info:pointer-events-auto" data-testid="tooltip-supported-clients">
                              These are Nostr clients that use personalized trust scores calculated by Brainstorm and other Web of Trust Service Providers via NIP-85: Trusted Assertions or other integration methods.
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex flex-col md:flex-row items-center gap-3 sm:gap-4 justify-center md:justify-start">
                            <img src={amethystLogoImg} alt="Amethyst Logo" className="w-12 h-12 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl shadow-lg ring-1 ring-white/10" data-testid="img-supported-amethyst-logo" />
                            <div className="space-y-0.5 sm:space-y-1 text-center md:text-left">
                              <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-supported-amethyst-title">
                                Amethyst
                              </h2>
                              <p className="text-xs sm:text-sm font-medium text-purple-300/80 uppercase tracking-widest" data-testid="text-supported-amethyst-tagline">The Future of Social</p>
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-400/25 text-purple-200 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mt-1" data-testid="badge-amethyst-nip85">
                                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span>NIP-85</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-sm sm:text-lg text-slate-300/90 font-light leading-relaxed max-w-xl mx-auto md:mx-0" data-testid="text-supported-amethyst-description">Experience true freedom with the premier Android client for Nostr. Direct, intermediary-free communication in a beautiful, feature-rich interface.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2 justify-center md:justify-start" data-testid="row-supported-amethyst-cta">
                          <a href="https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst" target="_blank" rel="noopener noreferrer" data-testid="link-supported-amethyst-android" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="w-full sm:w-auto !bg-white !text-[#1a1033] font-bold h-10 sm:h-11 px-5 sm:px-6 rounded-xl shadow-lg shadow-purple-900/20 transition-all hover:scale-105 border-none text-sm sm:text-base" data-testid="button-supported-amethyst-android">
                              <Download className="mr-2 h-4 w-4" />
                              Download for Android
                            </Button>
                          </a>
                          <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" data-testid="link-supported-amethyst-learn" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="w-full sm:w-auto !bg-[#3b73b4] !text-[#ffffff] font-bold h-10 sm:h-11 px-5 sm:px-6 rounded-xl shadow-lg shadow-[#333286]/30 transition-all hover:scale-105 border-none text-sm sm:text-base" data-testid="button-supported-amethyst-learn">
                              Learn More
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>

                      <div className="hidden md:block w-1/3 relative h-64" aria-hidden="true">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-purple-500/20 rounded-full animate-pulse pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-purple-400/10 rounded-full pointer-events-none" />
                      </div>
                    </div>
                  </Card>
                </CarouselItem>

                <CarouselItem className="pl-4 basis-full" data-testid="slide-supported-client-nostria">
                  <Card
                    className="relative overflow-hidden border-0 bg-gradient-to-r from-[#f26b1d] via-[#f59f2e] to-[#f7b24a] ring-1 ring-white/15 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.55)] group cursor-pointer hover:shadow-[0_28px_90px_-46px_rgba(0,0,0,0.62)] transition-all duration-500 w-full rounded-3xl"
                    onClick={() => {
                      const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      el?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("a, button:not([data-testid='button-supported-slide-next-from-nostria'])")) {
                        e.preventDefault();
                        const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                        el?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
                      }
                    }}
                    data-testid="button-supported-slide-next-from-nostria"
                    aria-label="Next supported client"
                  >
                    <div
                      className="absolute -right-14 sm:-right-16 top-[0.7rem] sm:top-[1.1rem] z-20 rotate-45 bg-[#333286] px-12 sm:px-16 py-1.5 sm:py-2 text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-white shadow-lg shadow-black/20 ring-1 ring-white/15"
                      data-testid="ribbon-nostria-coming-soon"
                      aria-label="Coming soon"
                    >
                      Coming soon
                    </div>
                    <div className="absolute inset-0 z-0">
                      <img src={nostriaHeroImg} alt="Nostria" className="w-full h-full object-cover opacity-35 mix-blend-overlay group-hover:opacity-45 transition-opacity duration-700 group-hover:scale-105 transform" />
                      <img src={nostriaManifestoImg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.20] mix-blend-soft-light pointer-events-none" aria-hidden="true" data-testid="img-nostria-manifesto-overlay" />
                      <img
                        src={nostriaTeaserImg}
                        alt=""
                        className="absolute right-[-24%] top-[-14%] w-[80%] h-auto opacity-[0.52] mix-blend-soft-light saturate-[0.92] contrast-[1.04] brightness-[1.06] rotate-[-2deg] blur-[0.35px] pointer-events-none hidden sm:block"
                        style={{
                          WebkitMaskImage: "radial-gradient(84% 86% at 60% 42%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 46%, rgba(0,0,0,0) 82%)",
                          maskImage: "radial-gradient(84% 86% at 60% 42%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 46%, rgba(0,0,0,0) 82%)",
                        }}
                        aria-hidden="true"
                        data-testid="img-nostria-ui-teaser"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b sm:bg-gradient-to-r from-[#3a1606] via-[#3a1606]/85 to-[#3a1606]/60 sm:to-transparent" />
                    </div>

                    <div className="relative z-10 p-5 sm:p-10 flex flex-col md:flex-row items-center gap-4 sm:gap-8 min-h-[340px] sm:min-h-[420px] pb-8 sm:pb-10">
                      <div className="flex-1 space-y-4 sm:space-y-6 text-center md:text-left">
                        <div className="inline-flex items-center gap-2" data-testid="badge-supported-clients-nostria">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-200/10 border border-orange-200/20 text-orange-100 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                              <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                              <line x1="12" y1="18" x2="12.01" y2="18" />
                            </svg>
                            <span>Supported Clients</span>
                          </div>
                          <div className="relative group/info">
                            <button
                              type="button"
                              className="h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-orange-100 hover:bg-white/20 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-orange-300/50"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="What are Supported Clients?"
                              data-testid="button-supported-clients-info-nostria"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                            <div className="absolute left-0 top-full mt-2 w-64 sm:w-80 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs text-slate-200 leading-relaxed opacity-0 invisible group-focus-within/info:opacity-100 group-focus-within/info:visible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 z-50 pointer-events-none group-focus-within/info:pointer-events-auto group-hover/info:pointer-events-auto" data-testid="tooltip-supported-clients-nostria">
                              These are Nostr clients that use personalized trust scores calculated by Brainstorm and other Web of Trust Service Providers via NIP-85: Trusted Assertions or other integration methods.
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex flex-col md:flex-row items-center gap-3 sm:gap-4 justify-center md:justify-start">
                            <img src={nostriaIconImg} alt="Nostria Logo" className="w-12 h-12 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl shadow-lg ring-1 ring-white/10 bg-white object-contain" data-testid="img-supported-nostria-logo" />
                            <div className="space-y-0.5 sm:space-y-1 text-center md:text-left">
                              <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-supported-nostria-title">
                                Nostria
                              </h2>
                              <p className="text-xs sm:text-sm font-medium text-orange-100/80 uppercase tracking-widest" data-testid="text-supported-nostria-tagline">Built for human connections</p>
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-200/15 border border-orange-200/25 text-orange-100 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mt-1" data-testid="badge-nostria-nip85">
                                <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                <span>NIP-85</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-sm sm:text-lg text-orange-50/90 font-light leading-relaxed max-w-xl mx-auto md:mx-0" data-testid="text-supported-nostria-description">
                            Get started in seconds. No email. No phone. Just you. A clean, scalable Nostr client focused on ownership, privacy, and a calmer social experience.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2 justify-center md:justify-start" data-testid="row-supported-nostria-cta">
                          <a href="https://play.google.com/store/apps/details?id=app.nostria.twa" target="_blank" rel="noopener noreferrer" data-testid="link-supported-nostria-android" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="w-full sm:w-auto !bg-white !text-[#3a1606] font-bold h-10 sm:h-11 px-5 sm:px-6 rounded-xl shadow-lg shadow-orange-900/20 transition-all hover:scale-105 border-none text-sm sm:text-base" data-testid="button-supported-nostria-android">
                              <Download className="mr-2 h-4 w-4" />
                              Download for Android
                            </Button>
                          </a>
                          <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" data-testid="link-supported-nostria-learn" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="w-full sm:w-auto font-bold h-10 sm:h-11 px-5 sm:px-6 rounded-xl shadow-lg shadow-orange-900/10 transition-all hover:scale-105 border border-white/15 text-sm sm:text-base" style={{ backgroundColor: '#ffffff26', color: 'white' }} data-testid="button-supported-nostria-learn">
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

                <CarouselItem className="pl-4 basis-full" data-testid="slide-supported-client-developer">
                  <Card
                    className="relative overflow-hidden border-0 bg-gradient-to-r from-[#1a1033] to-[#0f172a] ring-1 ring-white/10 shadow-[0_18px_58px_-40px_rgba(0,0,0,0.55)] group cursor-pointer hover:shadow-[0_22px_70px_-42px_rgba(0,0,0,0.62)] transition-all duration-500 w-full rounded-3xl"
                    onClick={() => {
                      const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      el?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("a, button:not([data-testid='button-supported-slide-next-from-developer'])")) {
                        e.preventDefault();
                        const el = document.querySelector('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                        el?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
                      }
                    }}
                    data-testid="button-supported-slide-next-from-developer"
                    aria-label="Next supported client"
                  >
                    <div className="absolute inset-0 z-0">
                      <img
                        src={brainstormHeroImg}
                        alt=""
                        className="absolute right-[-10%] top-[5%] w-[75%] h-auto opacity-[0.45] mix-blend-screen saturate-[0.8] brightness-[0.95] pointer-events-none group-hover:opacity-[0.55] transition-opacity duration-700 hidden sm:block"
                        style={{
                          WebkitMaskImage: "radial-gradient(80% 80% at 60% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 80%)",
                          maskImage: "radial-gradient(80% 80% at 60% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 80%)",
                        }}
                        aria-hidden="true"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b sm:bg-gradient-to-r from-[#1a1033] via-[#1a1033]/85 to-[#1a1033]/60 sm:to-transparent" />
                    </div>

                    <div className="relative z-10 p-5 sm:p-10 flex flex-col md:flex-row items-center gap-4 sm:gap-8 min-h-[340px] sm:min-h-[420px] pb-8 sm:pb-10">
                      <div className="flex-1 space-y-4 sm:space-y-6 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md" data-testid="badge-for-developers">
                          <Terminal className="h-3 w-3" aria-hidden="true" />
                          <span>For Developers</span>
                        </div>

                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex flex-col md:flex-row items-center gap-3 sm:gap-4 justify-center md:justify-start">
                            <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl shadow-lg ring-1 ring-white/10 bg-[#1a1033] flex items-center justify-center" data-testid="img-developer-brainlogo">
                              <BrainLogo size={32} className="text-white sm:hidden" />
                              <BrainLogo size={48} className="text-white hidden sm:block" />
                            </div>
                            <div className="space-y-0.5 sm:space-y-1 text-center md:text-left">
                              <h2 className="text-xl sm:text-4xl font-bold text-white tracking-tight leading-tight sm:leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-developer-title">
                                Get Your Client Featured
                              </h2>
                              <p className="text-xs sm:text-sm font-medium text-indigo-300/80 uppercase tracking-widest" data-testid="text-developer-tagline">Join the NIP-85 Ecosystem</p>
                            </div>
                          </div>
                          <p className="text-sm sm:text-lg text-slate-300/90 font-light leading-relaxed max-w-xl mx-auto md:mx-0" data-testid="text-developer-description">Does your Nostr client support NIP-85? Get free promotion to our growing user base. We'll showcase your app right here alongside other supported clients.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2 justify-center md:justify-start" data-testid="row-developer-cta">
                          <a href="mailto:support@nosfabrica.com?subject=NIP-85%20Client%20Listing" data-testid="link-developer-contact" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="w-full sm:w-auto !bg-white !text-[#1a1033] font-bold h-10 sm:h-11 px-5 sm:px-6 rounded-xl shadow-lg shadow-purple-900/20 transition-all hover:scale-105 border-none text-sm sm:text-base" data-testid="button-developer-contact">
                              <Mail className="mr-2 h-4 w-4" />
                              Contact Us
                            </Button>
                          </a>
                          <a href="https://github.com/nostr-protocol/nips/blob/master/85.md" target="_blank" rel="noopener noreferrer" data-testid="link-developer-nip85" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="w-full sm:w-auto !bg-indigo-600 !text-white font-bold h-10 sm:h-11 px-5 sm:px-6 rounded-xl shadow-lg shadow-indigo-900/30 transition-all hover:scale-105 border-none text-sm sm:text-base" data-testid="button-developer-nip85">
                              View NIP-85 Spec
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>

                      <div className="hidden md:block w-1/3 relative h-64" aria-hidden="true">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/15 rounded-full blur-[90px] pointer-events-none" />
                      </div>
                    </div>
                  </Card>
                </CarouselItem>
              </CarouselContent>

              <div
                className="flex justify-center mt-3 sm:mt-0 sm:absolute sm:bottom-3 sm:right-3 items-center gap-2 rounded-full bg-black/20 border border-white/15 px-3 py-2 backdrop-blur-md shadow-lg w-fit mx-auto sm:mx-0 sm:w-auto"
                data-testid="nav-supported-carousel-dots"
              >
                {[0, 1, 2].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="h-2.5 w-2.5 rounded-full bg-white/40 hover:bg-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label={idx === 0 ? "Go to Amethyst slide" : idx === 1 ? "Go to Nostria slide" : "Go to developer slide"}
                    data-testid={idx === 0 ? "dot-supported-amethyst" : idx === 1 ? "dot-supported-nostria" : "dot-supported-developer"}
                    onClick={(e) => {
                      e.stopPropagation();
                      const root = (e.currentTarget as HTMLButtonElement).closest('[data-testid="carousel-supported-clients"]') as HTMLElement | null;
                      root?.dispatchEvent(new KeyboardEvent("keydown", { key: idx === 0 ? "ArrowLeft" : "ArrowRight" }));
                    }}
                  />
                ))}
              </div>
            </Carousel>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-white/80 border border-slate-200/60" data-testid="info-network-api">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-800">Network</span>
                </div>
                <Button variant="ghost" size="sm" className={`text-xs font-bold uppercase tracking-wide px-2 h-7 no-default-hover-elevate no-default-active-elevate ${calcDone ? "text-indigo-600 hover:bg-indigo-50" : "text-slate-400 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} title={!calcDone ? "Available after calculation completes" : undefined} data-testid="button-view-network">
                  View All
                </Button>
              </div>
              {selfQuery.isLoading ? (
                <div className="flex items-center gap-2">
                  <BrainLogo size={14} className="animate-pulse text-indigo-400" />
                  <span className="text-xs text-slate-400">Loading network...</span>
                </div>
              ) : network ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      { label: "Followers", value: network.followed_by?.length ?? 0 },
                      { label: "Following", value: network.following?.length ?? 0 },
                      { label: "Muted By", value: network.muted_by?.length ?? 0 },
                      { label: "Muting", value: network.muting?.length ?? 0 },
                      { label: "Reported By", value: network.reported_by?.length ?? 0 },
                      { label: "Reporting", value: network.reporting?.length ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{label}</span>
                        <span className="text-xs font-semibold text-slate-700">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No network data available.</p>
              )}
            </div>
            <div className="p-4 rounded-xl bg-white/80 border border-slate-200/60" data-testid="info-graperank-api">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-semibold text-slate-800">GrapeRank</span>
              </div>
              {grapeRankQuery.isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400">Loading...</span>
                </div>
              ) : grapeRank ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      { label: "Status", value: (grapeRank as any).status },
                      { label: "TA Status", value: (grapeRank as any).ta_status },
                      { label: "Publication", value: (grapeRank as any).internal_publication_status },
                      { label: "Queue Position", value: typeof (grapeRank as any).how_many_others_with_priority === "number" ? (grapeRank as any).how_many_others_with_priority : undefined },
                    ].filter(({ value }) => value !== undefined && value !== null).map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{label}</span>
                        <span className="text-xs font-semibold text-slate-700">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                  {(grapeRank as any).result && (
                    <div className="pt-1.5 border-t border-slate-100">
                      <p className="text-xs text-slate-500 mb-1">Result</p>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100 overflow-auto max-h-32 font-mono">
                        {typeof (grapeRank as any).result === "string" ? (grapeRank as any).result : JSON.stringify((grapeRank as any).result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No GrapeRank data available.</p>
              )}
            </div>
          </div>

          <div className="mb-8">
            <button
              className="w-full flex items-center justify-between gap-2 p-4 rounded-xl bg-white/80 border border-slate-200/60 text-left cursor-pointer hover:bg-white transition-colors"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              data-testid="button-toggle-advanced"
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Advanced: Raw API Data</span>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`} />
            </button>
            {advancedOpen && (
              <div className="mt-2 p-4 rounded-xl bg-white/80 border border-slate-200/60" data-testid="panel-advanced">
                <div className="flex flex-row flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Debug Inspector</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { selfQuery.refetch(); grapeRankQuery.refetch(); }}
                    disabled={selfQuery.isFetching || grapeRankQuery.isFetching}
                    data-testid="button-refresh-raw"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${selfQuery.isFetching || grapeRankQuery.isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">User Self Data</p>
                    <pre className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 overflow-auto max-h-48 font-mono" data-testid="raw-self-data">
                      {selfQuery.isLoading ? "Loading..." : JSON.stringify(selfData, null, 2) || "No data"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">GrapeRank Result</p>
                    <pre className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100 overflow-auto max-h-48 font-mono" data-testid="raw-graperank-data">
                      {grapeRankQuery.isLoading ? "Loading..." : JSON.stringify(grapeRankRaw, null, 2) || "No data"}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

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
