import { useEffect, useState, useRef, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/PageHeader";
import { TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { AdminBadge } from "@/components/AdminBadge";
import { PresetBadge } from "@/components/PresetBadge";
import amethystLogoImg from "../assets/amethyst-logo.png";
import nostriaHeroImg from "../assets/nostria-hero.png";
import nostriaManifestoImg from "../assets/nostria-manifesto-overlay.png";
import nostriaTeaserImg from "../assets/nostria-teaser.png";
import nostriaIconImg from "../assets/nostria-icon.png";
import brainstormHeroImg from "@assets/image_1773159756760.png";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { FollowToCalculateCard } from "@/components/FollowToCalculateCard";
import { NetworkAlertsModule } from "@/components/dashboard/NetworkAlertsModule";
import { DashboardLookup } from "@/components/dashboard/DashboardLookup";
import { YourNetworkCard } from "@/components/dashboard/YourNetworkCard";
import { SetupProgressCard } from "@/components/dashboard/SetupProgressCard";
import { TaggedYouModule } from "@/components/dashboard/TaggedYouModule";
import { useNetworkFaces } from "@/hooks/useNetworkFaces";
import { NetworkArticlesModule } from "@/components/dashboard/NetworkArticlesModule";
import { ClientShelf } from "@/components/dashboard/ClientShelf";
import { NetworkThreadModule } from "@/components/dashboard/NetworkThreadModule";
import { ShareProfileModal } from "@/components/ShareProfileModal";
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
  HelpCircle,
  Shield,
  Copy,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { FEATURES } from "@/config/featureFlags";
import { motion, AnimatePresence } from "framer-motion";
import { BrainLogo } from "@/components/BrainLogo";
import {
  ASSISTANT_UPDATED_EVENT,
  getCurrentAssistantPubkey,
  readAssistantDismissed,
  setAssistantDismissed as setAssistantDismissedStorage,
  setFirstPublishDone,
} from "@/lib/assistantStorage";
import { ensureAssistantPublished } from "@/lib/assistantPublish";
import { ToastAction } from "@/components/ui/toast";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
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
import { cacheProfile, fetchProfile, fetchOutboxRelayList } from "@/services/nostr";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { hasDeclinedNip85 } from "@/lib/nip85Consent";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { TIER_LABELS } from "@/services/trustThreshold";
import { useSelfOverview, useSelfHistory, useSelfStats } from "@/hooks/useSelf";
import { toPubkeys } from "../services/graphHelpers";
import { ActivateBrainstormModal } from "@/components/ActivateBrainstormModal";

import protocolDevImg from "@/assets/stock_images/protocol_dev.jpg";
import bitcoinImg from "@/assets/stock_images/bitcoin_network.jpg";
import digitalArtImg from "@/assets/stock_images/digital_art.jpg";
import musicSceneImg from "@/assets/stock_images/music_scene.jpg";
import { identityHas } from "@/accounts/display";
import { accountKey } from "@/lib/accountStorage";


const isStatusDone = (s: unknown): boolean => typeof s === "string" && s.toLowerCase() === "success";

const INTEREST_CLUSTERS = [
  { id: "dev", label: "Protocol Devs", icon: Code, count: 1240, color: "bg-blue-500", unit: "builders", image: protocolDevImg },
  { id: "btc", label: "Bitcoiners", icon: Bitcoin, count: 8500, color: "bg-orange-500", unit: "peers", image: bitcoinImg },
  { id: "art", label: "Digital Artists", icon: Palette, count: 3200, color: "bg-brand-deep", unit: "creators", image: digitalArtImg },
  { id: "music", label: "Music Scene", icon: Music, count: 1800, color: "bg-brand-accent", unit: "artists", image: musicSceneImg },
];


const NETWORK_METRICS = [
  { key: "followed_by", label: "Followers", icon: UserPlus, color: "text-emerald-500", bgColor: "bg-emerald-500" },
  { key: "following", label: "Following", icon: Users, color: "text-brand-primary", bgColor: "bg-brand-primary" },
  { key: "muted_by", label: "Muted By", icon: VolumeX, color: "text-amber-500", bgColor: "bg-amber-500" },
  { key: "muting", label: "Muting", icon: UserMinus, color: "text-slate-500", bgColor: "bg-slate-400" },
  { key: "reported_by", label: "Reported By", icon: ShieldAlert, color: "text-red-500", bgColor: "bg-red-500" },
  { key: "reporting", label: "Reporting", icon: ShieldAlert, color: "text-orange-500", bgColor: "bg-orange-500" },
] as const;


// "Maybe later" on the Select-Brainstorm card is remembered per-account so it
// doesn't re-nag on every reload, but re-surfaces once after a cooldown.
const NIP85_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
function nip85DismissedRecently(pubkey?: string): boolean {
  if (!pubkey) return false;
  try {
    const at = Number(localStorage.getItem(accountKey("brainstorm_nip85_dismissed_at", pubkey)) || 0);
    return at > 0 && Date.now() - at < NIP85_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Whether this account has already been shown the invite card. */
function readInviteCardSeen(pubkey?: string): boolean {
  try {
    return !!pubkey && localStorage.getItem(accountKey("brainstorm_invite_card_seen", pubkey)) === "true";
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [hopRange, setHopRange] = useState([1, 3]);
  const [extendedNetworkCount, setExtendedNetworkCount] = useState(250000);
  const [networkViewMode, setNetworkViewMode] = useState<"trust" | "activity">("trust");
  const [nip85ModalOpen, setNip85ModalOpen] = useState(false);
  const [wotExpanded, setWotExpanded] = useState(false);
  const [nip85Activated, setNip85Activated] = useState(() => isNip85Activated(user?.pubkey));
  const [nip85Dismissed, setNip85Dismissed] = useState(() => nip85DismissedRecently(user?.pubkey));
  // In-app-created accounts consent at the calculate step (or implicitly, for
  // accounts that predate the consent card) and publish from there — the CTA
  // card would only nag them. The exception is an explicit decline on that
  // card: then this CTA is the one re-surface path, after the dismiss cooldown.
  const nip85CreatedInApp = (() => {
    return identityHas(user?.pubkey, "createdInApp");
  })();
  const [assistantDismissed, setAssistantDismissed] = useState<boolean>(() => readAssistantDismissed());
  const [assistantPubkey, setAssistantPubkey] = useState<string | null>(() => getCurrentAssistantPubkey());
  // "Your network is live — invite friends" card: shown once, the first time the
  // user's scores go ready (publishDone). Persisted per-account so it never nags.
  const [inviteShareOpen, setInviteShareOpen] = useState(false);
  const [inviteCardSeen, setInviteCardSeen] = useState<boolean>(() => readInviteCardSeen(user?.pubkey));

  // Lazy initialisers run once, and switching accounts in-app does not remount
  // this page — so without re-reading them, B renders with A's per-account flags:
  // B's consent card suppressed by A's dismissal, B's invite card already "seen".
  useEffect(() => {
    setNip85Activated(isNip85Activated(user?.pubkey));
    setNip85Dismissed(nip85DismissedRecently(user?.pubkey));
    setInviteCardSeen(readInviteCardSeen(user?.pubkey));
  }, [user?.pubkey]);
  const markInviteCardSeen = () => {
    try { const pk = user?.pubkey; if (pk) localStorage.setItem(accountKey("brainstorm_invite_card_seen", pk), "true"); } catch { /* ignore */ }
    setInviteCardSeen(true);
  };
  useEffect(() => {
    const sync = () => {
      setAssistantPubkey(getCurrentAssistantPubkey());
      setAssistantDismissed(readAssistantDismissed());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("brainstorm_assistant:")) sync();
    };
    // The assistant's storage is namespaced per owner, so a switch re-reads it.
    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, sync as EventListener);
    };
  }, [user?.pubkey]);

  // Inline "Publish your assistant" prompt (existing users): publish in place
  // rather than navigating to the wrong settings page. Explicit click = consent,
  // so we DO follow the bot. Reuses the shared publish helper.
  const publishAssistantMutation = useMutation({
    mutationFn: () => ensureAssistantPublished({ follow: true, skipIfPublished: false }),
    onSuccess: ({ name }) => {
      setFirstPublishDone();
      setAssistantPubkey(getCurrentAssistantPubkey()); // collapse the prompt immediately
      toast({
        title: `${name} is live on Nostr!`,
        description: "Speaking your scores to compatible Nostr apps.",
        action: (
          <ToastAction altText="Customize your assistant" onClick={() => navigate("/settings?tab=trust")}>
            Customize
          </ToastAction>
        ),
        duration: 6000,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't publish your assistant",
        description: err?.message || "Please try again in a moment.",
      });
    },
  });

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const { preset: trustPreset } = useTrustPresetSync(!!user);

  const needsProfile = !!user && !user.displayName && !user.picture;
  useQuery({
    queryKey: ["profile", user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return null;
      await fetchOutboxRelayList(user.pubkey);
      const content = await fetchProfile(user.pubkey);
      if (content) {
        // Caching it on the Account is what re-renders the header — this query's
        // own result is only the profile page's fallback copy.
        cacheProfile(content, user.pubkey);
        return content;
      }
      throw new Error("Profile not found");
    },
    enabled: needsProfile,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: Infinity,
  });

  const recalcTriggeredAtRef = useRef<number | null>(null);

  // SELF overview's `flagged_by_observer` is always false (self ≠ flags self),
  // so threshold doesn't affect any consumed field — omit to keep the queryKey
  // stable across `trustPreset` lifecycle transitions.
  const overviewQuery = useSelfOverview(user?.pubkey);
  const historyQuery = useSelfHistory(user?.pubkey);
  // Preset-driven server-side; a preset change invalidates this query.
  const statsQuery = useSelfStats(user?.pubkey);

  const grapeRankQuery = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    retry: false,
    refetchInterval: (query) => {
      const d = query.state.data?.data;
      if (!d || typeof d !== "object") return 60_000;
      const done = isStatusDone((d as any).ta_status);
      if (done && recalcTriggeredAtRef.current) {
        const elapsed = Date.now() - recalcTriggeredAtRef.current;
        if (elapsed < 25 * 60 * 1000) return 60_000;
        recalcTriggeredAtRef.current = null;
      }
      return done ? false : 60_000;
    },
  });

  const prevStatusDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    const d = grapeRankQuery.data?.data as any;
    if (!d || typeof d !== "object") return;
    const done = isStatusDone(d.ta_status) || isStatusDone(d.internal_publication_status);
    if (prevStatusDoneRef.current === false && done) {
      queryClient.invalidateQueries({ queryKey: ["/user/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/user/history"] });
      queryClient.invalidateQueries({ queryKey: ["/user/stats"] });
    }
    prevStatusDoneRef.current = done;
  }, [grapeRankQuery.data]);

  const wasAutoTriggeredRef = useRef(false);

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: (data) => {
      recalcTriggeredAtRef.current = Date.now();
      if (data?.data && typeof data.data === "object") {
        queryClient.setQueryData(["/user/graperankResult"], data);
      }
      queryClient.invalidateQueries({ queryKey: ["/user/graperankResult"] });
      wasAutoTriggeredRef.current = false;
      // First-time calc vs a true recalculation reads very differently — don't
      // tell a never-scored user we're "refreshing" / "recalculating".
      let hadPrev = false;
      try { hadPrev = localStorage.getItem("brainstorm_calc_completed") === "true"; } catch {}
      toast({
        title: hadPrev ? "Refreshing your scores" : "Calculating your network",
        description: hadPrev
          ? "Your scores are being recalculated — results will update shortly."
          : "We're scoring your network for the first time. You can keep exploring while it runs.",
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

  const overview = overviewQuery.data?.data ?? null;
  const history = historyQuery.data?.data ?? null;
  const stats = statsQuery.data?.data ?? null;

  const taPubkey = history?.ta_pubkey;
  const trustServiceProvider = useTrustProviderStatus(user?.pubkey, taPubkey);

  useEffect(() => {
    // The on-relay 10040 is the authority. "brainstorm" marks this account
    // activated and shows the badge; "other" (a declaration naming a DIFFERENT
    // assistant — definitive presence, not a miss) downgrades it, because a
    // green "Active" badge over a foreign declaration is a lie. "none"/
    // "unknown" are absence/silence and never downgrade — relays are
    // eventually-consistent, and that flicker right after an auto-publish is
    // what upgrade-only-on-miss protects against.
    if (trustServiceProvider.data === "brainstorm") {
      markNip85Activated(user?.pubkey);
      if (!nip85Activated) setNip85Activated(true);
    } else if (trustServiceProvider.data === "other") {
      // The flag itself was cleared inside checkExistingTrustProvider.
      if (nip85Activated) setNip85Activated(false);
    }
  }, [trustServiceProvider.data, nip85Activated]);

  const grapeRankRaw = grapeRankQuery.data?.data;
  const grapeRank = grapeRankRaw && typeof grapeRankRaw === "object" ? grapeRankRaw : null;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";

  const followersCount = overview?.counts?.followed_by ?? 0;
  const followingCount = overview?.counts?.following ?? 0;
  const mutedByCount = overview?.counts?.muted_by ?? 0;
  const mutingCount = overview?.counts?.muting ?? 0;
  const reportedByCount = overview?.counts?.reported_by ?? 0;
  const reportingCount = overview?.counts?.reporting ?? 0;
  const influence = overview?.influence ?? 0;

  const verifiedFollowersCount = stats?.followed_by?.verified ?? 0;
  const verifiedFollowingCount = stats?.following?.verified ?? 0;

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

  // The backend count alone lied here: it reads 0 until GrapeRank first ingests
  // the contact list, so an existing user on a fresh device was handed the
  // new-user follow picker. Only believe "no follows" once the relay-side
  // verification agrees (it also repairs the local floor when a list is found,
  // which lets AutoScoreReturning take over).
  const followVerification = useVerifiedNoFollows(user?.pubkey);
  const hasNoFollowing = overviewQuery.isSuccess && followingCount === 0 && followVerification === "none";
  const followsChecking = overviewQuery.isSuccess && followingCount === 0 && followVerification === "checking";

  // The backend `following` count lags for brand-new accounts — it only fills in
  // after the first GrapeRank pass ingests the contact list. So a user who has
  // already followed + triggered scoring still reads followingCount === 0 for a
  // while. This flag (set the moment scoring is triggered, which requires having
  // followed) lets us stop re-nagging them to "follow to begin" and instead show
  // a calm "calculating" state until the count catches up.
  const calcTriggered = (() => {
    try { return !!user?.pubkey && !!localStorage.getItem(accountKey("brainstorm_calc_triggered_at", user.pubkey)); }
    catch { return false; }
  })();

  // The no-follows user just used the inline follow-picker → bridge to the
  // "calculating" state and suppress any stale "failed" status until the fresh
  // GrapeRank result replaces it.
  const [justFollowed, setJustFollowed] = useState(false);
  const handleFollowDone = () => {
    setJustFollowed(true);
    queryClient.invalidateQueries({ queryKey: ["/user/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/user/history"] });
    queryClient.invalidateQueries({ queryKey: ["/user/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/user/graperankResult"] });
  };

  const prevCalcDoneRef = useRef(false);
  useEffect(() => {
    if (calcDone && !prevCalcDoneRef.current) {
      queryClient.invalidateQueries({ queryKey: ["/user/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/user/history"] });
      queryClient.invalidateQueries({ queryKey: ["/user/stats"] });
    }
    prevCalcDoneRef.current = calcDone;
  }, [calcDone]);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isGrapeRankFailed && !isPublishFailed) {
      setRetryCount(0);
    }
  }, [isGrapeRankFailed, isPublishFailed]);

  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (
      grapeRankQuery.isSuccess &&
      grapeRank === null &&
      !isGrapeRankFailed &&
      !triggerGrapeRankMutation.isPending &&
      !autoTriggeredRef.current &&
      overviewQuery.isSuccess &&
      !hasNoFollowing &&
      followingCount > 0
    ) {
      autoTriggeredRef.current = true;
      wasAutoTriggeredRef.current = true;
      triggerGrapeRankMutation.mutate();
    }
  }, [
    grapeRankQuery.isSuccess,
    grapeRank,
    isGrapeRankFailed,
    triggerGrapeRankMutation.isPending,
    overviewQuery.isSuccess,
    hasNoFollowing,
    followingCount,
  ]);

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
    { key: "high", name: TIER_LABELS.high, color: TRUST_TIER_COLORS.highlyTrusted },
    { key: "medium_high", name: TIER_LABELS.trusted, color: TRUST_TIER_COLORS.trusted },
    { key: "medium", name: TIER_LABELS.neutral, color: TRUST_TIER_COLORS.neutral },
    { key: "medium_low", name: TIER_LABELS.low, color: TRUST_TIER_COLORS.lowTrust },
    { key: "low", name: TIER_LABELS.unverified, color: TRUST_TIER_COLORS.unverified },
    { key: "low_and_reported_by_2_or_more_trusted_pubkeys", name: "Flagged", color: TRUST_TIER_COLORS.flagged },
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

  // Direct flagged count (DISTINCT flagged users across all of your
  // relationships), from /overview — preserves the legacy /self graph's flagged
  // semantics and matches NetworkPage. Only consumed by the pre-calc
  // `enhancedPieData` fallback slice (the post-calc pie reads count_values via
  // aggregateByHopRange).
  const flaggedCount = overview?.flagged_count ?? 0;

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
        const value = aggregateByHopRange(tier.key, hopRange[0], hopRange[1]);
        return { name: tier.name, value, color: tier.color };
      }).filter(d => d.value > 0 || d.name === "Flagged");
    }
    const fallback = [
      { label: TIER_LABELS.high, count: followersCount, color: TRUST_TIER_COLORS.highlyTrusted },
      { label: TIER_LABELS.trusted, count: followingCount, color: TRUST_TIER_COLORS.trusted },
      { label: TIER_LABELS.neutral, count: Math.max(100, followersCount * 2), color: TRUST_TIER_COLORS.neutral },
      { label: TIER_LABELS.low, count: mutedByCount + mutingCount, color: TRUST_TIER_COLORS.lowTrust },
      { label: "Unverified", count: Math.max(10, mutedByCount), color: TRUST_TIER_COLORS.unverified },
      { label: "Flagged", count: flaggedCount, color: TRUST_TIER_COLORS.flagged },
    ];
    const currentHops = hopRange[1];
    return fallback.map((d) => {
      let multiplier = 1;
      if (d.label === TIER_LABELS.high) multiplier = Math.max(0.2, 1 - (currentHops - 1) * 0.15);
      else if (d.label === TIER_LABELS.trusted) multiplier = Math.max(0.4, 1 - (currentHops - 1) * 0.08);
      else if (d.label === TIER_LABELS.neutral) multiplier = 1 + (currentHops - 1) * 0.4;
      else if (d.label === TIER_LABELS.low) multiplier = 1 + (currentHops - 1) * 0.6;
      else if (d.label === "Flagged") multiplier = 1;
      else multiplier = 1 + (currentHops - 1) * 0.8;
      return { name: d.label, value: Math.floor(d.count * multiplier), color: d.color };
    }).filter(d => d.value > 0 || d.name === "Flagged");
  }, [countValues, hopRange, followersCount, followingCount, mutedByCount, mutingCount, flaggedCount]);

  const totalNetworkProfiles = enhancedPieData.reduce((acc: number, curr: { value: number }) => acc + curr.value, 0);

  const activityBreakdown = [
    { name: "Very active (7 days)", value: Math.floor(extendedNetworkCount * 0.18), color: "#059669" },
    { name: "Active (90 days)", value: Math.floor(extendedNetworkCount * 0.32), color: "#0ea5e9" },
    { name: "Quiet (90+ days)", value: Math.floor(extendedNetworkCount * 0.3), color: "#7237ff" },
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

  // Stats `tier_counts` field names now match the GR `count_values` keys
  // used by TIER_CONFIG — pass straight through.
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

  // Per-pubkey — a global flag would leak one account's "has scores" state onto
  // the next account on the same browser (making a brand-new user look like a
  // recalculation). Keep the legacy global key in sync for back-compat readers.
  const hadPreviousScores = useMemo(() => {
    const k = user?.pubkey ? accountKey("brainstorm_calc_completed", user.pubkey) : "";
    if (calcDone) {
      try { if (k) localStorage.setItem(k, "true"); localStorage.setItem("brainstorm_calc_completed", "true"); } catch {}
      return true;
    }
    try { return !!k && localStorage.getItem(k) === "true"; } catch { return false; }
  }, [calcDone, user?.pubkey]);

  // Recently-active faces for the Your Network tiles (follows + followers).
  // MUST stay above the early return below — a hook called after a conditional
  // return changes hook order between renders and crashes the whole page.
  const recalculating = !calcDone && hadPreviousScores && !grapeRankQuery.isLoading;
  const facesQuery = useNetworkFaces(user?.pubkey ?? "", calcDone || recalculating);

  // Also above the early return, for the same reason. Holds whether this is the
  // user's first-ever visit; the value is captured further down, once
  // overviewQuery has actually answered.
  const firstSessionRef = useRef<boolean | null>(null);

  if (!user || isAuthRedirecting()) return null;

  const isRecalculating = recalculating;
  const isCalculationComplete = calcDone || isRecalculating;

  // "Welcome back" is a lie to someone who signed up 30 seconds ago, and the
  // displayName fallback invented "Traveler" for exactly the people least likely
  // to have set a name — new users. hadPreviousScores is a persisted per-account
  // flag, so it identifies a genuine first visit with no new storage.
  //
  // FROZEN for the session: hadPreviousScores flips true the instant the first
  // calculation lands, which would otherwise swap the heading out from under a
  // user mid-visit. Captured on the first render where we actually know. The ref
  // itself is declared ABOVE the early return — declaring it here made it a hook
  // called after a conditional return, which changed hook order between renders
  // and blanked the whole page.
  if (firstSessionRef.current === null && overviewQuery.isSuccess) {
    firstSessionRef.current = !hadPreviousScores;
  }
  const isFirstSession = firstSessionRef.current === true;
  // `overviewQuery.isSuccess` is load-bearing, not belt-and-braces: hasNoFollowing
  // is `overviewQuery.isSuccess && followingCount === 0`, so while overview is
  // still in flight it reads FALSE — indistinguishable from "this user has
  // follows". For a brand-new account grapeRank resolves first, every other term
  // passes, and the onboarding panel flashed on screen for that window before
  // overview landed and yanked it away. Waiting for overview to settle closes it.
  // `followsChecking` closes the same flash for the relay verification window:
  // while it's running, hasNoFollowing reads FALSE too, and without the guard
  // the onboarding panel would show for a user about to get the follow picker.
  const showOnboarding = overviewQuery.isSuccess && !grapeRankQuery.isLoading && !publishDone && !hasNoFollowing && !followsChecking && !isRecalculating && !hadPreviousScores;
  // No-follows is NOT an error — it's the "start here" state (handled by the
  // inline follow-picker). Only real GrapeRank/publish failures are errors, and
  // we suppress those right after a fresh follow+calculate.
  const isErrorState = (isGrapeRankFailed || isPublishFailed) && !hasNoFollowing && !followsChecking && !justFollowed;
  // A "recalculation" requires PRIOR completed scores — not merely an in-progress
  // result object (which exists during a first-time calc too). Using `grapeRank`
  // here made a never-scored user's first calc read as "Refreshing / previous
  // scores will be replaced".
  // A recalculation requires PRIOR completed scores for THIS account. `grapeRankScore`
  // can be present on a failed/in-progress result, and `nip85Activated` is a global
  // flag — both caused brand-new accounts to read as "Recalculating".
  const isRecalculation = !publishDone && hadPreviousScores;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-brand-primary/[0.3] flex flex-col relative overflow-hidden" data-testid="page-dashboard">
        <PageBackground />

        <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} active="dashboard" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">

          <DeferredSessionNotice className="mb-6" />

          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <PageHeader
                kicker="Brainstorm Dashboard"
                title={isFirstSession
                  ? <>Welcome to <span className="text-brand-link">Brainstorm</span></>
                  : user.displayName
                    ? <>Welcome back, <span className="text-brand-link">{user.displayName}</span></>
                    : <>Welcome back</>}
                subtitle={isFirstSession
                  ? "Setting up your trust network."
                  : hasNoFollowing ? "Set up your trust network" : "Your trust network is active and growing."}
                testId="section-dashboard-header-copy"
              />

              {/* Hidden for a brand-new account with no scores yet. Both of its
                  actions are useless-or-worse at that moment: "Recalculate" while the
                  first calculation is already running either no-ops or re-queues them
                  behind other users, and "View insights" opens a page with nothing in
                  it. All it adds is a fourth "Awaiting calculation" — and on mobile it
                  stacks directly above the CalculatingNotice, so the duplication is
                  unmissable. It returns the moment scores land. */}
              {isFirstSession && !calcDone ? null : nip85Activated && publishDone ? (
              <Card
                className="relative self-start md:self-end w-full max-w-sm overflow-hidden"
                data-testid="badge-nip85-active"
              >
                <button
                  type="button"
                  onClick={() => setWotExpanded((v) => !v)}
                  aria-expanded={wotExpanded}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors"
                  data-testid="button-wot-expand"
                >
                  <div className="h-7 w-7 rounded-lg bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center shrink-0">
                    <BrainLogo size={14} className="text-brand-deep" />
                  </div>
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 shrink-0" style={{ fontFamily: "var(--font-display)" }}>Your network</span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 shrink-0">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Active</span>
                  </span>
                  <span className="flex-1" />
                  <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${wotExpanded ? "rotate-180" : ""}`} />
                </button>
                {wotExpanded && (
                <div className="px-3.5 pb-3.5 border-t border-slate-100 dark:border-slate-800/60">

                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400 dark:text-slate-500">
                    {history?.last_time_calculated_graperank && (
                      <span>Updated {formatTimestamp(new Date(history.last_time_calculated_graperank.endsWith("Z") ? history.last_time_calculated_graperank : history.last_time_calculated_graperank + "Z"))}</span>
                    )}
                    <span title="Published as a NIP-85 declaration so compatible apps can read your scores" className="inline-flex items-center">
                      <Info className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                    </span>
                    {grapeRank?.graperank_preset_used && (
                      <span className="inline-flex items-center gap-1">
                        <span>Trust</span>
                        <PresetBadge preset={grapeRank.graperank_preset_used} size="xs" testId="badge-dashboard-preset-used" />
                      </span>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {!assistantDismissed && !assistantPubkey && !nip85CreatedInApp && (
                      <motion.div
                        key="assistant-inline-prompt"
                        initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 6, marginBottom: 6 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                        data-testid="container-assistant-inline-prompt"
                      >
                        <div className="rounded-lg bg-gradient-to-br from-brand-accent/8 via-white to-brand-primary/10 dark:bg-none dark:bg-slate-800/50 border border-brand-accent/20 px-2.5 py-2 flex items-center gap-2.5">
                          <img
                            src="/assistant-default.webp"
                            alt=""
                            aria-hidden="true"
                            className="w-7 h-7 rounded-full ring-1 ring-brand-accent/30 shrink-0 object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/assistant-default.jpg"; }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate" style={{ fontFamily: "var(--font-display)" }}>
                              Publish your assistant
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate">
                              Speak your scores to compatible apps
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => publishAssistantMutation.mutate()}
                            disabled={publishAssistantMutation.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-br from-brand-primary to-brand-deep text-white text-[10px] font-semibold tracking-wide shadow-sm hover:shadow-md hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent/40 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
                            data-testid="button-assistant-inline-publish"
                          >
                            {publishAssistantMutation.isPending ? (
                              <>
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                Publishing
                              </>
                            ) : (
                              "Publish"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAssistantDismissedStorage(true);
                              setAssistantDismissed(true);
                            }}
                            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent/40 shrink-0"
                            aria-label="Dismiss publish assistant prompt"
                            data-testid="button-assistant-inline-dismiss"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Readable in compatible apps</span>
                          <div className="relative group/info">
                            <button
                              type="button"
                              className="h-3.5 w-3.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
                              onClick={(e) => e.currentTarget.focus()}
                              aria-label="What are Compatible Clients?"
                              data-testid="button-compatible-clients-info"
                            >
                              <Info className="h-2 w-2" />
                            </button>
                            <div className="fixed left-4 right-4 top-1/2 -translate-y-1/2 sm:absolute sm:top-auto sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:translate-y-0 sm:bottom-full sm:mb-2 sm:w-80 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs text-slate-200 leading-relaxed opacity-0 invisible group-focus-within/info:opacity-100 group-focus-within/info:visible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 z-[100] pointer-events-none group-focus-within/info:pointer-events-auto group-hover/info:pointer-events-auto" data-testid="tooltip-compatible-clients">
                              Apps that read the personalized Verification Scores Brainstorm publishes for you — so your network travels with you across the apps you use.
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:border-brand-accent hover:shadow-md transition-all group/client" data-testid="link-compatible-amethyst">
                            <img src={amethystLogoImg} alt="Amethyst" className="w-5 h-5 rounded-md" />
                            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 group-hover/client:text-brand-deep transition-colors">Amethyst</span>
                          </a>
                          <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:border-orange-300 hover:shadow-md transition-all group/client" data-testid="link-compatible-nostria">
                            <img src={nostriaIconImg} alt="Nostria" className="w-5 h-5 rounded-md bg-white object-contain" />
                            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 group-hover/client:text-orange-700 transition-colors">Nostria</span>
                          </a>
                        </div>
                        <button
                          onClick={() => setRecalcConfirmOpen(true)}
                          disabled={triggerGrapeRankMutation.isPending || hasNoFollowing}
                          className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-deep/[0.06] text-brand-deep hover:bg-brand-deep/[0.12] border border-brand-accent/15 hover:border-brand-accent/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          data-testid="button-recalculate-wot-card"
                        >
                          {triggerGrapeRankMutation.isPending ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /><span className="text-[11px] font-semibold tracking-wide">Calculating</span></>
                          ) : (
                            <><RefreshCw className="w-3 h-3" /><span className="text-[11px] font-semibold tracking-wide">Recalculate</span></>
                          )}
                        </button>
                  </div>
                </div>
                )}
              </Card>
              ) : (
              <Card
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 self-start md:self-end transition-all duration-200"
                data-testid="card-overall-trust-score"
              >
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs font-semibold tracking-[0.15em] uppercase text-slate-400 dark:text-slate-500">Trust signals</span>
                  {triggerGrapeRankMutation.isPending ? (
                    <span className="text-xs text-brand-primary dark:text-brand-link font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Recalculating...
                    </span>
                  ) : grapeRankScore ? (
                    <span className="text-xs text-slate-700 dark:text-slate-200 font-semibold" data-testid="text-overall-trust-score-sub">
                      Score: {grapeRankScore}
                    </span>
                  ) : publishDone ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold" data-testid="text-overall-trust-score-sub">
                      Complete
                    </span>
                  ) : justFollowed ? (
                    <span className="text-xs text-brand-primary font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Calculating…
                    </span>
                  ) : isErrorState ? (
                    <span className="text-xs text-red-500 font-medium" data-testid="text-overall-trust-score-sub">
                      {isGrapeRankFailed ? "Calculation failed" : isPublishFailed ? "Publishing failed" : "Action needed"}
                    </span>
                  ) : isRecalculation ? (
                    <span className="text-xs text-brand-primary font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {calcDone ? "Publishing…" : "Calculating…"}
                    </span>
                  ) : triggerGrapeRankMutation.isPending ? (
                    <span className="text-xs text-brand-primary font-medium flex items-center gap-1" data-testid="text-overall-trust-score-sub">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Calculating…
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium" data-testid="text-overall-trust-score-sub">
                      Awaiting calculation
                    </span>
                  )}
                  {publishDone && (grapeRankUpdatedAt || grapeRankCreatedAt) && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5" data-testid="text-trust-signals-updated">
                      Last updated — {formatTimestamp(grapeRankUpdatedAt || grapeRankCreatedAt)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/insights")}
                    className="mt-1 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
                    data-testid="link-view-insights"
                  >
                    View insights →
                  </button>
                </div>
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 shrink-0" />
                <button
                  onClick={() => setRecalcConfirmOpen(true)}
                  disabled={triggerGrapeRankMutation.isPending || hasNoFollowing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-deep/10 text-brand-deep hover:bg-brand-deep/20 transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0 ring-1 ring-brand-accent/20"
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
              </Card>
              )}

            </div>

            <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
              <AlertDialogContent
                className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-0 overflow-hidden"
                data-testid="dialog-confirm-recalculate-dashboard"
              >
                <div className="p-5 sm:p-6">
                  <AlertDialogHeader className="space-y-0 text-left">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">Trust Signals</span>
                      <div className="h-px w-10 bg-brand-link/30" />
                    </div>
                    <AlertDialogTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-recalculate-dashboard-title">
                      Recalculate GrapeRank?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2.5" data-testid="text-confirm-recalculate-dashboard-desc">
                      This re-runs your full network trust calculation. It typically takes about 5 minutes and your current scores will be replaced with updated results.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                    <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-recalculate-dashboard-cancel">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white shadow-lg shadow-brand-primary/25"
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
              {(isGrapeRankFailed || isPublishFailed) && !hasNoFollowing && !followsChecking && !justFollowed && !triggerGrapeRankMutation.isError && !triggerGrapeRankMutation.isPending && !triggerGrapeRankMutation.isSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-red-200/60 dark:border-red-500/25 shadow-[0_8px_30px_-12px_rgba(239,68,68,0.15)] w-fit md:ml-auto"
                  data-testid="graperank-failed"
                >
                  <div className="h-8 w-8 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/25 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">Calculation incomplete</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">Please wait a few minutes, then try again.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Genuinely new, zero-follows, not-yet-started users → inline
                follow-picker (same suggestions as /welcome) so they can start
                their Web of Trust without leaving. */}
            {hasNoFollowing && !calcTriggered && !justFollowed && !triggerGrapeRankMutation.isPending && (
              <FollowToCalculateCard onDone={handleFollowDone} />
            )}

            {/* Already followed + triggered scoring, but the backend
                following-count hasn't caught up yet. Don't re-nag them to
                follow — reassure that their scores are calculating. */}
            {hasNoFollowing && calcTriggered && !justFollowed && !triggerGrapeRankMutation.isPending && (
              <div
                className="flex items-center gap-4 rounded-2xl border border-brand-accent/20 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl p-5 shadow-sm dark:shadow-none"
                data-testid="card-building-wot"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary dark:text-brand-link">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Building your network</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400">You're all set — your scores are calculating. This can take a few minutes.</div>
                </div>
              </div>
            )}

            {/* Scores just went live → the viral beat: invite people in. Shown
                once per account (persisted), never on recalcs. */}
            {user && publishDone && !inviteCardSeen && !isRecalculating && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                // No mb-6: the parent column already applies gap-6, so adding a
                // margin double-spaced this one child and made it read as detached
                // from the rest of the page.
              >
                {/* Stacks on mobile. It used to be a single row with `truncate` on the
                    text AND the description hidden below sm:, so on a phone even the
                    short title clipped to "Your network i…" — the message was the
                    point and it was unreadable. Text now wraps and the full sentence
                    shows at every width; the dismiss X is pinned to the corner so it
                    never competes with the button for horizontal room. */}
                <Card className="relative flex flex-col gap-3 rounded-xl p-3 pr-10 sm:flex-row sm:items-center sm:py-2.5 sm:pl-3.5 sm:pr-12" data-testid="card-invite-grow">
                  <div className="flex items-start gap-3 sm:items-center">
                    <div className="h-8 w-8 rounded-lg bg-brand-primary/[0.07] border border-brand-accent/20 flex items-center justify-center text-brand-link shrink-0">
                      <Users className="h-4 w-4" />
                    </div>
                    <p className="min-w-0 text-[13px] text-slate-600 dark:text-slate-300 leading-snug">
                      <span className="font-semibold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }} data-testid="text-invite-grow-title">Your network is live.</span>{" "}
                      <span className="text-slate-500 dark:text-slate-400">Invite people — they join connected to you, and everyone's network gets stronger.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setInviteShareOpen(true); markInviteCardSeen(); }}
                    className="h-9 w-full shrink-0 px-4 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-[13px] tracking-wide shadow-sm transition-all flex items-center justify-center gap-1.5 sm:ml-auto sm:w-auto"
                    data-testid="button-invite-grow"
                  >
                    <Users className="h-4 w-4" />
                    Invite friends
                  </button>
                  <button
                    type="button"
                    onClick={markInviteCardSeen}
                    className="absolute right-2 top-2 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors sm:top-1/2 sm:h-9 sm:w-9 sm:-translate-y-1/2"
                    aria-label="Dismiss"
                    data-testid="button-invite-grow-dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Card>
              </motion.div>
            )}
            {/* Rendered outside the card gate so it stays mounted after the card
                collapses (clicking Invite marks the card seen). */}
            {user && (
              <ShareProfileModal
                open={inviteShareOpen}
                onOpenChange={setInviteShareOpen}
                invite
                npub={user.npub}
                displayName={user.displayName || "You"}
                picture={user.picture}
                nip05={user.nip05}
                canonicalUrl={typeof window !== "undefined" ? `${window.location.origin}/p/${user.npub}` : ""}
                // No trust pill on an invite: the score is self-referential (your own POV
                // ≈ 100) and meaningless for a brand-new account — the invite is about
                // "join & start connected to you", not a score flex.
                score01={null}
              />
            )}

            {/* First run: what's still to set up, plus one line of calc status.
                Replaces a ~375-line dark marketing hero (a rotating
                ONBOARDING_SLIDES carousel over a CALCULATING/PUBLISHING stepper)
                that filled the fold while saying nothing actionable — a new user's
                first few minutes are spent waiting, so spend them on the setup
                they still owe. Recalculating users were already excluded here;
                their status lives in the top-right Trust signals card and the
                app-wide pill. Failures are carried by the alert above, so the
                status line stands down rather than promising a time estimate. */}
            {showOnboarding && (
              <SetupProgressCard queueAhead={queuePosition} showStatus={!isErrorState} />
            )}

            {/* Someone put a public label on you. Nothing else in the app would
                ever tell you — self-hides when there's nothing new. */}
            <TaggedYouModule />
          </div>

          {publishDone && !isRecalculating && !nip85Activated && !nip85Dismissed && (!nip85CreatedInApp || hasDeclinedNip85(user?.pubkey)) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="mb-6"
            >
              <Card
                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden rounded-xl relative"
                data-testid="card-nip85-cta"
              >

                <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-brand-primary shadow-sm shadow-brand-primary/25 flex items-center justify-center shrink-0">
                    <BrainLogo mono size={24} className="text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-nip85-cta-title">
                      Use your Brainstorm scores in other apps
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed" data-testid="text-nip85-cta-subtitle">
                      Sign a nostr note that tells other apps where to find your personalized scores.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setNip85ModalOpen(true)}
                      className="flex-1 sm:flex-none h-10 px-5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 flex items-center justify-center gap-2"
                      data-testid="button-nip85-cta"
                    >
                      <BrainLogo mono size={14} className="text-white" />
                      Select Brainstorm
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const pk = user?.pubkey;
                          if (pk) localStorage.setItem(accountKey("brainstorm_nip85_dismissed_at", pk), String(Date.now()));
                        } catch { /* ignore */ }
                        setNip85Dismissed(true);
                      }}
                      className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors whitespace-nowrap"
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
            serviceKey={history?.ta_pubkey || ""}
            onActivated={() => {
              setNip85Activated(true);
              setNip85ModalOpen(false);
              toast({ title: "Brainstorm activated!", description: "Your scores are now available across the nostr ecosystem." });
            }}
          />

          {/* Investigate command bar — research entry point into the deep-dive
              analytics (/profile/:npub) for anyone in your network. */}
          <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 px-3 py-2.5 shadow-sm" data-testid="dashboard-lookup-bar">
            <DashboardLookup />
          </div>

          {/* Stacked, never side-by-side: Network Alerts sits full-width on top,
              "Your Network" full-width below. Minimizing/expanding Alerts is a pure
              vertical accordion — it drops its body down in place and never shoves
              "Your Network" to the side. "Your Network" folds in what used to be
              three separate tiles (Social Graph, Extended Reach and the full
              Network Health pie; the pie's tier drill-downs now live on /network)
              and always renders in its wide four-cell row. */}
          {/* Nothing here can hold real data before the first calculation, so before
              then we render NOTHING rather than shells. Previously a brand-new user
              got Network Alerts' "your safety radar is warming up" AND a full-height
              greyed-out Your Network with a "Scores calculating…" overlay — so the
              page said "wait" four or five times over and looked broken. The single
              CalculatingNotice above is the one statement; these appear when they
              have something to show. */}
          <div className={`flex flex-col gap-4 ${isCalculationComplete ? "mb-6" : ""}`}>

            {isCalculationComplete && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="w-full flex">
              <NetworkAlertsModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />
            </motion.div>
            )}

            {isCalculationComplete && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-full flex">
              <YourNetworkCard
                isReady={isCalculationComplete}
                loading={overviewQuery.isLoading || statsQuery.isLoading}
                followers={verifiedFollowersCount}
                following={verifiedFollowingCount}
                extendedCount={extendedNetworkCount}
                hopRange={hopRange}
                maxHop={maxHopInData}
                onHopChange={setHopRange}
                health={currentPieData}
                onNavigate={navigate}
                wide
                followersFaces={facesQuery.data?.followers ?? []}
                followingFaces={facesQuery.data?.following ?? []}
              />
            </motion.div>
            )}
          </div>

          {/* Discovery, not a following feed: long-form from accounts two-plus
              hops out that the graph vouches for. Renders nothing until there's
              something worth showing. */}
          <NetworkArticlesModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />

          {/* The circle you already chose (1 hop), under the discovery module.
              Read-only: notes open the full conversation at /e/:id rather than
              faking a composer the product doesn't have yet. */}
          <NetworkThreadModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />


          {/* Expands to fill the gap while the modules above are still gated off,
              and tightens to one row once scores land. See ClientShelf. */}
          <ClientShelf expanded={!isCalculationComplete} onNavigate={navigate} />



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
              className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-brand-primary dark:text-brand-link" />
                Keyboard Shortcuts
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Export data</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-sm font-mono text-slate-600 dark:text-slate-300">E</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Go home</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-sm font-mono text-slate-600 dark:text-slate-300">H</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Toggle shortcuts</span>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-sm font-mono text-slate-600 dark:text-slate-300">?</kbd>
                </div>
              </div>
              <Button
                className="w-full mt-6 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white"
                onClick={() => setShowShortcuts(false)}
              >
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}

        <Footer minimal />
      </div>
    </TooltipProvider>
  );
}
