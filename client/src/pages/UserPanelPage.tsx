import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
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
  Menu,
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
  Award,
  Star,
  Rocket,
  Eye,
  Signal,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { ImageUpload } from "@/components/ImageUpload";
import { getCurrentUser, logout, fetchProfiles, isUsingBrainstorm, type NostrUser } from "@/services/nostr";
import { isAdminPubkey } from "@/config/adminAccess";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSocialActions } from "@/hooks/useSocialActions";

type SortField = "name" | "score" | "tier";
type SortDir = "asc" | "desc";
type AgentStatus = "dormant" | "activating" | "active" | "established" | "networked" | "trusted";

interface GraphEntry {
  pubkey: string;
  influence?: number;
}

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

const AGENT_STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; bgClass: string; borderClass: string; icon: React.ComponentType<{ className?: string }>; description: string; level: number }> = {
  dormant: { label: "Dormant", color: "text-slate-400", bgClass: "bg-slate-500/20", borderClass: "border-slate-500/30", icon: AgentIcon, description: "Your agent awaits activation", level: 0 },
  activating: { label: "Activating", color: "text-amber-400", bgClass: "bg-amber-500/20", borderClass: "border-amber-500/30", icon: Loader2, description: "Powering up...", level: 0 },
  active: { label: "Active", color: "text-emerald-400", bgClass: "bg-emerald-500/20", borderClass: "border-emerald-500/30", icon: Zap, description: "Published to the Nostr network", level: 1 },
  established: { label: "Established", color: "text-sky-400", bgClass: "bg-sky-500/20", borderClass: "border-sky-500/30", icon: Globe, description: "Discovered by multiple relays", level: 2 },
  networked: { label: "Networked", color: "text-purple-400", bgClass: "bg-purple-500/20", borderClass: "border-purple-500/30", icon: Signal, description: "Connected to the wider trust network", level: 3 },
  trusted: { label: "Trusted", color: "text-amber-300", bgClass: "bg-amber-400/20", borderClass: "border-amber-400/30", icon: Star, description: "Recognized and trusted across the ecosystem", level: 4 },
};

const ACHIEVEMENTS = [
  { id: "activated", label: "First Spark", description: "Activated your agent", icon: Zap, check: (a: AgentState) => a.status !== "dormant" && a.status !== "activating" },
  { id: "named", label: "Identity", description: "Named your agent", icon: AgentIcon, check: (a: AgentState) => !!a.name },
  { id: "published", label: "On the Grid", description: "Published to Nostr relays", icon: Globe, check: (a: AgentState) => !!a.publishedAt },
  { id: "described", label: "Story Told", description: "Added a description", icon: Sparkles, check: (a: AgentState) => !!a.description },
  { id: "portrait", label: "Portrait", description: "Added a profile picture", icon: Eye, check: (a: AgentState) => !!a.picture },
  { id: "lightning", label: "Lightning Rod", description: "Added a lightning address", icon: Zap, check: (a: AgentState) => !!a.lud16 },
  { id: "verified", label: "Verified", description: "Added NIP-05 identity", icon: Shield, check: (a: AgentState) => !!a.nip05 },
];

function getDefaultAgentState(): AgentState {
  try {
    const stored = localStorage.getItem("brainstorm_agent_state");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        name: parsed.name || "", description: parsed.description || "",
        picture: parsed.picture || "", banner: parsed.banner || "",
        lud16: parsed.lud16 || "", nip05: parsed.nip05 || "", website: parsed.website || "",
        status: parsed.status || "dormant", activatedAt: parsed.activatedAt || null, publishedAt: parsed.publishedAt || null,
      };
    }
  } catch {}
  return { name: "", description: "", picture: "", banner: "", lud16: "", nip05: "", website: "", status: "dormant", activatedAt: null, publishedAt: null };
}

function saveAgentState(state: AgentState) {
  try { localStorage.setItem("brainstorm_agent_state", JSON.stringify(state)); } catch {}
}

