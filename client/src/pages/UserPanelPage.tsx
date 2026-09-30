import { useState, useEffect, useMemo, useCallback } from "react";
import { useTierRing } from "@/components/score/VerificationCoin";
import { copyToClipboard } from "@/lib/clipboard";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PageBackground from "@/components/PageBackground";
import workshopBg from "@assets/Gemini_Generated_Image_9rkzed9rkzed9rkz_1775844197287.png";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { ASSISTANT_UPDATED_EVENT, readPublishedAssistant } from "@/lib/assistantStorage";
import { isNip85Activated } from "@/lib/nip85Activation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Home,
  Search,
  LogOut,
  Settings as SettingsIcon,
  Users,
  HelpCircle,
  Shield,
  Copy,
  Loader2,
  Check,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  UserPlus,
  Clock,
  List,
  ArrowUpDown,
  ExternalLink,
  X,
  Zap,
  Sparkles,
  Activity,
  Globe,
  Star,
  Eye,
  Signal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { ImageUpload } from "@/components/ImageUpload";
import { fetchProfiles, getNip85RelayUrl } from "@/services/nostr";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { AdminBadge } from "@/components/AdminBadge";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory, useSelfConnections, flattenConnections } from "@/hooks/useSelf";
import { useSocialActions } from "@/hooks/useSocialActions";
import { TIER_LABELS } from "@/services/trustThreshold";

type SortField = "name" | "score" | "tier";
type SortDir = "asc" | "desc";
type AgentStatus = "dormant" | "activating" | "active" | "established" | "networked" | "trusted";

interface FollowedUser {
  pubkey: string;
  npub: string;
  influence: number;
  displayName?: string;
  picture?: string;
  tier: string;
  tierColor: string;
}

interface LookedUpUser {
  pubkey: string;
  npub: string;
  displayName?: string;
  picture?: string;
}

interface TaHistoryEntry {
  timestamp: number;
  eventKind: number;
  relays: string[];
  status: "success" | "failure" | "pending";
}

interface AgentState {
  name: string;
  description: string;
  picture: string;
  banner: string;
  lud16: string;
  nip05: string;
  website: string;
  status: AgentStatus;
  activatedAt: number | null;
  publishedAt: number | null;
}

const AGENT_STATUS_CONFIG: Record<
  AgentStatus,
  {
    label: string;
    color: string;
    bgClass: string;
    borderClass: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    level: number;
  }
> = {
  dormant: {
    label: "Dormant",
    color: "text-slate-400",
    bgClass: "bg-slate-500/20",
    borderClass: "border-slate-500/30",
    icon: AgentIcon,
    description: "Your agent awaits activation",
    level: 0,
  },
  activating: {
    label: "Activating",
    color: "text-amber-400",
    bgClass: "bg-amber-500/20",
    borderClass: "border-amber-500/30",
    icon: Loader2,
    description: "Powering up...",
    level: 0,
  },
  active: {
    label: "Active",
    color: "text-emerald-400",
    bgClass: "bg-emerald-500/20",
    borderClass: "border-emerald-500/30",
    icon: Zap,
    description: "Published to the Nostr network",
    level: 1,
  },
  established: {
    label: "Established",
    color: "text-brand-accent",
    bgClass: "bg-brand-accent/20",
    borderClass: "border-brand-accent/[0.3]",
    icon: Globe,
    description: "Discovered by multiple relays",
    level: 2,
  },
  networked: {
    label: "Networked",
    color: "text-brand-link",
    bgClass: "bg-brand-primary/20",
    borderClass: "border-brand-primary/[0.3]",
    icon: Signal,
    description: "Connected to the wider trust network",
    level: 3,
  },
  trusted: {
    label: TIER_LABELS.trusted,
    color: "text-amber-300",
    bgClass: "bg-amber-400/20",
    borderClass: "border-amber-400/30",
    icon: Star,
    description: "Recognized and trusted across the ecosystem",
    level: 4,
  },
};

const ACHIEVEMENTS = [
  {
    id: "activated",
    label: "First Spark",
    description: "Activated your agent",
    icon: Zap,
    check: (a: AgentState) => a.status !== "dormant" && a.status !== "activating",
  },
  {
    id: "named",
    label: "Identity",
    description: "Named your agent",
    icon: AgentIcon,
    check: (a: AgentState) => !!a.name,
  },
  {
    id: "published",
    label: "On the Grid",
    description: "Published to Nostr relays",
    icon: Globe,
    check: (a: AgentState) => !!a.publishedAt,
  },
  {
    id: "described",
    label: "Story Told",
    description: "Added a description",
    icon: Sparkles,
    check: (a: AgentState) => !!a.description,
  },
  {
    id: "portrait",
    label: "Portrait",
    description: "Added a profile picture",
    icon: Eye,
    check: (a: AgentState) => !!a.picture,
  },
  {
    id: "lightning",
    label: "Lightning Rod",
    description: "Added a lightning address",
    icon: Zap,
    check: (a: AgentState) => !!a.lud16,
  },
  {
    id: "verified",
    label: "Verified",
    description: "Added NIP-05 identity",
    icon: Shield,
    check: (a: AgentState) => !!a.nip05,
  },
];

function getDefaultAgentState(): AgentState {
  try {
    const stored = localStorage.getItem("brainstorm_agent_state");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        name: parsed.name || "",
        description: parsed.description || "",
        picture: parsed.picture || "",
        banner: parsed.banner || "",
        lud16: parsed.lud16 || "",
        nip05: parsed.nip05 || "",
        website: parsed.website || "",
        status: parsed.status || "dormant",
        activatedAt: parsed.activatedAt || null,
        publishedAt: parsed.publishedAt || null,
      };
    }
  } catch {}
  return {
    name: "",
    description: "",
    picture: "",
    banner: "",
    lud16: "",
    nip05: "",
    website: "",
    status: "dormant",
    activatedAt: null,
    publishedAt: null,
  };
}

function saveAgentState(state: AgentState) {
  try {
    localStorage.setItem("brainstorm_agent_state", JSON.stringify(state));
  } catch {}
}

