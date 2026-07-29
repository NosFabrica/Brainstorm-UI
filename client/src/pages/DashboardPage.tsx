import { useEffect, useState, useRef, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/PageHeader";
import { getVerifiedThreshold, PRESET_THRESHOLDS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
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
import { NetworkArticlesModule } from "@/components/dashboard/NetworkArticlesModule";
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
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from "framer-motion";
import { BrainLogo } from "@/components/BrainLogo";
import {
  ASSISTANT_UPDATED_EVENT,
  USER_CHANGED_EVENT,
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
import { getCurrentUser, logout, updateCurrentUser, fetchProfile, fetchOutboxRelayList, applyProfileToUser, type NostrUser, isUsingBrainstorm } from "@/services/nostr";
import { isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { isAdminPubkey } from "@/config/adminAccess";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory, useSelfStats } from "@/hooks/useSelf";
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
    tone: "from-brand-primary/20 via-brand-primary/10 to-transparent",
  },
  {
    title: "Not A Popularity Contest",
    subtitle: "A different kind of score",
    content: "Finally, a metric that isn't about clout. A high score simply means your Grapevine verifies this person is real.",
    detail: 'Low score \u2260 uncool. It just means "we haven\'t had the pleasure of meeting yet." Trust is earned, not farmed.',
    tone: "from-fuchsia-500/20 via-brand-primary/10 to-transparent",
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
    detail: "You can use Brainstorm right now \u2014 this finishes in the background, no waiting. It usually takes a few minutes.",
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
    tone: "from-fuchsia-500/20 via-brand-primary/10 to-transparent",
  },
];

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
    const at = Number(localStorage.getItem(`brainstorm_nip85_dismissed_at:${pubkey}`) || 0);
    return at > 0 && Date.now() - at < NIP85_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // With nothing flagged, alerts collapse to a strip and Your Network takes the
  // full row — an all-clear should not hold a two-thirds column hostage.
  const [alertsEmpty, setAlertsEmpty] = useState(false);
  const [hopRange, setHopRange] = useState([1, 3]);
  const [extendedNetworkCount, setExtendedNetworkCount] = useState(250000);
  const [networkViewMode, setNetworkViewMode] = useState<"trust" | "activity">("trust");
  const [activeOnboardingIndex, setActiveOnboardingIndex] = useState(0);
  const [isOnboardingCollapsed, setIsOnboardingCollapsed] = useState(true);
  const [nip85ModalOpen, setNip85ModalOpen] = useState(false);
  const [wotExpanded, setWotExpanded] = useState(false);
  const [nip85Activated, setNip85Activated] = useState(() => isNip85Activated(getCurrentUser()?.pubkey));
  const [nip85Dismissed, setNip85Dismissed] = useState(() => nip85DismissedRecently(getCurrentUser()?.pubkey));
  // In-app-created accounts auto-activate Brainstorm silently (see
  // AutoActivateBrainstorm) — they never get the consent card.
  const nip85CreatedInApp = (() => {
    try { return !!user?.pubkey && localStorage.getItem(`brainstorm_created_inapp:${user.pubkey}`) === "true"; } catch { return false; }
  })();
  const [assistantDismissed, setAssistantDismissed] = useState<boolean>(() => readAssistantDismissed());
  const [assistantPubkey, setAssistantPubkey] = useState<string | null>(() => getCurrentAssistantPubkey());
  // "Your network is live — invite friends" card: shown once, the first time the
  // user's scores go ready (publishDone). Persisted per-account so it never nags.
  const [inviteShareOpen, setInviteShareOpen] = useState(false);
  const [inviteCardSeen, setInviteCardSeen] = useState<boolean>(() => {
    try { const pk = getCurrentUser()?.pubkey; return !!pk && localStorage.getItem(`brainstorm_invite_card_seen:${pk}`) === "true"; } catch { return false; }
  });
  const markInviteCardSeen = () => {
    try { const pk = getCurrentUser()?.pubkey; if (pk) localStorage.setItem(`brainstorm_invite_card_seen:${pk}`, "true"); } catch { /* ignore */ }
    setInviteCardSeen(true);
  };
  useEffect(() => {
    const sync = () => {
      setAssistantPubkey(getCurrentAssistantPubkey());
      setAssistantDismissed(readAssistantDismissed());
      // Keep the local user copy in sync with late-arriving profile metadata
      // (e.g. the avatar/name fetched right after login) so the header updates
      // reactively and the profile fallback query below stays suppressed.
      const fresh = getCurrentUser();
      if (fresh) setUser((prev) => (prev ? { ...prev, ...fresh } : fresh));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("brainstorm_assistant:")) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, sync as EventListener);
    window.addEventListener(USER_CHANGED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, sync as EventListener);
      window.removeEventListener(USER_CHANGED_EVENT, sync as EventListener);
    };
  }, []);

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
        description: "Speaking your trust scores to compatible Nostr apps.",
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
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    setUser(u);
  }, [navigate]);

  const { preset: trustPreset } = useTrustPresetSync(!!user);

  const needsProfile = !!user && !user.displayName && !user.picture;
  const profileQuery = useQuery({
    queryKey: ["profile", user?.pubkey],
    queryFn: async () => {
      if (!user?.pubkey) return null;
      // The login-time profile fetch may have resolved after this query was
      // already enabled (React Query won't cancel an in-flight query). If the
      // metadata is already present, reuse it instead of re-hitting relays.
      const fresh = getCurrentUser();
      if (fresh && (fresh.picture || fresh.displayName)) {
        setUser((prev) => (prev ? { ...prev, ...fresh } : fresh));
        return fresh.profile ?? null;
      }
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

  const recalcTriggeredAtRef = useRef<number | null>(null);

  // SELF overview's `flagged_by_observer` is always false (self ≠ flags self),
  // so threshold doesn't affect any consumed field — omit to keep the queryKey
  // stable across `trustPreset` lifecycle transitions.
  const overviewQuery = useSelfOverview(user?.pubkey);
  const historyQuery = useSelfHistory(user?.pubkey);
  // Stats verified/tier counts DO depend on threshold. Derive from the
  // server-confirmed preset (stable) rather than `getVerifiedThreshold()`
  // (which reads localStorage and can flip mid-mount).
  const statsThreshold = trustPreset ? PRESET_THRESHOLDS[trustPreset] : undefined;
  const statsQuery = useSelfStats(user?.pubkey, statsThreshold !== undefined ? { verified_threshold: statsThreshold } : undefined);

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
        title: hadPrev ? "Refreshing your trust scores" : "Calculating your Web of Trust",
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
  const trustServiceProvider = useQuery({
    queryKey: ["trustServiceProvider", user?.pubkey, taPubkey],
    queryFn: async () => {
      if (!user?.pubkey || !taPubkey) return false;
      return await isUsingBrainstorm(user.pubkey, taPubkey);
    },
    enabled: !!user && !!taPubkey,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: Infinity,
  });

  useEffect(() => {
    // Upgrade-only: a relay confirmation (isUsingBrainstorm === true) marks this
    // account activated and shows the badge. A `false`/undefined is treated as
    // "not propagated yet", NOT a deactivation — relays are eventually-consistent,
    // so we never downgrade here (that caused the badge to flicker right after an
    // auto-publish). Deactivation is explicit, via Settings.
    if (trustServiceProvider.data !== true) return;
    markNip85Activated(getCurrentUser()?.pubkey);
    if (!nip85Activated) setNip85Activated(true);
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

  const hasNoFollowing = overviewQuery.isSuccess && followingCount === 0;

  // The backend `following` count lags for brand-new accounts — it only fills in
  // after the first GrapeRank pass ingests the contact list. So a user who has
  // already followed + triggered scoring still reads followingCount === 0 for a
  // while. This flag (set the moment scoring is triggered, which requires having
  // followed) lets us stop re-nagging them to "follow to begin" and instead show
  // a calm "calculating" state until the count catches up.
  const calcTriggered = (() => {
    try { return !!user?.pubkey && !!localStorage.getItem(`brainstorm_calc_triggered_at:${user.pubkey}`); }
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
    { key: "high", name: "Highly Trusted", color: TRUST_TIER_COLORS.highlyTrusted },
    { key: "medium_high", name: "Trusted", color: TRUST_TIER_COLORS.trusted },
    { key: "medium", name: "Neutral", color: TRUST_TIER_COLORS.neutral },
    { key: "medium_low", name: "Low Trust", color: TRUST_TIER_COLORS.lowTrust },
    { key: "low", name: "Unverified", color: TRUST_TIER_COLORS.unverified },
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
        const value = aggregateByHopRange(tier.key, hopRange[0], hopRange[1]);
        return { name: tier.name, value, color: tier.color };
      }).filter(d => d.value > 0 || d.name === "Flagged");
    }
    const fallback = [
      { label: "Highly Trusted", count: followersCount, color: TRUST_TIER_COLORS.highlyTrusted },
      { label: "Trusted", count: followingCount, color: TRUST_TIER_COLORS.trusted },
      { label: "Neutral", count: Math.max(100, followersCount * 2), color: TRUST_TIER_COLORS.neutral },
      { label: "Low Trust", count: mutedByCount + mutingCount, color: TRUST_TIER_COLORS.lowTrust },
      { label: "Unverified", count: Math.max(10, mutedByCount), color: TRUST_TIER_COLORS.unverified },
      { label: "Flagged", count: flaggedCount, color: TRUST_TIER_COLORS.flagged },
    ];
    const currentHops = hopRange[1];
    return fallback.map((d) => {
      let multiplier = 1;
      if (d.label === "Highly Trusted") multiplier = Math.max(0.2, 1 - (currentHops - 1) * 0.15);
      else if (d.label === "Trusted") multiplier = Math.max(0.4, 1 - (currentHops - 1) * 0.08);
      else if (d.label === "Neutral") multiplier = 1 + (currentHops - 1) * 0.4;
      else if (d.label === "Low Trust") multiplier = 1 + (currentHops - 1) * 0.6;
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
    const k = user?.pubkey ? `brainstorm_calc_completed:${user.pubkey}` : "";
    if (calcDone) {
      try { if (k) localStorage.setItem(k, "true"); localStorage.setItem("brainstorm_calc_completed", "true"); } catch {}
      return true;
    }
    try { return !!k && localStorage.getItem(k) === "true"; } catch { return false; }
  }, [calcDone, user?.pubkey]);

  if (!user || isAuthRedirecting()) return null;

  const isRecalculating = !calcDone && hadPreviousScores && !grapeRankQuery.isLoading;
  const isCalculationComplete = calcDone || isRecalculating;
  const showOnboarding = !grapeRankQuery.isLoading && !publishDone && !hasNoFollowing && !isRecalculating && !hadPreviousScores;
  // No-follows is NOT an error — it's the "start here" state (handled by the
  // inline follow-picker). Only real GrapeRank/publish failures are errors, and
  // we suppress those right after a fresh follow+calculate.
  const isErrorState = (isGrapeRankFailed || isPublishFailed) && !hasNoFollowing && !justFollowed;
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

          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <PageHeader
                kicker="Brainstorm Dashboard"
                title={<>Welcome back, <span className="text-brand-link">{user.displayName || "Traveler"}</span></>}
                subtitle={hasNoFollowing ? "Set up your trust network" : "Your trust network is active and growing."}
                testId="section-dashboard-header-copy"
              />

              {nip85Activated && publishDone ? (
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
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 shrink-0" style={{ fontFamily: "var(--font-display)" }}>Web of Trust</span>
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
                              Speak your trust scores to compatible apps
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
                              Apps that read the personalized trust scores Brainstorm publishes for you — so your Web of Trust travels with you across the apps you use.
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
                      This re-runs your full network trust calculation. It typically takes 10–20 minutes and your current scores will be replaced with updated results.
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
              {isGrapeRankFailed && !hasNoFollowing && !justFollowed && !triggerGrapeRankMutation.isError && !triggerGrapeRankMutation.isPending && !triggerGrapeRankMutation.isSuccess && (
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
                  <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Building your Web of Trust</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400">You're all set — your trust scores are calculating. This can take a few minutes.</div>
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
                className="mb-6"
              >
                <Card className="relative flex items-center gap-3 rounded-xl pl-3.5 pr-2 py-2.5" data-testid="card-invite-grow">
                  <div className="h-8 w-8 rounded-lg bg-brand-primary/[0.07] border border-brand-accent/20 flex items-center justify-center text-brand-link shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <p className="flex-1 min-w-0 text-[13px] text-slate-600 dark:text-slate-300 leading-snug truncate">
                    <span className="font-semibold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }} data-testid="text-invite-grow-title">Your network is live.</span>{" "}
                    <span className="hidden sm:inline text-slate-500 dark:text-slate-400">Invite people — they join connected to you, strengthening everyone's Web of Trust.</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => { setInviteShareOpen(true); markInviteCardSeen(); }}
                    className="shrink-0 h-9 px-4 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-[13px] tracking-wide shadow-sm transition-all flex items-center justify-center gap-1.5"
                    data-testid="button-invite-grow"
                  >
                    <Users className="h-4 w-4" />
                    Invite friends
                  </button>
                  <button
                    type="button"
                    onClick={markInviteCardSeen}
                    className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                nip05={user.profile?.nip05}
                canonicalUrl={typeof window !== "undefined" ? `${window.location.origin}/p/${user.npub}` : ""}
                // No trust pill on an invite: the score is self-referential (your own POV
                // ≈ 100) and meaningless for a brand-new account — the invite is about
                // "join & start connected to you", not a score flex.
                score01={null}
              />
            )}

            {/* Recalculating (established users) no longer gets this full hero —
                status shows via the top-right Trust signals card + the app-wide
                ScoringStatusBar pill. Only brand-new onboarding keeps it. */}
            {showOnboarding && (
              <div
                className="group rounded-2xl bg-gradient-to-br from-slate-950 via-slate-950 to-brand-primary border border-white/10 shadow-[0_20px_40px_-12px_rgb(var(--brand-accent)/0.25)] hover:shadow-[0_28px_70px_-20px_rgb(var(--brand-accent)/0.35)] overflow-hidden relative transition-shadow"
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
                      "radial-gradient(520px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgb(var(--brand-accent)/0.26), rgb(var(--brand-accent)/0.08) 32%, rgba(2,6,23,0) 66%)",
                      "radial-gradient(860px circle at var(--flash-x, 50%) var(--flash-y, 50%), rgb(var(--brand-deep)/0.11), rgba(2,6,23,0) 70%)",
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
                      background: "linear-gradient(180deg, rgb(var(--brand-accent)/0.16), rgba(255,255,255,0.03) 55%, rgb(var(--brand-accent)/0.06))",
                    }}
                  />
                  <div
                    className="absolute inset-x-0 top-[88px] bottom-[280px]"
                    style={{
                      opacity: 0.36,
                      transform: "translateZ(0)",
                      fontFamily: "var(--font-mono)",
                      color: "rgba(226,232,240,0.70)",
                      textShadow: "0 1px 0 rgba(0,0,0,0.22), 0 0 12px rgb(var(--brand-accent)/0.12)",
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

                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-primary)/0.18),_transparent_55%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px] opacity-25" />

                <div className="relative p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-[0.22em] uppercase text-brand-link" data-testid="text-onboarding-kicker">
                        {isRecalculation ? "Recalculating" : isErrorState ? "Action needed" : "Brainstorm onboarding"}
                      </p>
                      <h2
                        className="text-xl sm:text-2xl font-bold text-white tracking-tight"
                        style={{ fontFamily: "var(--font-display)" }}
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
                        className={`inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors ${isOnboardingCollapsed ? "animate-[softPulse_2.6s_ease-in-out_infinite] ring-1 ring-brand-primary/20 shadow-[0_0_0_4px_rgb(var(--brand-primary)/0.06)]" : ""}`}
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
                        <span className={`h-1.5 w-1.5 rounded-full ${isErrorState ? "bg-slate-500" : calcDone ? "bg-brand-primary animate-pulse" : "bg-emerald-400/90"}`} data-testid="dot-queue" />
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
                              style={{ fontFamily: "var(--font-display)" }}
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
                                  className={`w-2 h-2 rounded-full shrink-0 ${isGrapeRankFailed ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]" : !calcDone && grapeRank ? "bg-brand-primary/25 shadow-[0_0_10px_rgba(167,139,250,0.45)] animate-pulse" : "bg-slate-600"}`}
                                  data-testid="dot-onboarding-graph"
                                />
                              )}
                              <span className={`text-xs uppercase tracking-wider font-semibold truncate ${calcDone ? "text-emerald-300" : isGrapeRankFailed ? "text-red-200" : !calcDone && grapeRank ? "text-slate-200" : "text-slate-400"}`} data-testid="text-onboarding-graph">{calcDone ? "Calculated" : "Calculating"}</span>
                            </div>
                            <span className={`hidden sm:inline text-xs font-bold tracking-[0.18em] uppercase ${calcDone ? "text-emerald-300/80" : isGrapeRankFailed ? "text-red-200/80" : grapeRank ? "text-brand-link" : "text-slate-400/70"}`} data-testid="badge-onboarding-graph-state">
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
                                  className={`w-2 h-2 rounded-full shrink-0 ${isPublishFailed ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]" : calcDone && !publishDone ? "bg-brand-primary/25 shadow-[0_0_10px_rgba(232,121,249,0.45)] animate-pulse" : "bg-slate-600"}`}
                                  data-testid="dot-onboarding-scores"
                                />
                              )}
                              <span className={`text-xs uppercase tracking-wider font-semibold truncate ${publishDone ? "text-emerald-300" : isPublishFailed ? "text-red-200" : calcDone && !publishDone ? "text-slate-200" : "text-slate-400"}`} data-testid="text-onboarding-scores">{publishDone ? "Published" : "Publishing"}</span>
                              <span className={`hidden lg:inline text-xs font-semibold tracking-wide ${publishDone ? "text-emerald-300/70" : "text-slate-400/60"}`} data-testid="text-onboarding-scores-ta">
                                (Trusted Assertion)
                              </span>
                            </div>
                            <span className={`hidden sm:inline text-xs font-bold tracking-[0.18em] uppercase ${publishDone ? "text-emerald-300/80" : isPublishFailed ? "text-red-200/80" : calcDone ? "text-brand-link" : "text-slate-400/70"}`} data-testid="badge-onboarding-scores-state" title="Trusted Assertion">
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
                            <div className="p-4 sm:p-5">
                              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-400" data-testid="text-onboarding-active-subtitle">
                                    {ONBOARDING_SLIDES[activeOnboardingIndex].subtitle}
                                  </p>
                                  <h3
                                    className="text-base sm:text-lg font-semibold text-white mt-1"
                                    style={{ fontFamily: "var(--font-display)" }}
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
                                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" data-testid="dot-onboarding-step" />
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

          {publishDone && !isRecalculating && !nip85Activated && !nip85Dismissed && !nip85CreatedInApp && (
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
                      Select Brainstorm as your Web of Trust Service Provider
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed" data-testid="text-nip85-cta-subtitle">
                      Sign a nostr note that tells compatible clients where to find your personalized trust scores.
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
                          const pk = getCurrentUser()?.pubkey;
                          if (pk) localStorage.setItem(`brainstorm_nip85_dismissed_at:${pk}`, String(Date.now()));
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
              toast({ title: "Brainstorm activated!", description: "Your trust scores are now available across the nostr ecosystem." });
            }}
          />

          {/* Investigate command bar — research entry point into the deep-dive
              analytics (/profile/:npub) for anyone in your network. */}
          <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 px-3 py-2.5 shadow-sm" data-testid="dashboard-lookup-bar">
            <DashboardLookup />
          </div>

          {/* Three boxes total: the Look-up bar above, then Network Alerts (2/3)
              beside the condensed "Your Network" card (1/3) — which folds in what
              used to be three separate tiles (Social Graph, Extended Reach and the
              full Network Health pie; the pie's tier drill-downs now live on
              /network). Flex (not grid) so each column sizes to its own content.
              Stacks on mobile. */}
          <div className={`flex flex-col gap-4 mb-6 ${alertsEmpty ? "" : "lg:flex-row lg:items-start"}`}>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={alertsEmpty ? "w-full flex" : "lg:w-2/3 flex"}>
              <NetworkAlertsModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} onEmptyChange={setAlertsEmpty} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={alertsEmpty ? "w-full flex" : "lg:w-1/3 flex"}>
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
                wide={alertsEmpty}
              />
            </motion.div>
          </div>

          {/* Discovery, not a following feed: long-form from accounts two-plus
              hops out that the graph vouches for. Renders nothing until there's
              something worth showing. */}
          <NetworkArticlesModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />

          {/* The circle you already chose (1 hop), under the discovery module.
              Read-only: notes open the full conversation at /e/:id rather than
              faking a composer the product doesn't have yet. */}
          <NetworkThreadModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />


          {/* The dashboard is a workspace, so it ends on the user's own content.
              What was a full-bleed marketing band plus a ~420px client carousel is
              now one quiet row: education stays one click away for anyone who wants
              it, without a billboard between the feed and the footer. */}
          {/* Stacks centered on mobile (no awkward left/right split), settles into
              one spaced row on desktop. The client list is its own centered line
              so it never collides with the two links. */}
          <div className="mb-8 flex flex-col items-center gap-3 border-t border-slate-200/70 dark:border-slate-800/60 pt-4 text-xs sm:flex-row sm:justify-between sm:gap-6" data-testid="dashboard-footer-strip">
            <button
              type="button"
              onClick={() => navigate("/what-is-wot")}
              className="inline-flex items-center gap-1.5 font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
              data-testid="button-learn-wot"
            >
              How trust works <ArrowRight className="h-3 w-3" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-slate-400 dark:text-slate-500">
              <span>Works with</span>
              <span className="font-medium text-slate-500 dark:text-slate-400">Amethyst · Ditto · Nostria · Primal</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/nostr")}
              className="font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
              data-testid="link-supported-clients"
            >
              See all clients →
            </button>
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

        <Footer />
      </div>
    </TooltipProvider>
  );
}