function getTier(influence: number): { name: string; color: string; badgeClass: string } {
  if (influence >= 0.8) return { name: "Highly Trusted", color: "text-emerald-600", badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700" };
  if (influence >= 0.5) return { name: "Trusted", color: "text-sky-600", badgeClass: "bg-sky-50 border-sky-200 text-sky-700" };
  if (influence >= 0.2) return { name: "Neutral", color: "text-indigo-600", badgeClass: "bg-indigo-50 border-indigo-200 text-indigo-700" };
  if (influence >= 0.05) return { name: "Low Trust", color: "text-amber-600", badgeClass: "bg-amber-50 border-amber-200 text-amber-700" };
  return { name: "Unverified", color: "text-slate-500", badgeClass: "bg-slate-50 border-slate-200 text-slate-500" };
}

function TrendIndicator({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <Minus className="h-3.5 w-3.5 text-slate-400" />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.001) return <Minus className="h-3.5 w-3.5 text-slate-400" />;
  if (diff > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
}

function StatusLevelBar({ currentLevel }: { currentLevel: number }) {
  const levels = ["Dormant", "Active", "Established", "Networked", "Trusted"];
  return (
    <div className="flex items-center gap-1 w-full" data-testid="agent-status-bar">
      {levels.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div className={`h-1.5 w-full rounded-full transition-all duration-700 ${i <= currentLevel ? "bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-white/10"}`} />
          <span className={`text-[8px] font-bold uppercase tracking-widest transition-colors ${i <= currentLevel ? "text-emerald-300" : "text-white/20"}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function UserPanelPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>(getDefaultAgentState);
  const [agentNameInput, setAgentNameInput] = useState(() => getDefaultAgentState().name);
  const [agentDescInput, setAgentDescInput] = useState(() => getDefaultAgentState().description);
  const [agentPictureInput, setAgentPictureInput] = useState(() => getDefaultAgentState().picture);
  const [agentBannerInput, setAgentBannerInput] = useState(() => getDefaultAgentState().banner);
  const [agentLud16Input, setAgentLud16Input] = useState(() => getDefaultAgentState().lud16);
  const [agentNip05Input, setAgentNip05Input] = useState(() => getDefaultAgentState().nip05);
  const [agentWebsiteInput, setAgentWebsiteInput] = useState(() => getDefaultAgentState().website);
  const [activateConfirmOpen, setActivateConfirmOpen] = useState(false);
  const [npubInput, setNpubInput] = useState("");
  const [lookedUpUser, setLookedUpUser] = useState<LookedUpUser | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [scoreSearch, setScoreSearch] = useState("");
  const [scoreSortField, setScoreSortField] = useState<SortField>("score");
  const [scoreSortDir, setScoreSortDir] = useState<SortDir>("desc");
  const [followedProfiles, setFollowedProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());
  const [previousScores, setPreviousScores] = useState<Map<string, number>>(() => {
    try {
      const stored = localStorage.getItem("brainstorm_previous_scores");
      if (stored) return new Map(JSON.parse(stored));
    } catch {}
    return new Map();
  });

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { navigate("/", { replace: true }); return; }
    setUser(u);
  }, [navigate]);

  const updateAgentState = useCallback((updates: Partial<AgentState>) => {
    setAgentState(prev => {
      const next = { ...prev, ...updates };
      saveAgentState(next);
      return next;
    });
  }, []);

  const { data: selfData, isLoading: selfLoading } = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: grapeRankData, isLoading: grapeRankLoading } = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const taPubkey = selfData?.data?.history?.ta_pubkey;
  const trustServiceProvider = useQuery({
    queryKey: ["trustServiceProvider", user?.pubkey, taPubkey],
    queryFn: async () => {
      if (!user?.pubkey || !taPubkey) return false;
      return await isUsingBrainstorm(user.pubkey, taPubkey);
    },
    enabled: !!user && !!taPubkey,
    retry: 2,
    staleTime: Infinity,
  });

  const nip85Activated = trustServiceProvider.data === true || localStorage.getItem("brainstorm_nip85_activated") === "true";
  const socialActions = useSocialActions(user?.pubkey);

  useEffect(() => {
    if (agentState.status === "dormant" || agentState.status === "activating") return;
    const network = selfData?.data?.graph;
    const followingCount = Array.isArray(network?.following) ? network.following.length : 0;
    const followersCount = Array.isArray(network?.followed_by) ? network.followed_by.length : 0;
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
  }, [selfData, grapeRankData, nip85Activated, agentState.status, agentState.publishedAt, updateAgentState]);

  const network = selfData?.data?.graph || null;
  const followingList = network?.following;
  const followingCount = Array.isArray(followingList) ? followingList.length : 0;
  const followersCount = Array.isArray(network?.followed_by) ? network.followed_by.length : 0;
  const totalNetworkSize = followingCount + followersCount;

  const grapeRank = grapeRankData?.data;
  const calcDone = grapeRank?.internal_publication_status?.toLowerCase() === "success" || localStorage.getItem("brainstorm_calc_completed") === "true";
  const lastCalculated = selfData?.data?.history?.last_time_calculated_graperank || grapeRankData?.data?.updated_at || null;

  const followedUsers = useMemo((): FollowedUser[] => {
    if (!followingList || !Array.isArray(followingList)) return [];
    return followingList.map((entry: string | GraphEntry) => {
      const pubkey = typeof entry === "string" ? entry : entry.pubkey;
      const influence = typeof entry === "object" ? (entry.influence ?? 0) : 0;
      let npub: string;
      try { npub = nip19.npubEncode(pubkey); } catch { npub = pubkey; }
      const tierInfo = getTier(influence);
      const profile = followedProfiles.get(pubkey);
      return { pubkey, npub, influence, displayName: profile?.name, picture: profile?.picture, tier: tierInfo.name, tierColor: tierInfo.badgeClass };
    });
  }, [followingList, followedProfiles]);

  useEffect(() => {
    if (followedUsers.length > 0) {
      const currentScores = new Map<string, number>();
      followedUsers.forEach(u => currentScores.set(u.pubkey, u.influence));
      try { localStorage.setItem("brainstorm_previous_scores", JSON.stringify(Array.from(currentScores.entries()))); } catch {}
    }
  }, [followedUsers]);

  useEffect(() => {
    if (!followingList || !Array.isArray(followingList) || followingList.length === 0) return;
    const pubkeys = followingList.map((e: string | GraphEntry) => typeof e === "string" ? e : e.pubkey).slice(0, 100);
    if (pubkeys.length === 0) return;
    fetchProfiles(pubkeys, (pubkey, profile) => {
      setFollowedProfiles(prev => {
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
      list = list.filter(u => (u.displayName && u.displayName.toLowerCase().includes(q)) || u.npub.toLowerCase().includes(q) || u.pubkey.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (scoreSortField === "score" || scoreSortField === "tier") { va = a.influence; vb = b.influence; }
      else { va = (a.displayName || a.npub).toLowerCase(); vb = (b.displayName || b.npub).toLowerCase(); }
      if (va < vb) return scoreSortDir === "asc" ? -1 : 1;
      if (va > vb) return scoreSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [followedUsers, scoreSearch, scoreSortField, scoreSortDir]);

  const taHistory = useMemo((): TaHistoryEntry[] => {
    const entries: TaHistoryEntry[] = [];
    if (grapeRank) {
      const createdAt = grapeRank.created_at ? new Date(grapeRank.created_at.endsWith?.("Z") ? grapeRank.created_at : grapeRank.created_at + "Z") : null;
      const updatedAt = grapeRank.updated_at ? new Date(grapeRank.updated_at.endsWith?.("Z") ? grapeRank.updated_at : grapeRank.updated_at + "Z") : null;
      const taStatus = grapeRank.ta_status;
      if (updatedAt && !isNaN(updatedAt.getTime())) {
        entries.push({ timestamp: updatedAt.getTime(), eventKind: 30382, relays: ["wss://nip85.nosfabrica.com"], status: taStatus?.toLowerCase() === "success" ? "success" : taStatus?.toLowerCase() === "failure" ? "failure" : "pending" });
      }
      if (createdAt && !isNaN(createdAt.getTime()) && createdAt.getTime() !== updatedAt?.getTime()) {
        entries.push({ timestamp: createdAt.getTime(), eventKind: 30382, relays: ["wss://nip85.nosfabrica.com"], status: "success" });
      }
    }
    const localHistory = localStorage.getItem("brainstorm_ta_history");
    if (localHistory) {
      try {
        const parsed = JSON.parse(localHistory);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (!entries.some(e => Math.abs(e.timestamp - entry.timestamp) < 60000)) entries.push(entry);
          }
        }
      } catch {}
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries;
  }, [grapeRank]);

  const getProfilePayload = useCallback(() => ({
    name: agentNameInput.trim(),
    about: agentDescInput.trim(),
    picture: agentPictureInput,
    banner: agentBannerInput,
    lud16: agentLud16Input.trim(),
    nip05: agentNip05Input.trim(),
    website: agentWebsiteInput.trim(),
  }), [agentNameInput, agentDescInput, agentPictureInput, agentBannerInput, agentLud16Input, agentNip05Input, agentWebsiteInput]);

  const getAgentStateUpdates = useCallback(() => ({
    name: agentNameInput.trim(),
    description: agentDescInput.trim(),
    picture: agentPictureInput,
    banner: agentBannerInput,
    lud16: agentLud16Input.trim(),
    nip05: agentNip05Input.trim(),
    website: agentWebsiteInput.trim(),
  }), [agentNameInput, agentDescInput, agentPictureInput, agentBannerInput, agentLud16Input, agentNip05Input, agentWebsiteInput]);

  const publishBrainstormProfile = useMutation({
    mutationFn: async () => await apiClient.publishBrainstormAssistantProfile(getProfilePayload()),
    onSuccess: () => {
      updateAgentState({ ...getAgentStateUpdates(), status: "active", publishedAt: Date.now() });
      toast({ title: "Sidekick deployed!", description: `${agentNameInput.trim() || "Your sidekick"} is now live on the Nostr network.` });
    },
    onError: (error: Error) => {
      if (error.message.includes("404") || error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        updateAgentState({ ...getAgentStateUpdates(), status: "active", activatedAt: Date.now() });
        toast({ title: "Sidekick activated locally", description: "Backend publishing will be available soon. Your sidekick is ready!" });
      } else {
        updateAgentState({ status: "dormant" });
        toast({ variant: "destructive", title: "Activation failed", description: error.message || "Something went wrong." });
      }
    },
  });

  const updateBrainstormProfile = useMutation({
    mutationFn: async () => await apiClient.publishBrainstormAssistantProfile(getProfilePayload()),
    onSuccess: () => {
      toast({ title: "Sidekick updated", description: "Profile published to the network." });
    },
    onError: (error: Error) => {
      if (error.message.includes("404") || error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        toast({ title: "Saved locally", description: "Backend publishing will sync when available." });
      } else {
        toast({ variant: "destructive", title: "Update failed", description: error.message || "Could not publish changes." });
      }
    },
  });

  const handleActivateAgent = () => {
    if (!agentNameInput.trim()) {
      toast({ variant: "destructive", title: "Name your sidekick", description: "Give your sidekick a name before activating." });
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
    } catch { return null; }
  };

  const handleLookupNpub = async () => {
    const pubkey = resolveNpubInput();
    if (!pubkey) {
      toast({ variant: "destructive", title: "Invalid input", description: "Please enter a valid npub or hex pubkey." });
      return;
    }
    setLookupLoading(true);
    setLookedUpUser(null);
    let npub: string;
    try { npub = nip19.npubEncode(pubkey); } catch { npub = pubkey; }
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
    if (result.success) {
      toast({ title: "Followed!", description: `You are now following ${lookedUpUser.displayName || lookedUpUser.npub.slice(0, 16) + "..."}` });
    } else {
      toast({ variant: "destructive", title: "Follow failed", description: result.error || "Something went wrong." });
    }
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    toast({ title: "Invite link copied!", description: "Share this link to grow the network." });
  };

  const handleLogout = () => { logout(); navigate("/"); };

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
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
    if (scoreSortField === field) setScoreSortDir(d => d === "asc" ? "desc" : "asc");
    else { setScoreSortField(field); setScoreSortDir("desc"); }
  };

  if (!user || isAuthRedirecting()) return null;

  const statusConfig = AGENT_STATUS_CONFIG[agentState.status];
  const agentIsLive = agentState.status !== "dormant" && agentState.status !== "activating";
  const earnedAchievements = ACHIEVEMENTS.filter(a => a.check(agentState));
  const truncatedNpub = user.npub.slice(0, 12) + "..." + user.npub.slice(-6);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-panel">
      <PageBackground />

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-panel">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="lg:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" data-testid="button-open-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </div>

              <button type="button" className="flex items-center gap-3 min-w-0 lg:hidden" onClick={() => navigate("/dashboard")} data-testid="button-panel-mobile-brand">
                <div className="h-9 w-9 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center shrink-0">
                  <BrainLogo size={20} className="text-indigo-200" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80">Brainstorm</p>
                  <p className="text-sm font-bold bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent" style={{ fontFamily: "var(--font-display)" }}>Agent Suite</p>
                </div>
              </button>

              <button type="button" className="hidden lg:flex items-center gap-2" onClick={() => navigate("/dashboard")} data-testid="button-desktop-brand">
                <BrainLogo size={28} className="text-indigo-500" />
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">Brainstorm</span>
              </button>

              <div className="hidden lg:flex gap-1" data-testid="nav-panel-tabs">
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/dashboard")} data-testid="button-nav-dashboard">
                  <Home className="h-4 w-4" /> Dashboard
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/search")} data-testid="button-nav-search">
                  <Search className="h-4 w-4" /> Search
                </Button>
                <Button variant="ghost" size="sm" className={`gap-2 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200 ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/[0.06]" : "text-slate-600 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} data-testid="button-nav-network">
                  <Users className="h-4 w-4" /> Network
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-white bg-white/10 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200" data-testid="button-nav-panel">
                  <AgentIcon className="h-4 w-4" /> <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Agent Suite</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-panel-profile-menu">
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-panel-avatar">
                      {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2">
                      <span className="text-sm font-bold text-white leading-none mb-0.5" data-testid="text-panel-profile-name">{user.displayName || "Anon"}</span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none" data-testid="text-panel-profile-npub">{user.npub.slice(0, 8)}...</span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anon"}</p>
                      <button className="flex items-center gap-1 text-xs leading-none text-slate-500 hover:text-indigo-600 transition-colors" onClick={() => { navigator.clipboard.writeText(user.npub); toast({ title: "Copied!", description: "npub copied to clipboard" }); }} data-testid="button-copy-npub">
                        <span>{user.npub.slice(0, 16)}...</span>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                    <HelpCircle className="mr-2 h-4 w-4" /> <span>FAQ</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                    <SettingsIcon className="mr-2 h-4 w-4" /> <span>Settings</span>
                  </DropdownMenuItem>
                  {isAdminPubkey(user?.pubkey) && (
                    <DropdownMenuItem className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800" onClick={() => navigate("/admin")} data-testid="dropdown-admin">
                      <Shield className="mr-2 h-4 w-4" /> <span>Admin Dashboard</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="dropdown-signout">
                    <LogOut className="mr-2 h-4 w-4" /> <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} currentPath={location} navigate={navigate} calcDone={calcDone} user={user} onLogout={handleLogout} isAdmin={isAdminPubkey(user?.pubkey)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <div className="space-y-6 animate-fade-up" data-testid="container-panel">

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-panel-header">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-cyan-500/20 shadow-sm backdrop-blur-sm w-fit">
                <div className="w-1 h-1 rounded-full bg-cyan-500 shadow-[0_0_4px_#06b6d4]" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-cyan-800 uppercase">Your Sidekick on Nostr</p>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-panel-title">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 via-indigo-500 to-purple-600 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Agent Suite
                </span>
              </h1>
              <p className="text-slate-600 font-medium" data-testid="text-panel-subtitle">
                Build your trust sidekick — grow together, earn trust together.
              </p>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.08)]" data-testid="card-agent-hero">
            <div className="bg-gradient-to-br from-slate-950 via-[#0c1929] to-slate-950 relative">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.12),transparent_60%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(124,134,255,0.08),transparent_60%)]" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              <div className="relative p-6 sm:p-8">
                {!agentIsLive ? (
                  <div className="max-w-2xl mx-auto space-y-6" data-testid="agent-activation-flow">
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center mb-2">
                        <div className="relative">
                          <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.15)]">
                            {agentPictureInput ? (
                              <img src={agentPictureInput} alt="Agent" className="h-full w-full rounded-3xl object-cover" />
                            ) : (
                              <AgentIcon className="h-10 w-10 text-cyan-400" />
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-slate-800 border-2 border-cyan-500/40 flex items-center justify-center">
                            <Sparkles className="h-3 w-3 text-cyan-400" />
                          </div>
                        </div>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-activate-title">
                        Create Your Sidekick
                      </h2>
                      <p className="text-sm text-slate-400 max-w-md mx-auto">
                        Your sidekick represents you on the Nostr trust network. It grows with you — the more you engage, the stronger it becomes.
                      </p>
                    </div>

                    <div className="max-w-lg mx-auto space-y-5">
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/50">Identity</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">Name your sidekick *</label>
                            <Input
                              placeholder="e.g. TrustBot, Guardian, Sentinel..."
                              value={agentNameInput}
                              onChange={e => setAgentNameInput(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                              data-testid="input-agent-name"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">Bio <span className="text-slate-500">(optional)</span></label>
                            <Input
                              placeholder="What makes your sidekick special?"
                              value={agentDescInput}
                              onChange={e => setAgentDescInput(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                              data-testid="input-agent-desc"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/50">Visuals</p>
                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">Profile picture</label>
                            <ImageUpload
                              value={agentPictureInput}
                              onChange={setAgentPictureInput}
                              onRemove={() => setAgentPictureInput("")}
                              aspect="square"
                            />
                          </div>
                          <div className="flex-1 w-full">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">Banner</label>
                            <ImageUpload
                              value={agentBannerInput}
                              onChange={setAgentBannerInput}
                              onRemove={() => setAgentBannerInput("")}
                              aspect="banner"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/50">Connections</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">Lightning address <span className="text-slate-500">(optional)</span></label>
                            <Input
                              placeholder="you@getalby.com"
                              value={agentLud16Input}
                              onChange={e => setAgentLud16Input(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                              data-testid="input-agent-lud16"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">NIP-05 <span className="text-slate-500">(optional)</span></label>
                            <Input
                              placeholder="you@nostr.com"
                              value={agentNip05Input}
                              onChange={e => setAgentNip05Input(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                              data-testid="input-agent-nip05"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/70 block text-left mb-1.5">Website <span className="text-slate-500">(optional)</span></label>
                            <Input
                              placeholder="https://yoursite.com"
                              value={agentWebsiteInput}
                              onChange={e => setAgentWebsiteInput(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
                              data-testid="input-agent-website"
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={handleActivateAgent}
                        disabled={agentState.status === "activating"}
                        className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold py-5 text-sm gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300"
                        data-testid="button-activate-agent"
                      >
                        {agentState.status === "activating" ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Deploying your sidekick...</>
                        ) : (
                          <><Rocket className="h-4 w-4" /> Activate Sidekick</>
                        )}
                      </Button>
                    </div>

                    <div className="pt-4">
                      <StatusLevelBar currentLevel={-1} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6" data-testid="agent-live-view">
                    {agentState.banner && (
                      <div className="relative -mx-6 sm:-mx-8 -mt-6 sm:-mt-8 h-32 sm:h-40 overflow-hidden rounded-t-2xl">
                        <img src={agentState.banner} alt="Banner" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                      </div>
                    )}
                    <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-6 ${agentState.banner ? "-mt-12 relative z-10 px-2" : ""}`}>
                      <div className="relative shrink-0">
                        <div className={`h-20 w-20 rounded-3xl overflow-hidden border border-cyan-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.2)] ${agentState.picture ? "" : "bg-gradient-to-br from-cyan-500/20 to-emerald-500/20"}`}>
                          {agentState.picture ? (
                            <img src={agentState.picture} alt={agentState.name} className="h-full w-full object-cover" />
                          ) : (
                            <AgentIcon className="h-10 w-10 text-cyan-300" />
                          )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                          <Activity className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-agent-name">
                            {agentState.name || "Unnamed Sidekick"}
                          </h2>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusConfig.bgClass} border ${statusConfig.borderClass}`} data-testid="badge-agent-status">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusConfig.color.replace("text-", "bg-")}`} />
                              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${statusConfig.color.replace("text-", "bg-")}`} />
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${statusConfig.color}`}>{statusConfig.label}</span>
                          </span>
                        </div>
                        {agentState.description && (
                          <p className="text-sm text-slate-400" data-testid="text-agent-desc">{agentState.description}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                          {agentState.activatedAt && (
                            <span className="flex items-center gap-1" data-testid="text-agent-activated-at">
                              <Zap className="h-3 w-3 text-cyan-500" />
                              Activated {new Date(agentState.activatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <span className="flex items-center gap-1" data-testid="text-agent-network-size">
                            <Users className="h-3 w-3 text-indigo-400" />
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
                              <CheckCircle2 className="h-3 w-3 text-purple-400" />
                              {agentState.nip05}
                            </span>
                          )}
                          {agentState.website && /^https?:\/\//i.test(agentState.website) && (
                            <a href={agentState.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-cyan-400 transition-colors" data-testid="link-agent-website">
                              <Globe className="h-3 w-3 text-cyan-400" />
                              {agentState.website.replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const editing = document.getElementById("agent-edit-section");
                            if (editing) editing.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5 gap-1.5 text-xs"
                          data-testid="button-edit-agent"
                        >
                          <SettingsIcon className="h-3.5 w-3.5" /> Edit
                        </Button>
                      </div>
                    </div>

                    <StatusLevelBar currentLevel={statusConfig.level} />

                    <div className="flex flex-wrap gap-2 pt-2" data-testid="achievements-bar">
                      {ACHIEVEMENTS.map(achievement => {
                        const earned = achievement.check(agentState);
                        const Icon = achievement.icon;
                        return (
                          <div
                            key={achievement.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${earned ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_8px_rgba(6,182,212,0.15)]" : "bg-white/[0.02] border-white/5"}`}
                            title={achievement.description}
                            data-testid={`achievement-${achievement.id}`}
                          >
                            <Icon className={`h-3.5 w-3.5 ${earned ? "text-cyan-400" : "text-white/15"}`} />
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${earned ? "text-cyan-300" : "text-white/15"}`}>{achievement.label}</span>
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

          {agentIsLive && (
            <div id="agent-edit-section" className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-cyan-50/40 backdrop-blur-xl border border-cyan-500/15 shadow-[0_0_15px_rgba(6,182,212,0.05)] overflow-hidden" data-testid="card-agent-edit">
              <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-cyan-400" />
              <div className="bg-gradient-to-b from-cyan-500/8 to-white/60 border-b border-cyan-500/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <AgentIcon className="h-4 w-4 text-cyan-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-edit-title">Customize Sidekick</h2>
                    <p className="text-xs text-slate-500">Update your sidekick's profile and connections</p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600/60 mb-3">Identity</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Sidekick Name</label>
                      <Input value={agentNameInput} onChange={e => setAgentNameInput(e.target.value)} className="text-sm" data-testid="input-edit-agent-name" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Bio</label>
                      <Input value={agentDescInput} onChange={e => setAgentDescInput(e.target.value)} className="text-sm" data-testid="input-edit-agent-desc" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600/60 mb-3">Visuals</p>
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Profile Picture</label>
                      <ImageUpload
                        value={agentPictureInput}
                        onChange={setAgentPictureInput}
                        onRemove={() => setAgentPictureInput("")}
                        aspect="square"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Banner</label>
                      <ImageUpload
                        value={agentBannerInput}
                        onChange={setAgentBannerInput}
                        onRemove={() => setAgentBannerInput("")}
                        aspect="banner"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600/60 mb-3">Connections</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Lightning Address</label>
                      <Input value={agentLud16Input} onChange={e => setAgentLud16Input(e.target.value)} placeholder="you@getalby.com" className="text-sm" data-testid="input-edit-agent-lud16" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">NIP-05</label>
                      <Input value={agentNip05Input} onChange={e => setAgentNip05Input(e.target.value)} placeholder="you@nostr.com" className="text-sm" data-testid="input-edit-agent-nip05" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Website</label>
                      <Input value={agentWebsiteInput} onChange={e => setAgentWebsiteInput(e.target.value)} placeholder="https://yoursite.com" className="text-sm" data-testid="input-edit-agent-website" />
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={handleUpdateAgent} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1.5" data-testid="button-save-agent">
                  <Check className="h-3.5 w-3.5" /> Save Changes
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 border border-[#7c86ff]/30 shadow-lg p-4 sm:p-5" data-testid="section-account-overview">
            {selfLoading ? (
              <div className="flex gap-4 animate-pulse">
                <div className="h-4 w-24 bg-white/10 rounded" />
                <div className="h-4 w-32 bg-white/10 rounded" />
                <div className="h-4 w-20 bg-white/10 rounded" />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wider">Pubkey</span>
                  <button className="flex items-center gap-1 text-xs font-mono text-white/80 hover:text-white transition-colors" onClick={() => { navigator.clipboard.writeText(user.npub); toast({ title: "Copied!", description: "npub copied to clipboard" }); }} data-testid="button-overview-copy-npub">
                    {truncatedNpub}
                    <Copy className="h-3 w-3 text-indigo-300/50" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wider">NIP-85</span>
                  {nip85Activated ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30" data-testid="badge-nip85-active">
                      <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Active</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/20 border border-slate-500/30" data-testid="badge-nip85-inactive">
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-slate-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inactive</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wider">Network</span>
                  <span className="text-xs font-bold text-white" data-testid="text-overview-network-size">{totalNetworkSize.toLocaleString()} users</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wider">Last Calc</span>
                  <span className="text-xs text-white/70" data-testid="text-overview-last-calc">{formatRelativeTime(lastCalculated)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-emerald-500/15 shadow-[0_0_15px_rgba(52,211,153,0.05)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(52,211,153,0.15)] hover:border-emerald-500/30 hover:-translate-y-1 transition-all duration-500 relative" data-testid="card-invite-users">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />
              <div className="bg-gradient-to-b from-emerald-500/10 to-white/60 border-b border-emerald-500/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-invite-title">Invite & Add Users</h2>
                    <p className="text-xs text-slate-500">Grow your Web of Trust network</p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Invite Link</label>
                  <div className="flex gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600 truncate" data-testid="text-invite-link">{window.location.origin}</div>
                    <Button size="sm" variant="outline" onClick={handleCopyInviteLink} className="gap-1.5 shrink-0" data-testid="button-copy-invite-link">
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Add by npub</label>
                  <div className="flex gap-2">
                    <Input placeholder="npub1... or hex pubkey" value={npubInput} onChange={e => setNpubInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLookupNpub()} className="text-sm" data-testid="input-add-npub" />
                    <Button size="sm" onClick={handleLookupNpub} disabled={lookupLoading} className="bg-[#333286] hover:bg-[#292873] text-white gap-1.5 shrink-0" data-testid="button-add-npub">
                      {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Look Up
                    </Button>
                  </div>
                  {lookedUpUser && (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200" data-testid="card-looked-up-user">
                      <Avatar className="h-9 w-9 border border-slate-100">
                        {lookedUpUser.picture ? <AvatarImage src={lookedUpUser.picture} alt={lookedUpUser.displayName || "User"} className="object-cover" /> : null}
                        <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">{(lookedUpUser.displayName?.charAt(0) || "?").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate" data-testid="text-looked-up-name">{lookedUpUser.displayName || lookedUpUser.npub.slice(0, 16) + "..."}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{lookedUpUser.npub.slice(0, 20)}...</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {!socialActions.isSelf(lookedUpUser.pubkey) && !socialActions.isFollowing(lookedUpUser.pubkey) && (
                          <Button size="sm" variant="outline" onClick={handleFollowLookedUp} disabled={socialActions.isPending("follow", lookedUpUser.pubkey)} className="gap-1 text-xs" data-testid="button-follow-looked-up">
                            <UserPlus className="h-3 w-3" /> Follow
                          </Button>
                        )}
                        {socialActions.isFollowing(lookedUpUser.pubkey) && (
                          <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 text-[10px]" data-testid="badge-already-following">Following</Badge>
                        )}
                        <Button size="sm" variant="outline" onClick={() => navigate(`/profile/${lookedUpUser.npub}`)} className="gap-1 text-xs" data-testid="button-view-profile-looked-up">
                          <ExternalLink className="h-3 w-3" /> Profile
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-purple-500/15 shadow-[0_0_15px_rgba(168,85,247,0.05)] overflow-hidden group hover:shadow-[0_20px_40px_-12px_rgba(168,85,247,0.15)] hover:border-purple-500/30 hover:-translate-y-1 transition-all duration-500 relative" data-testid="card-ta-history">
              <div className="h-1 w-full bg-gradient-to-r from-purple-400 via-fuchsia-500 to-purple-400" />
              <div className="bg-gradient-to-b from-purple-500/10 to-white/60 border-b border-purple-500/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-ta-title">Trust Attestation History</h2>
                    <p className="text-xs text-slate-500">Your published Trust Attestations</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {grapeRankLoading ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg" />)}
                  </div>
                ) : taHistory.length === 0 ? (
                  <div className="text-center py-8" data-testid="empty-ta-history">
                    <Clock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">No attestations yet</p>
                    <p className="text-xs text-slate-400 mt-1">Your Trust Attestation history will appear here after your first calculation.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {taHistory.map((entry, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 py-2.5 rounded-lg bg-slate-50/80 border border-slate-100" data-testid={`row-ta-${idx}`}>
                        <div className="flex items-center gap-2 min-w-0 sm:w-48">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-600 font-medium">{formatTimestamp(entry.timestamp)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono">kind {entry.eventKind}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                          {entry.relays.map((relay, ri) => (
                            <span key={ri} className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[200px]">{relay}</span>
                          ))}
                        </div>
                        <div className="shrink-0">
                          {entry.status === "success" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700" data-testid={`badge-ta-success-${idx}`}>
                              <Check className="h-3 w-3" /> Success
                            </span>
                          ) : entry.status === "failure" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-700" data-testid={`badge-ta-failure-${idx}`}>
                              <X className="h-3 w-3" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700" data-testid={`badge-ta-pending-${idx}`}>
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

          <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-sky-500/15 shadow-[0_0_15px_rgba(14,165,233,0.05)] overflow-hidden" data-testid="card-network-score-monitor">
            <div className="h-1 w-full bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-400" />
            <div className="bg-gradient-to-b from-sky-500/10 to-white/60 border-b border-sky-500/10 px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                    <Eye className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-nsm-title">Network Score Monitor</h2>
                    <p className="text-xs text-slate-500">Trust scores for accounts you follow ({followingCount})</p>
                  </div>
                </div>
                <Input placeholder="Search by name or npub..." value={scoreSearch} onChange={e => setScoreSearch(e.target.value)} className="text-xs h-8 w-48 sm:w-56" data-testid="input-score-search" />
              </div>
            </div>
            <div className="p-5">
              {selfLoading || grapeRankLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                      <div className="h-8 w-8 rounded-full bg-slate-200" />
                      <div className="flex-1 space-y-2"><div className="h-3 w-32 bg-slate-200 rounded" /><div className="h-2 w-20 bg-slate-100 rounded" /></div>
                    </div>
                  ))}
                </div>
              ) : followingCount === 0 ? (
                <div className="text-center py-8" data-testid="empty-score-monitor">
                  <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">No followed accounts yet</p>
                  <p className="text-xs text-slate-400 mt-1">Follow users to see their trust scores here.</p>
                </div>
              ) : (
                <>
                  <div className="hidden sm:grid grid-cols-[auto_1fr_100px_100px_40px] gap-3 px-3 pb-2 border-b border-slate-100">
                    <div className="w-8" />
                    <button className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors" onClick={() => toggleSort("name")} data-testid="sort-name">
                      Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <button className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors" onClick={() => toggleSort("score")} data-testid="sort-score">
                      Score <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <button className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors" onClick={() => toggleSort("tier")} data-testid="sort-tier">
                      Tier <ArrowUpDown className="h-3 w-3" />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">Trend</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">
                    {filteredAndSortedUsers.length === 0 ? (
                      <div className="text-center py-6" data-testid="empty-score-search">
                        <p className="text-sm text-slate-400">No results match your search.</p>
                      </div>
                    ) : filteredAndSortedUsers.slice(0, 100).map(u => {
                      const tierInfo = getTier(u.influence);
                      return (
                        <div key={u.pubkey} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_100px_100px_40px] gap-2 sm:gap-3 px-3 py-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer rounded-lg" onClick={() => navigate(`/profile/${u.npub}`)} data-testid={`row-score-${u.pubkey.slice(0, 8)}`}>
                          <Avatar className="h-8 w-8 border border-slate-100">
                            {u.picture ? <AvatarImage src={u.picture} alt={u.displayName || "User"} className="object-cover" /> : null}
                            <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">{(u.displayName?.charAt(0) || "?").toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{u.displayName || u.npub.slice(0, 12) + "..."}</p>
                            <p className="text-[10px] text-slate-400 font-mono truncate sm:hidden">{u.npub.slice(0, 16)}...</p>
                          </div>
                          <div className="flex items-center"><span className="text-sm font-bold text-slate-800 tabular-nums">{u.influence.toFixed(4)}</span></div>
                          <div className="flex items-center"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierInfo.badgeClass}`}>{tierInfo.name}</span></div>
                          <div className="flex items-center justify-center"><TrendIndicator current={u.influence} previous={previousScores.get(u.pubkey) ?? null} /></div>
                        </div>
                      );
                    })}
                  </div>
                  {filteredAndSortedUsers.length > 100 && <p className="text-xs text-slate-400 text-center mt-3">Showing 100 of {filteredAndSortedUsers.length} results</p>}
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-slate-200/60 shadow-[0_0_15px_rgba(0,0,0,0.03)] overflow-hidden" data-testid="card-lists-scaffold">
            <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
            <div className="bg-gradient-to-b from-slate-200/30 to-white/60 border-b border-slate-200/50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <List className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-lists-title">DCoSL Lists</h2>
                  <p className="text-xs text-slate-500">Curated lists for decentralized content moderation</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="text-center py-8" data-testid="scaffold-lists-coming-soon">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                  <List className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-700">DCoSL Lists — Coming Soon</p>
                <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                  Curated lists will let you create and manage decentralized content moderation lists, enabling collaborative trust decisions across the Nostr network.
                </p>
                <Badge variant="outline" className="mt-4 text-slate-500 border-slate-300">Coming Soon</Badge>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <AlertDialog open={activateConfirmOpen} onOpenChange={setActivateConfirmOpen}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-[460px] rounded-2xl border border-cyan-500/20 bg-white/95 backdrop-blur-xl shadow-[0_0_30px_rgba(6,182,212,0.1)] p-0 overflow-hidden" data-testid="dialog-activate-confirm">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-cyan-400" />
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-cyan-500/10 to-transparent" />
          </div>
          <div className="relative p-5">
            <AlertDialogHeader className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/20 flex items-center justify-center shadow-[0_8px_20px_-10px_rgba(6,182,212,0.3)] shrink-0">
                  <Rocket className="h-5 w-5 text-cyan-600" />
                </div>
                <div className="min-w-0">
                  <AlertDialogTitle className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Deploy {agentNameInput.trim() || "Your Agent"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-slate-600 leading-relaxed mt-1">
                    This will publish a kind 0 profile event to 5 Nostr relays, making your Brainstorm agent discoverable across the network.
                  </AlertDialogDescription>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Agent Name</span>
                  <span className="text-xs font-bold text-slate-900">{agentNameInput.trim()}</span>
                </div>
                {agentDescInput.trim() && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Description</span>
                    <span className="text-xs text-slate-700 truncate max-w-[200px]">{agentDescInput.trim()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Event</span>
                  <span className="text-xs font-mono text-slate-600">kind 0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Relays</span>
                  <span className="text-xs text-slate-600">5 relays</span>
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2">
              <AlertDialogCancel className="rounded-xl" data-testid="button-activate-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmActivation} className="rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white gap-2" data-testid="button-activate-confirm">
                <Rocket className="h-4 w-4" /> Deploy Agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