function getTier(influence: number): { name: string; color: string; badgeClass: string } {
  if (influence >= 0.8)
    return {
      name: TIER_LABELS.high,
      color: "text-emerald-600",
      badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  if (influence >= 0.5)
    return {
      name: TIER_LABELS.trusted,
      color: "text-brand-accent",
      badgeClass: "bg-brand-accent/10 border-brand-accent/20 text-brand-accent",
    };
  if (influence >= 0.2)
    return {
      name: "Neutral",
      color: "text-brand-primary",
      badgeClass: "bg-brand-primary/10 border-brand-primary/20 text-brand-primary",
    };
  if (influence >= 0.05)
    return {
      name: TIER_LABELS.low,
      color: "text-amber-600",
      badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
    };
  return {
    name: "Unverified",
    color: "text-slate-500",
    badgeClass:
      "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400",
  };
}

function TrendIndicator({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <Minus className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.001) return <Minus className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />;
  if (diff > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
}

function StatusLevelBar({ currentLevel }: { currentLevel: number }) {
  const levels = ["Dormant", "Active", "Established", "Networked", "Trusted"];
  return (
    <div className="flex w-full items-center gap-1" data-testid="agent-status-bar">
      {levels.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`h-1.5 w-full rounded-full transition-all duration-700 ${i <= currentLevel ? "bg-gradient-to-r from-emerald-400 to-brand-accent shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-white/10"}`}
          />
          <span
            className={`text-[8px] font-bold uppercase tracking-widest transition-colors ${i <= currentLevel ? "text-emerald-300" : "text-white/20"}`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function UserPanelPage() {
  const tierRing = useTierRing();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const [agentState, setAgentState] = useState<AgentState>(getDefaultAgentState);
  const [agentNameInput, setAgentNameInput] = useState(() => getDefaultAgentState().name);
  const [agentDescInput, setAgentDescInput] = useState(() => getDefaultAgentState().description);
  const [agentPictureInput, setAgentPictureInput] = useState(() => getDefaultAgentState().picture);
  const [agentBannerInput, setAgentBannerInput] = useState(() => getDefaultAgentState().banner);
  const [agentLud16Input, setAgentLud16Input] = useState(() => getDefaultAgentState().lud16);
  const [agentNip05Input, setAgentNip05Input] = useState(() => getDefaultAgentState().nip05);
  const [agentWebsiteInput, setAgentWebsiteInput] = useState(() => getDefaultAgentState().website);
  const [agentCardExpanded, setAgentCardExpanded] = useState(false);
  const [activateConfirmOpen, setActivateConfirmOpen] = useState(false);
  const [npubInput, setNpubInput] = useState("");
  const [lookedUpUser, setLookedUpUser] = useState<LookedUpUser | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [scoreSearch, setScoreSearch] = useState("");
  const [scoreSortField, setScoreSortField] = useState<SortField>("score");
  const [scoreSortDir, setScoreSortDir] = useState<SortDir>("desc");
  const [followedProfiles, setFollowedProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());
  const [previousScores] = useState<Map<string, number>>(() => {
    try {
      const stored = localStorage.getItem("brainstorm_previous_scores");
      if (stored) return new Map(JSON.parse(stored));
    } catch {}
    return new Map();
  });

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const updateAgentState = useCallback((updates: Partial<AgentState>) => {
    setAgentState((prev) => {
      const next = { ...prev, ...updates };
      saveAgentState(next);
      return next;
    });
  }, []);

  // Hydrate agent state from lightweight one-click publish (BrainstormAssistantCard)
  // so users who published via Dashboard/Settings see "active" status here without re-publishing.
  // Also re-syncs reactively when the lightweight card publishes in another tab/component
  // via `storage` events and a same-tab `brainstorm-assistant-updated` custom event.
  useEffect(() => {
    const STATUS_LEVEL: Record<AgentStatus, number> = {
      dormant: 0,
      activating: 1,
      active: 2,
      established: 3,
      networked: 4,
      trusted: 5,
    };
    const sync = () => {
      try {
        const lw = readPublishedAssistant();
        if (!lw) return;
        const lwTs = lw.publishedAt;
        if (!lwTs || isNaN(lwTs)) return;
        setAgentState((prev) => {
          if (prev.publishedAt && prev.publishedAt >= lwTs) return prev;
          const promotedStatus: AgentStatus = STATUS_LEVEL[prev.status] >= STATUS_LEVEL.active ? prev.status : "active";
          const next: AgentState = {
            ...prev,
            status: promotedStatus,
            publishedAt: lwTs,
            activatedAt: prev.activatedAt || lwTs,
          };
          saveAgentState(next);
          return next;
        });
      } catch {}
    };
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("brainstorm_assistant:")) sync();
    };
    const onCustom = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, onCustom);
    };
  }, [user?.pubkey]);

  const { data: overviewData, isLoading: overviewLoading } = useSelfOverview(user?.pubkey);
  const { data: historyData, isLoading: historyLoading } = useSelfHistory(user?.pubkey);
  const followingConnections = useSelfConnections(user?.pubkey, "following", { enabled: !!user });
  const selfLoading = overviewLoading || historyLoading;

  const { data: grapeRankData, isLoading: grapeRankLoading } = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const taPubkey = historyData?.data?.ta_pubkey;
  const trustServiceProvider = useTrustProviderStatus(user?.pubkey, taPubkey);

  // The on-relay 10040 wins: a declaration naming a different assistant reads
  // as NOT activated no matter what the local flag says; absence/silence keeps
  // the flag's answer (a relay miss is not a deactivation).
  const nip85Activated =
    trustServiceProvider.data === "brainstorm" ||
    (trustServiceProvider.data !== "other" && isNip85Activated(user?.pubkey));
  const socialActions = useSocialActions(user?.pubkey);

  const followingList = useMemo(
    () => flattenConnections(followingConnections.data?.pages),
    [followingConnections.data?.pages],
  );
  const followingCount = overviewData?.data?.counts?.following ?? 0;
  const followersCount = overviewData?.data?.counts?.followed_by ?? 0;
  const totalNetworkSize = followingCount + followersCount;

  useEffect(() => {
    if (agentState.status === "dormant" || agentState.status === "activating") return;
    const totalSize = followingCount + followersCount;
    const grData = grapeRankData?.data;
    const hasCalc = grData?.internal_publication_status?.toLowerCase() === "success";

    let newStatus: AgentStatus = "active";
    if (agentState.publishedAt) newStatus = "active";
    if (agentState.publishedAt && totalSize >= 10) newStatus = "established";
    if (newStatus === "established" && nip85Activated && totalSize >= 50) newStatus = "networked";
    if (newStatus === "networked" && hasCalc && totalSize >= 100) newStatus = "trusted";

    if (newStatus !== agentState.status) {
      updateAgentState({ status: newStatus });
    }
  }, [
    followingCount,
    followersCount,
    grapeRankData,
    nip85Activated,
    agentState.status,
    agentState.publishedAt,
    updateAgentState,
  ]);

  const grapeRank = grapeRankData?.data;
  const calcDone =
    grapeRank?.internal_publication_status?.toLowerCase() === "success" ||
    localStorage.getItem("brainstorm_calc_completed") === "true";
  const lastCalculated = historyData?.data?.last_time_calculated_graperank || grapeRankData?.data?.updated_at || null;

  const followedUsers = useMemo((): FollowedUser[] => {
    return followingList.map((entry) => {
      const pubkey = entry.pubkey;
      const influence = entry.influence ?? 0;
      let npub: string;
      try {
        npub = nip19.npubEncode(pubkey);
      } catch {
        npub = pubkey;
      }
      const tierInfo = getTier(influence);
      const profile = followedProfiles.get(pubkey);
      return {
        pubkey,
        npub,
        influence,
        displayName: profile?.name,
        picture: profile?.picture,
        tier: tierInfo.name,
        tierColor: tierInfo.badgeClass,
      };
    });
  }, [followingList, followedProfiles]);

  useEffect(() => {
    if (followedUsers.length > 0) {
      const currentScores = new Map<string, number>();
      followedUsers.forEach((u) => currentScores.set(u.pubkey, u.influence));
      try {
        localStorage.setItem("brainstorm_previous_scores", JSON.stringify(Array.from(currentScores.entries())));
      } catch {}
    }
  }, [followedUsers]);

  useEffect(() => {
    if (followingList.length === 0) return;
    const pubkeys = followingList.map((e) => e.pubkey).slice(0, 100);
    if (pubkeys.length === 0) return;
    fetchProfiles(pubkeys, (pubkey, profile) => {
      setFollowedProfiles((prev) => {
        const next = new Map(prev);
        next.set(pubkey, { name: profile.display_name || profile.name, picture: profile.picture || profile.image });
        return next;
      });
    });
  }, [followingList]);

  const filteredAndSortedUsers = useMemo(() => {
    let list = [...followedUsers];
    if (scoreSearch.trim()) {
      const q = scoreSearch.toLowerCase();
      list = list.filter(
        (u) =>
          (u.displayName && u.displayName.toLowerCase().includes(q)) ||
          u.npub.toLowerCase().includes(q) ||
          u.pubkey.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (scoreSortField === "score" || scoreSortField === "tier") {
        va = a.influence;
        vb = b.influence;
      } else {
        va = (a.displayName || a.npub).toLowerCase();
        vb = (b.displayName || b.npub).toLowerCase();
      }
      if (va < vb) return scoreSortDir === "asc" ? -1 : 1;
      if (va > vb) return scoreSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [followedUsers, scoreSearch, scoreSortField, scoreSortDir]);

  const taHistory = useMemo((): TaHistoryEntry[] => {
    const entries: TaHistoryEntry[] = [];
    if (grapeRank) {
      let nip85Relay: string | null = null;
      try {
        nip85Relay = getNip85RelayUrl();
      } catch {
        nip85Relay = null;
      }
      const createdAt = grapeRank.created_at
        ? new Date(grapeRank.created_at.endsWith?.("Z") ? grapeRank.created_at : grapeRank.created_at + "Z")
        : null;
      const updatedAt = grapeRank.updated_at
        ? new Date(grapeRank.updated_at.endsWith?.("Z") ? grapeRank.updated_at : grapeRank.updated_at + "Z")
        : null;
      const taStatus = grapeRank.ta_status;
      const relays = nip85Relay ? [nip85Relay] : [];
      if (updatedAt && !isNaN(updatedAt.getTime())) {
        entries.push({
          timestamp: updatedAt.getTime(),
          eventKind: 30382,
          relays,
          status:
            taStatus?.toLowerCase() === "success"
              ? "success"
              : taStatus?.toLowerCase() === "failure"
                ? "failure"
                : "pending",
        });
      }
      if (createdAt && !isNaN(createdAt.getTime()) && createdAt.getTime() !== updatedAt?.getTime()) {
        entries.push({ timestamp: createdAt.getTime(), eventKind: 30382, relays, status: "success" });
      }
    }
    const localHistory = localStorage.getItem("brainstorm_ta_history");
    if (localHistory) {
      try {
        const parsed = JSON.parse(localHistory);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (!entries.some((e) => Math.abs(e.timestamp - entry.timestamp) < 60000)) entries.push(entry);
          }
        }
      } catch {}
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
  }, [grapeRank]);

  const getProfilePayload = useCallback(
    () => ({
      name: agentNameInput.trim(),
      about: agentDescInput.trim(),
      picture: agentPictureInput,
      banner: agentBannerInput,
      lud16: agentLud16Input.trim(),
      nip05: agentNip05Input.trim(),
      website: agentWebsiteInput.trim(),
    }),
    [
      agentNameInput,
      agentDescInput,
      agentPictureInput,
      agentBannerInput,
      agentLud16Input,
      agentNip05Input,
      agentWebsiteInput,
    ],
  );

  const getAgentStateUpdates = useCallback(
    () => ({
      name: agentNameInput.trim(),
      description: agentDescInput.trim(),
      picture: agentPictureInput,
      banner: agentBannerInput,
      lud16: agentLud16Input.trim(),
      nip05: agentNip05Input.trim(),
      website: agentWebsiteInput.trim(),
    }),
    [
      agentNameInput,
      agentDescInput,
      agentPictureInput,
      agentBannerInput,
      agentLud16Input,
      agentNip05Input,
      agentWebsiteInput,
    ],
  );

  const publishBrainstormProfile = useMutation({
    mutationFn: async () => await apiClient.publishBrainstormAssistantProfile(getProfilePayload()),
    onSuccess: () => {
      updateAgentState({ ...getAgentStateUpdates(), status: "active", publishedAt: Date.now() });
      toast({
        title: "Assistant deployed!",
        description: `${agentNameInput.trim() || "Your assistant"} is now live on the Nostr network.`,
      });
    },
    onError: (error: Error) => {
      const isNoBackend =
        error.message.includes("404") ||
        error.message.includes("405") ||
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError") ||
        error.message.includes("Method Not Allowed");
      if (isNoBackend) {
        updateAgentState({
          ...getAgentStateUpdates(),
          status: "active",
          activatedAt: Date.now(),
          publishedAt: Date.now(),
        });
        toast({
          title: "Assistant activated!",
          description: `${agentNameInput.trim() || "Your assistant"} is now active. Network publishing coming soon.`,
        });
      } else {
        updateAgentState({ status: "dormant" });
        toast({
          variant: "destructive",
          title: "Activation failed",
          description: error.message || "Something went wrong.",
        });
      }
    },
  });

  const updateBrainstormProfile = useMutation({
    mutationFn: async () => await apiClient.publishBrainstormAssistantProfile(getProfilePayload()),
    onSuccess: () => {
      toast({ title: "Assistant updated", description: "Profile published to the network." });
    },
    onError: (error: Error) => {
      const isNoBackend =
        error.message.includes("404") ||
        error.message.includes("405") ||
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError") ||
        error.message.includes("Method Not Allowed");
      if (isNoBackend) {
        toast({ title: "Changes saved!", description: "Profile updated locally. Network sync coming soon." });
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: error.message || "Could not publish changes.",
        });
      }
    },
  });

  const handleActivateAgent = () => {
    if (!agentNameInput.trim()) {
      toast({
        variant: "destructive",
        title: "Name your assistant",
        description: "Give your assistant a name before activating.",
      });
      return;
    }
    setActivateConfirmOpen(true);
  };

  const handleConfirmActivation = () => {
    setActivateConfirmOpen(false);
    updateAgentState({ ...getAgentStateUpdates(), status: "activating", activatedAt: Date.now() });
    publishBrainstormProfile.mutate();
  };

  const handleUpdateAgent = () => {
    updateAgentState(getAgentStateUpdates());
    updateBrainstormProfile.mutate();
  };

  const resolveNpubInput = (): string | null => {
    const input = npubInput.trim();
    if (!input) return null;
    try {
      if (input.startsWith("npub1")) {
        const decoded = nip19.decode(input);
        if (decoded.type === "npub") return decoded.data;
        return null;
      }
      if (/^[0-9a-f]{64}$/i.test(input)) return input;
      return null;
    } catch {
      return null;
    }
  };

  const handleLookupNpub = async () => {
    const pubkey = resolveNpubInput();
    if (!pubkey) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Please enter a valid npub or hex pubkey.",
      });
      return;
    }
    setLookupLoading(true);
    setLookedUpUser(null);
    let npub: string;
    try {
      npub = nip19.npubEncode(pubkey);
    } catch {
      npub = pubkey;
    }
    const resolved: LookedUpUser = { pubkey, npub };
    try {
      await fetchProfiles([pubkey], (pk, profile) => {
        resolved.displayName = profile.display_name || profile.name;
        resolved.picture = profile.picture || profile.image;
      });
    } catch {
      toast({ variant: "destructive", title: "Lookup failed", description: "Could not fetch profile." });
    }
    setLookedUpUser(resolved);
    setLookupLoading(false);
  };

  const handleFollowLookedUp = async () => {
    if (!lookedUpUser) return;
    const result = await socialActions.follow(lookedUpUser.pubkey);
    if (result.cancelled) return;
    if (result.success) {
      toast({
        title: "Followed!",
        description: `You are now following ${lookedUpUser.displayName || lookedUpUser.npub.slice(0, 16) + "..."}`,
      });
    } else {
      toast({ variant: "destructive", title: "Follow failed", description: result.error || "Something went wrong." });
    }
  };

  const handleCopyInviteLink = () => {
    copyToClipboard(window.location.origin);
    toast({ title: "Invite link copied!", description: "Share this link to grow the network." });
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr.endsWith?.("Z") ? dateStr : dateStr + "Z");
    if (isNaN(date.getTime())) return "Unknown";
    const diffMs = Date.now() - date.getTime();
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

  const toggleSort = (field: SortField) => {
    if (scoreSortField === field) setScoreSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setScoreSortField(field);
      setScoreSortDir("desc");
    }
  };

  if (!user || isAuthRedirecting()) return null;

  const statusConfig = AGENT_STATUS_CONFIG[agentState.status];
  const agentIsLive = agentState.status !== "dormant" && agentState.status !== "activating";
  const truncatedNpub = user.npub.slice(0, 12) + "..." + user.npub.slice(-6);

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-agentsuite"
    >
      <PageBackground />

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950" data-testid="nav-agentsuite">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4 sm:gap-6">
              <button
                type="button"
                className="flex min-w-0 items-center gap-3 lg:hidden"
                onClick={() => navigate("/dashboard")}
                data-testid="button-agentsuite-mobile-brand"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]">
                  <BrainLogo size={20} className="text-brand-link" />
                </div>
                <div className="min-w-0 text-left leading-tight">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-link">Brainstorm</p>
                  <p
                    className="bg-gradient-to-r from-brand-accent to-brand-primary bg-clip-text text-sm font-bold text-transparent"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Agent Suite
                  </p>
                </div>
              </button>

              <button
                type="button"
                className="hidden items-center gap-2 lg:flex"
                onClick={() => navigate("/dashboard")}
                data-testid="button-desktop-brand"
              >
                <BrainLogo size={28} className="text-brand-primary" />
                <span
                  className="text-lg font-bold tracking-tight text-white sm:text-xl"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-logo"
                >
                  Brainstorm
                </span>
              </button>

              <div className="hidden gap-1 lg:flex" data-testid="nav-agentsuite-tabs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="no-default-hover-elevate no-default-active-elevate gap-2 rounded-md text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" /> Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="no-default-hover-elevate no-default-active-elevate gap-2 rounded-md text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
                  onClick={() => navigate("/")}
                  data-testid="button-nav-search"
                >
                  <Search className="h-4 w-4" /> Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`no-default-hover-elevate no-default-active-elevate gap-2 rounded-md transition-all duration-200 ${calcDone ? "text-slate-400 hover:bg-white/[0.06] hover:text-white" : "cursor-not-allowed text-slate-600 opacity-40"}`}
                  onClick={() => calcDone && navigate("/network")}
                  disabled={!calcDone}
                  data-testid="button-nav-network"
                >
                  <Users className="h-4 w-4" /> Network
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="no-default-hover-elevate no-default-active-elevate gap-2 rounded-md text-white transition-all duration-200"
                  data-testid="button-nav-agentsuite"
                >
                  <AgentIcon className="h-4 w-4" />{" "}
                  <span className="bg-gradient-to-r from-brand-accent to-brand-primary bg-clip-text text-transparent">
                    Agent Suite
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {user?.isAdmin && <AdminBadge />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex cursor-pointer items-center gap-3 rounded-full p-1 transition-opacity hover:bg-white/5 hover:opacity-80"
                    data-testid="button-agentsuite-profile-menu"
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        className="h-9 w-9 border-2 border-white shadow-md ring-2 ring-white/20"
                        data-testid="img-agentsuite-avatar"
                      >
                        {user.picture ? (
                          <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                        ) : null}
                        <AvatarFallback className="bg-brand-primary/15 font-bold text-brand-primary">
                          {user.displayName?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="mr-2 hidden flex-col items-start md:flex">
                      <span
                        className="mb-0.5 text-sm font-bold leading-none text-white"
                        data-testid="text-agentsuite-profile-name"
                      >
                        {user.displayName || "Anon"}
                      </span>
                      <span
                        className="font-mono text-[10px] leading-none text-brand-link"
                        data-testid="text-agentsuite-profile-npub"
                      >
                        {user.npub.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-72 border-brand-primary/20 bg-white/95 backdrop-blur-xl dark:bg-slate-900/95"
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900 dark:text-slate-100">
                        {user.displayName || "Anon"}
                      </p>
                      <button
                        className="flex items-center gap-1 text-xs leading-none text-slate-500 transition-colors hover:text-brand-primary dark:text-slate-400"
                        onClick={() => {
                          copyToClipboard(user.npub);
                          toast({ title: "Copied!", description: "npub copied to clipboard" });
                        }}
                        data-testid="button-copy-npub"
                      >
                        <span>{user.npub.slice(0, 16)}...</span>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-brand-primary/15" />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => navigate("/faq")}
                    data-testid="dropdown-faq"
                  >
                    <HelpCircle className="mr-2 h-4 w-4" /> <span>FAQ</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => navigate("/settings")}
                    data-testid="dropdown-settings"
                  >
                    <SettingsIcon className="mr-2 h-4 w-4" /> <span>Settings</span>
                  </DropdownMenuItem>
                  {user?.isAdmin && (
                    <DropdownMenuItem
                      className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800"
                      onClick={() => navigate("/admin")}
                      data-testid="dropdown-admin"
                    >
                      <Shield className="mr-2 h-4 w-4" /> <span>Admin Dashboard</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-brand-primary/15" />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={handleLogout}
                    data-testid="dropdown-signout"
                  >
                    <LogOut className="mr-2 h-4 w-4" /> <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-fade-up space-y-6" data-testid="container-agentsuite">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-agentsuite-header">
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-accent/20 bg-white/70 px-2.5 py-0.5 shadow-sm backdrop-blur-sm dark:bg-slate-900/70">
                <div className="h-1 w-1 rounded-full bg-brand-accent shadow-[0_0_4px_#13d2e5]" />
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-brand-accent">
                  Your Assistant on Nostr
                </p>
              </div>
              <h1
                className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-agentsuite-title"
              >
                <span className="block animate-gradient-x bg-gradient-to-r from-brand-accent via-brand-primary to-brand-primary bg-[length:200%_auto] bg-clip-text pb-1 text-transparent drop-shadow-sm">
                  Agent Suite
                </span>
              </h1>
              <p
                className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:text-base"
                data-testid="text-agentsuite-subtitle"
              >
                Build your trust assistant — it grows with your network and earns trust on your behalf.
              </p>
            </div>
          </div>

          <div
            className="overflow-hidden rounded-2xl border border-brand-accent/20 shadow-[0_0_30px_rgba(6,182,212,0.08)]"
            data-testid="card-agent-hero"
          >
            <div className="relative bg-gradient-to-br from-slate-950 via-[#0c1929] to-slate-950">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: `url(${workshopBg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  mixBlendMode: "luminosity",
                }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.12),transparent_60%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgb(var(--brand-accent)/0.08),transparent_60%)]" />
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/[0.4] to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent" />

              <div className="relative">
                <button
                  onClick={() => setAgentCardExpanded(!agentCardExpanded)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 transition-colors hover:bg-white/[0.02] sm:px-6 sm:py-4"
                  data-testid="button-toggle-agent-card"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${(agentIsLive && agentState.picture) || agentPictureInput ? "border border-brand-accent/[0.3] bg-gradient-to-br from-brand-accent/20 to-brand-primary/20" : ""}`}
                    >
                      {agentIsLive && agentState.picture ? (
                        <img
                          src={agentState.picture}
                          alt={agentState.name}
                          className="h-full w-full rounded-xl object-cover"
                        />
                      ) : agentPictureInput ? (
                        <img src={agentPictureInput} alt="Agent" className="h-full w-full rounded-xl object-cover" />
                      ) : (
                        <AgentIcon className="h-5 w-5 text-brand-accent" />
                      )}
                    </div>
                    <div className="text-left">
                      <h2
                        className="text-sm font-bold tracking-tight text-white"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {agentIsLive ? agentState.name || "Unnamed Assistant" : "Create Your Assistant"}
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {agentIsLive ? statusConfig.description : "Deploy a trust agent to represent you on Nostr"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {agentIsLive && !agentCardExpanded && (
                      <div className="hidden items-center gap-1.5 sm:flex">
                        {agentState.lud16 && (
                          <span title={agentState.lud16}>
                            <Zap className="h-3 w-3 text-amber-400" />
                          </span>
                        )}
                        {agentState.nip05 && (
                          <span title={agentState.nip05}>
                            <CheckCircle2 className="h-3 w-3 text-brand-link" />
                          </span>
                        )}
                        {agentState.website && (
                          <span title={agentState.website}>
                            <Globe className="h-3 w-3 text-brand-accent" />
                          </span>
                        )}
                      </div>
                    )}
                    {agentIsLive && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${statusConfig.bgClass} border ${statusConfig.borderClass}`}
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusConfig.color.replace("text-", "bg-")}`}
                          />
                          <span
                            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusConfig.color.replace("text-", "bg-")}`}
                          />
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </span>
                    )}
                    {agentCardExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${agentCardExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
                >
                  <div className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
                    {!agentIsLive ? (
                      <div className="mx-auto max-w-2xl space-y-3" data-testid="agent-activation-flow">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                            Name *
                          </label>
                          <Input
                            placeholder="e.g. TrustBot, Guardian..."
                            value={agentNameInput}
                            onChange={(e) => setAgentNameInput(e.target.value)}
                            className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                            data-testid="input-agent-name"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                            Bio
                          </label>
                          <textarea
                            placeholder="Describe its role and purpose..."
                            value={agentDescInput}
                            onChange={(e) => setAgentDescInput(e.target.value)}
                            rows={2}
                            className="w-full resize-none rounded-md border border-white/15 bg-white/[0.07] px-3 py-2 text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-1 focus:ring-brand-accent/25"
                            data-testid="input-agent-desc"
                          />
                        </div>
                        <div className="grid grid-cols-[72px_1fr] items-end gap-3">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                              Avatar
                            </label>
                            <ImageUpload
                              value={agentPictureInput}
                              onChange={setAgentPictureInput}
                              onRemove={() => setAgentPictureInput("")}
                              aspect="square"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                              Banner
                            </label>
                            <ImageUpload
                              value={agentBannerInput}
                              onChange={setAgentBannerInput}
                              onRemove={() => setAgentBannerInput("")}
                              aspect="banner"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center gap-1.5">
                            <div className="h-1 w-1 rounded-full bg-amber-400" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400/80">
                              Connections
                            </span>
                            <span className="ml-1 text-[9px] italic text-slate-500">optional</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                Lightning
                              </label>
                              <Input
                                placeholder="you@getalby.com"
                                value={agentLud16Input}
                                onChange={(e) => setAgentLud16Input(e.target.value)}
                                className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                                data-testid="input-agent-lud16"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                NIP-05
                              </label>
                              <Input
                                placeholder="you@nostr.com"
                                value={agentNip05Input}
                                onChange={(e) => setAgentNip05Input(e.target.value)}
                                className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                                data-testid="input-agent-nip05"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-300">
                                Website
                              </label>
                              <Input
                                placeholder="https://yoursite.com"
                                value={agentWebsiteInput}
                                onChange={(e) => setAgentWebsiteInput(e.target.value)}
                                className="h-9 border-white/15 bg-white/[0.07] text-sm text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 placeholder:text-slate-500 focus:border-brand-accent/60 focus:bg-white/[0.09] focus:ring-brand-accent/25"
                                data-testid="input-agent-website"
                              />
                            </div>
                          </div>
                        </div>

                        <Button
                          onClick={handleActivateAgent}
                          disabled={agentState.status === "activating"}
                          className="w-full gap-2 bg-gradient-to-r from-brand-accent to-brand-primary py-4 text-sm font-semibold text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-300 hover:from-brand-accent hover:to-brand-primary hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                          data-testid="button-activate-agent"
                        >
                          {agentState.status === "activating" ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Deploying...
                            </>
                          ) : (
                            <>
                              <AgentIcon className="h-4 w-4" /> Activate Assistant
                            </>
                          )}
                        </Button>

                        <StatusLevelBar currentLevel={-1} />
                      </div>
                    ) : (
                      <div className="space-y-6" data-testid="agent-live-view">
                        {agentState.banner && (
                          <div className="relative -mx-6 -mt-6 h-32 overflow-hidden rounded-t-2xl sm:-mx-8 sm:-mt-8 sm:h-40">
                            <img src={agentState.banner} alt="Banner" className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                          </div>
                        )}
                        <div
                          className={`flex flex-col items-start gap-6 sm:flex-row sm:items-center ${agentState.banner ? "relative z-10 -mt-12 px-2" : ""}`}
                        >
                          <div className="relative shrink-0">
                            <div
                              className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-brand-accent/[0.3] shadow-[0_0_40px_rgba(6,182,212,0.2)] ${agentState.picture ? "" : "bg-gradient-to-br from-brand-accent/20 to-emerald-500/20"}`}
                            >
                              {agentState.picture ? (
                                <img
                                  src={agentState.picture}
                                  alt={agentState.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <AgentIcon className="h-10 w-10 text-brand-accent" />
                              )}
                            </div>
                            <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950 bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                              <Activity className="h-3.5 w-3.5 text-white" />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <h2
                                className="text-2xl font-bold tracking-tight text-white"
                                style={{ fontFamily: "var(--font-display)" }}
                                data-testid="text-agent-name"
                              >
                                {agentState.name || "Unnamed Assistant"}
                              </h2>
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${statusConfig.bgClass} border ${statusConfig.borderClass}`}
                                data-testid="badge-agent-status"
                              >
                                <span className="relative flex h-1.5 w-1.5">
                                  <span
                                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusConfig.color.replace("text-", "bg-")}`}
                                  />
                                  <span
                                    className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusConfig.color.replace("text-", "bg-")}`}
                                  />
                                </span>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-widest ${statusConfig.color}`}
                                >
                                  {statusConfig.label}
                                </span>
                              </span>
                            </div>
                            {agentState.description && (
                              <p className="text-sm text-slate-400" data-testid="text-agent-desc">
                                {agentState.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              {agentState.activatedAt && (
                                <span className="flex items-center gap-1" data-testid="text-agent-activated-at">
                                  <Zap className="h-3 w-3 text-brand-accent" />
                                  Activated{" "}
                                  {new Date(agentState.activatedAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                              <span className="flex items-center gap-1" data-testid="text-agent-network-size">
                                <Users className="h-3 w-3 text-brand-link" />
                                {totalNetworkSize.toLocaleString()} in network
                              </span>
                              {nip85Activated && (
                                <span className="flex items-center gap-1" data-testid="text-agent-nip85">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                  NIP-85 Active
                                </span>
                              )}
                              {agentState.lud16 && (
                                <span className="flex items-center gap-1" data-testid="text-agent-lud16">
                                  <Zap className="h-3 w-3 text-amber-400" />
                                  {agentState.lud16}
                                </span>
                              )}
                              {agentState.nip05 && (
                                <span className="flex items-center gap-1" data-testid="text-agent-nip05">
                                  <CheckCircle2 className="h-3 w-3 text-brand-link" />
                                  {agentState.nip05}
                                </span>
                              )}
                              {agentState.website && /^https?:\/\//i.test(agentState.website) && (
                                <a
                                  href={agentState.website}
                                  target="_blank"
                                  rel="noopener"
                                  className="flex items-center gap-1 transition-colors hover:text-brand-accent"
                                  data-testid="link-agent-website"
                                >
                                  <Globe className="h-3 w-3 text-brand-accent" />
                                  {agentState.website.replace(/^https?:\/\//, "")}
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const editing = document.getElementById("agent-edit-section");
                                if (editing) editing.scrollIntoView({ behavior: "smooth" });
                              }}
                              className="gap-1.5 border-white/10 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                              data-testid="button-edit-agent"
                            >
                              <SettingsIcon className="h-3.5 w-3.5" /> Edit
                            </Button>
                          </div>
                        </div>

                        <StatusLevelBar currentLevel={statusConfig.level} />

                        <div className="flex flex-wrap gap-2 pt-2" data-testid="achievements-bar">
                          {ACHIEVEMENTS.map((achievement) => {
                            const earned = achievement.check(agentState);
                            const Icon = achievement.icon;
                            return (
                              <div
                                key={achievement.id}
                                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-300 ${earned ? "border-brand-accent/[0.3] bg-brand-accent/10 shadow-[0_0_8px_rgba(6,182,212,0.15)]" : "border-white/5 bg-white/[0.02]"}`}
                                title={achievement.description}
                                data-testid={`achievement-${achievement.id}`}
                              >
                                <Icon className={`h-3.5 w-3.5 ${earned ? "text-brand-accent" : "text-white/15"}`} />
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider ${earned ? "text-brand-accent" : "text-white/15"}`}
                                >
                                  {achievement.label}
                                </span>
                                {earned && <Check className="h-3 w-3 text-emerald-400" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {agentIsLive && (
            <div
              id="agent-edit-section"
              className="overflow-hidden rounded-2xl border border-brand-accent/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-accent/10 shadow-[0_0_15px_rgba(6,182,212,0.05)] backdrop-blur-xl dark:from-slate-900 dark:via-slate-900"
              data-testid="card-agent-edit"
            >
              <div className="h-1 w-full bg-gradient-to-r from-brand-accent via-brand-primary to-brand-accent" />
              <div className="from-brand-accent/8 border-b border-brand-accent/10 bg-gradient-to-b to-white/60 px-5 py-4 dark:to-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                    <AgentIcon className="h-4 w-4 text-brand-accent" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-edit-title"
                    >
                      Customize Assistant
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Update your assistant's profile and connections
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-accent">Identity</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Assistant Name
                      </label>
                      <Input
                        value={agentNameInput}
                        onChange={(e) => setAgentNameInput(e.target.value)}
                        className="text-sm"
                        data-testid="input-edit-agent-name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Bio
                      </label>
                      <Input
                        value={agentDescInput}
                        onChange={(e) => setAgentDescInput(e.target.value)}
                        className="text-sm"
                        data-testid="input-edit-agent-desc"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="shrink-0">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Avatar
                    </label>
                    <ImageUpload
                      value={agentPictureInput}
                      onChange={setAgentPictureInput}
                      onRemove={() => setAgentPictureInput("")}
                      aspect="square"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Banner
                    </label>
                    <ImageUpload
                      value={agentBannerInput}
                      onChange={setAgentBannerInput}
                      onRemove={() => setAgentBannerInput("")}
                      aspect="banner"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Lightning
                    </label>
                    <Input
                      value={agentLud16Input}
                      onChange={(e) => setAgentLud16Input(e.target.value)}
                      placeholder="you@getalby.com"
                      className="text-sm"
                      data-testid="input-edit-agent-lud16"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      NIP-05
                    </label>
                    <Input
                      value={agentNip05Input}
                      onChange={(e) => setAgentNip05Input(e.target.value)}
                      placeholder="you@nostr.com"
                      className="text-sm"
                      data-testid="input-edit-agent-nip05"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Website
                    </label>
                    <Input
                      value={agentWebsiteInput}
                      onChange={(e) => setAgentWebsiteInput(e.target.value)}
                      placeholder="https://yoursite.com"
                      className="text-sm"
                      data-testid="input-edit-agent-website"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleUpdateAgent}
                  className="gap-1.5 bg-brand-accent text-white hover:bg-brand-accent"
                  data-testid="button-save-agent"
                >
                  <Check className="h-3.5 w-3.5" /> Save Changes
                </Button>
              </div>
            </div>
          )}

          <div
            className="rounded-2xl border border-brand-accent/[0.3] bg-gradient-to-r from-slate-950 via-brand-primary to-slate-950 p-4 shadow-lg sm:p-5"
            data-testid="section-account-overview"
          >
            {selfLoading ? (
              <div className="flex animate-pulse gap-4">
                <div className="h-4 w-24 rounded bg-white/10" />
                <div className="h-4 w-32 rounded bg-white/10" />
                <div className="h-4 w-20 rounded bg-white/10" />
              </div>
            ) : (
              <>
                <div className="hidden flex-wrap items-center gap-x-6 gap-y-3 sm:flex">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">Pubkey</span>
                    <button
                      className="flex items-center gap-1 font-mono text-xs text-white/80 transition-colors hover:text-white"
                      onClick={() => {
                        copyToClipboard(user.npub);
                        toast({ title: "Copied!", description: "npub copied to clipboard" });
                      }}
                      data-testid="button-overview-copy-npub"
                    >
                      {truncatedNpub}
                      <Copy className="h-3 w-3 text-brand-link" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2" data-testid="nip85-inline-status">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">NIP-85</span>
                    {nip85Activated ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5"
                        data-testid="badge-nip85-active"
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Active</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/20 px-2 py-0.5"
                        data-testid="badge-nip85-inactive"
                      >
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inactive</span>
                      </span>
                    )}
                    {nip85Activated && (
                      <span className="text-[10px] text-slate-500">
                        Brainstorm · <span className="font-mono text-white/50">10040</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">Network</span>
                    <span className="text-xs font-bold text-white" data-testid="text-overview-network-size">
                      {totalNetworkSize.toLocaleString()} users
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                      Last Calc
                    </span>
                    <span className="text-xs text-white/70" data-testid="text-overview-last-calc">
                      {formatRelativeTime(lastCalculated)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/settings")}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand-accent/[0.3] bg-brand-accent/10 px-2.5 py-1 text-[10px] font-semibold text-brand-accent transition-all hover:bg-brand-accent/20 hover:text-brand-accent"
                    data-testid="link-nip85-settings"
                  >
                    <SettingsIcon className="h-3 w-3" /> Manage
                  </button>
                </div>
                <div className="space-y-3 sm:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                        Pubkey
                      </span>
                      <button
                        className="flex items-center gap-1 truncate font-mono text-xs text-white/80 transition-colors hover:text-white"
                        onClick={() => {
                          copyToClipboard(user.npub);
                          toast({ title: "Copied!", description: "npub copied to clipboard" });
                        }}
                        data-testid="button-overview-copy-npub-mobile"
                      >
                        {truncatedNpub}
                        <Copy className="h-3 w-3 shrink-0 text-brand-link" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate("/settings")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-accent/[0.3] bg-brand-accent/10 px-2.5 py-1 text-[10px] font-semibold text-brand-accent transition-all hover:bg-brand-accent/20 hover:text-brand-accent"
                      data-testid="link-nip85-settings-mobile"
                    >
                      <SettingsIcon className="h-3 w-3" /> Manage
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2" data-testid="nip85-inline-status-mobile">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                        NIP-85
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {nip85Activated ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                              Active
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/20 px-2 py-0.5">
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              Inactive
                            </span>
                          </span>
                        )}
                        {nip85Activated && (
                          <span className="text-[10px] text-slate-500">
                            Brainstorm · <span className="font-mono text-white/50">10040</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                        Network
                      </span>
                      <span className="text-xs font-bold text-white">{totalNetworkSize.toLocaleString()} users</span>
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                        Last Calc
                      </span>
                      <span className="text-xs text-white/70">{formatRelativeTime(lastCalculated)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div
              className="group relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(52,211,153,0.05)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-[0_20px_40px_-12px_rgba(52,211,153,0.15)] dark:from-slate-900 dark:via-slate-900"
              data-testid="card-invite-users"
            >
              <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />
              <div className="border-b border-emerald-500/10 bg-gradient-to-b from-emerald-500/10 to-white/60 px-5 py-4 dark:to-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-invite-title"
                    >
                      Invite & Add Users
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Grow your network</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Invite Link
                  </label>
                  <div className="flex gap-2">
                    <div
                      className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      data-testid="text-invite-link"
                    >
                      {window.location.origin}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyInviteLink}
                      className="shrink-0 gap-1.5"
                      data-testid="button-copy-invite-link"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Add by npub
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="npub1... or hex pubkey"
                      value={npubInput}
                      onChange={(e) => setNpubInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLookupNpub()}
                      className="text-sm"
                      data-testid="input-add-npub"
                    />
                    <Button
                      size="sm"
                      onClick={handleLookupNpub}
                      disabled={lookupLoading}
                      className="shrink-0 gap-1.5 bg-brand-deep text-white hover:bg-[#292873]"
                      data-testid="button-add-npub"
                    >
                      {lookupLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}{" "}
                      Look Up
                    </Button>
                  </div>
                  {lookedUpUser && (
                    <div
                      className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center"
                      data-testid="card-looked-up-user"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0 border border-slate-100 dark:border-slate-800/60">
                          {lookedUpUser.picture ? (
                            <AvatarImage
                              src={lookedUpUser.picture}
                              alt={lookedUpUser.displayName || "User"}
                              className="object-cover"
                            />
                          ) : null}
                          <AvatarFallback className="bg-brand-primary/10 text-xs font-bold text-brand-primary">
                            {(lookedUpUser.displayName?.charAt(0) || "?").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                            data-testid="text-looked-up-name"
                          >
                            {lookedUpUser.displayName || lookedUpUser.npub.slice(0, 16) + "..."}
                          </p>
                          <p className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                            {lookedUpUser.npub.slice(0, 20)}...
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5 sm:ml-auto">
                        {!socialActions.isSelf(lookedUpUser.pubkey) &&
                          !socialActions.isFollowing(lookedUpUser.pubkey) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleFollowLookedUp}
                              disabled={socialActions.isPending("follow", lookedUpUser.pubkey)}
                              className="gap-1 text-xs"
                              data-testid="button-follow-looked-up"
                            >
                              <UserPlus className="h-3 w-3" /> Follow
                            </Button>
                          )}
                        {socialActions.isFollowing(lookedUpUser.pubkey) && (
                          <Badge
                            className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                            data-testid="badge-already-following"
                          >
                            Following
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/p/${lookedUpUser.npub}`)}
                          className="gap-1 text-xs"
                          data-testid="button-view-profile-looked-up"
                        >
                          <ExternalLink className="h-3 w-3" /> Profile
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="group relative overflow-hidden rounded-2xl border border-brand-primary/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(168,85,247,0.05)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-brand-primary/[0.3] hover:shadow-[0_20px_40px_-12px_rgba(168,85,247,0.15)] dark:from-slate-900 dark:via-slate-900"
              data-testid="card-ta-history"
            >
              <div className="h-1 w-full bg-gradient-to-r from-brand-primary via-fuchsia-500 to-brand-primary" />
              <div className="border-b border-brand-primary/10 bg-gradient-to-b from-brand-primary/10 to-white/60 px-5 py-4 dark:to-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                    <Clock className="h-4 w-4 text-brand-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-ta-title"
                    >
                      Trust Attestation History
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Your published Trust Attestations</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {grapeRankLoading ? (
                  <div className="animate-pulse space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800" />
                    ))}
                  </div>
                ) : taHistory.length === 0 ? (
                  <div className="py-8 text-center" data-testid="empty-ta-history">
                    <Clock className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No attestations yet</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Your Trust Attestation history will appear here after your first calculation.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {taHistory.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800/60 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:gap-4"
                        data-testid={`row-ta-${idx}`}
                      >
                        <div className="flex min-w-0 items-center gap-2 sm:w-48">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            kind {entry.eventKind}
                          </Badge>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          {entry.relays.map((relay, ri) => (
                            <span
                              key={ri}
                              className="max-w-[200px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            >
                              {relay}
                            </span>
                          ))}
                        </div>
                        <div className="shrink-0">
                          {entry.status === "success" ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                              data-testid={`badge-ta-success-${idx}`}
                            >
                              <Check className="h-3 w-3" /> Success
                            </span>
                          ) : entry.status === "failure" ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
                              data-testid={`badge-ta-failure-${idx}`}
                            >
                              <X className="h-3 w-3" /> Failed
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                              data-testid={`badge-ta-pending-${idx}`}
                            >
                              <Loader2 className="h-3 w-3 animate-spin" /> Pending
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            className="overflow-hidden rounded-2xl border border-brand-accent/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(14,165,233,0.05)] backdrop-blur-xl dark:from-slate-900 dark:via-slate-900"
            data-testid="card-network-score-monitor"
          >
            <div className="h-1 w-full bg-gradient-to-r from-brand-accent via-brand-primary to-brand-accent" />
            <div className="border-b border-brand-accent/10 bg-gradient-to-b from-brand-accent/10 to-white/60 px-5 py-4 dark:to-slate-900/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                    <Eye className="h-4 w-4 text-brand-accent" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-nsm-title"
                    >
                      Network Score Monitor
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Scores for accounts you follow ({followingCount})
                    </p>
                  </div>
                </div>
                <Input
                  placeholder="Search by name or npub..."
                  value={scoreSearch}
                  onChange={(e) => setScoreSearch(e.target.value)}
                  className="h-8 w-full text-xs sm:w-56"
                  data-testid="input-score-search"
                />
              </div>
            </div>
            <div className="p-5">
              {selfLoading || grapeRankLoading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                      <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-2 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : followingCount === 0 ? (
                <div className="py-8 text-center" data-testid="empty-score-monitor">
                  <Users className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No followed accounts yet</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Follow users to see their scores here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[auto_1fr_100px_100px_40px] gap-3 border-b border-slate-100 px-3 pb-2 dark:border-slate-800/60 sm:grid">
                    <div className="w-8" />
                    <button
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      onClick={() => toggleSort("name")}
                      data-testid="sort-name"
                    >
                      Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <button
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      onClick={() => toggleSort("score")}
                      data-testid="sort-score"
                    >
                      Score <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <button
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      onClick={() => toggleSort("tier")}
                      data-testid="sort-tier"
                    >
                      Tier <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <span className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Trend
                    </span>
                  </div>
                  <div className="max-h-[400px] divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800">
                    {filteredAndSortedUsers.length === 0 ? (
                      <div className="py-6 text-center" data-testid="empty-score-search">
                        <p className="text-sm text-slate-400 dark:text-slate-500">No results match your search.</p>
                      </div>
                    ) : (
                      filteredAndSortedUsers.slice(0, 100).map((u) => {
                        const tierInfo = getTier(u.influence);
                        return (
                          <div
                            key={u.pubkey}
                            className="grid cursor-pointer grid-cols-1 gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/80 sm:grid-cols-[auto_1fr_100px_100px_40px] sm:gap-3"
                            onClick={() => navigate(`/p/${u.npub}`)}
                            data-testid={`row-score-${u.pubkey.slice(0, 8)}`}
                          >
                            <Avatar
                              className={`h-8 w-8 border border-slate-100 dark:border-slate-800/60 ${tierRing(u.influence) ?? ""}`}
                            >
                              {u.picture ? (
                                <AvatarImage src={u.picture} alt={u.displayName || "User"} className="object-cover" />
                              ) : null}
                              <AvatarFallback className="bg-brand-primary/10 text-xs font-bold text-brand-primary">
                                {(u.displayName?.charAt(0) || "?").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {u.displayName || u.npub.slice(0, 12) + "..."}
                              </p>
                              <p className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:hidden">
                                {u.npub.slice(0, 16)}...
                              </p>
                            </div>
                            <div className="flex items-center">
                              <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
                                {u.influence.toFixed(4)}
                              </span>
                            </div>
                            <div className="flex items-center">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tierInfo.badgeClass}`}
                              >
                                {tierInfo.name}
                              </span>
                            </div>
                            <div className="flex items-center justify-center">
                              <TrendIndicator current={u.influence} previous={previousScores.get(u.pubkey) ?? null} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {filteredAndSortedUsers.length > 100 && (
                    <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
                      Showing 100 of {filteredAndSortedUsers.length} results
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div
            className="overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(0,0,0,0.03)] backdrop-blur-xl dark:border-slate-800 dark:from-slate-900 dark:via-slate-900"
            data-testid="card-lists-scaffold"
          >
            <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
            <div className="border-b border-slate-200/50 bg-gradient-to-b from-slate-200/30 to-white/60 px-5 py-4 dark:border-slate-800 dark:from-slate-800/30 dark:to-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                  <List className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="min-w-0">
                  <h2
                    className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                    style={{ fontFamily: "var(--font-display)" }}
                    data-testid="text-lists-title"
                  >
                    DCoSL Lists
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Curated lists for decentralized content moderation
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="py-8 text-center" data-testid="scaffold-lists-coming-soon">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                  <List className="h-7 w-7 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">DCoSL Lists — Coming Soon</p>
                <p className="mx-auto mt-2 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Curated lists will let you create and manage decentralized content moderation lists, enabling
                  collaborative trust decisions across the Nostr network.
                </p>
                <Badge
                  variant="outline"
                  className="mt-4 border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                  Coming Soon
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <AlertDialog open={activateConfirmOpen} onOpenChange={setActivateConfirmOpen}>
        <AlertDialogContent
          className="w-[calc(100vw-2rem)] max-w-[460px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          data-testid="dialog-activate-confirm"
        >
          <div className="p-5 sm:p-6">
            <AlertDialogHeader className="space-y-0 text-left">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-accent">
                  Agent Suite
                </span>
                <div className="h-px w-10 bg-brand-accent/30" />
              </div>
              <AlertDialogTitle
                className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Deploy {agentNameInput.trim() || "Your Agent"}?
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                This will publish a kind 0 profile event to 5 Nostr relays, making your Brainstorm agent discoverable
                across the network.
              </AlertDialogDescription>

              <div className="mt-4 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Agent Name</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{agentNameInput.trim()}</span>
                </div>
                {agentDescInput.trim() && (
                  <div>
                    <span className="mb-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Description
                    </span>
                    <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {agentDescInput.trim()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Event</span>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-300">kind 0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Relays</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">5 relays</span>
                </div>
                <div className="border-t border-slate-200/80 pt-1.5 dark:border-slate-800">
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-accent/20 bg-gradient-to-r from-brand-accent/10 to-brand-primary/10 px-2.5 py-1"
                    data-testid="badge-certified-assistant"
                  >
                    <AgentIcon className="h-3 w-3 text-brand-accent" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">
                      Certified Brainstorm Assistant
                    </span>
                  </div>
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2">
              <AlertDialogCancel className="rounded-xl" data-testid="button-activate-cancel">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmActivation}
                className="gap-2 rounded-xl bg-gradient-to-r from-brand-accent to-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:opacity-90"
                data-testid="button-activate-confirm"
              >
                <AgentIcon className="h-4 w-4" /> Deploy Agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
