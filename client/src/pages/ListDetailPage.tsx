import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Home,
  Search as SearchIcon,
  Users,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  List,
  Loader2,
  ArrowLeft,
  Inbox,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Eye,
  Filter,
  HelpCircle,
} from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import {
  getCurrentUser,
  logout,
  fetchProfile,
  fetchOutboxRelayList,
  applyProfileToUser,
  updateCurrentUser,
  fetchDListHeaders,
  fetchDListItems,
  fetchDListReactions,
  fetchFollowList,
  fetchGrapeRankScores,
  type NostrUser,
  type DListHeader,
  type DListItem,
  type DListReaction,
} from "@/services/nostr";
import { apiClient } from "@/services/api";

type TrustMethod = "graperank" | "follow_list" | "trust_everyone";

const TRUST_METHOD_LABELS: Record<TrustMethod, string> = {
  trust_everyone: "Trust Everyone",
  follow_list: "Follow List",
  graperank: "GrapeRank",
};

const TRUST_METHOD_DESCS: Record<TrustMethod, string> = {
  trust_everyone: "All reactions weighted equally (weight = 1)",
  follow_list: "Only reactions from accounts you follow count",
  graperank: "Reactions weighted by GrapeRank trust scores",
};

type SortKey = "name" | "weighted_up" | "weighted_down" | "net_score";
type SortDir = "asc" | "desc";

interface ItemScore {
  rawUp: number;
  rawDown: number;
  weightedUp: number;
  weightedDown: number;
  netScore: number;
  upvoters: { pubkey: string; weight: number }[];
  downvoters: { pubkey: string; weight: number }[];
}

function computeItemScores(
  items: DListItem[],
  reactions: DListReaction[],
  weights: Map<string, number>,
  method: TrustMethod,
): Map<string, ItemScore> {
  const reactionsByItem = new Map<string, DListReaction[]>();
  for (const r of reactions) {
    const list = reactionsByItem.get(r.targetItemATag) || [];
    list.push(r);
    reactionsByItem.set(r.targetItemATag, list);
  }

  const scores = new Map<string, ItemScore>();
  for (const item of items) {
    const aTags = [item.aTag];
    if (item.id && item.id !== item.aTag) aTags.push(item.id);

    let rawUp = 0, rawDown = 0, weightedUp = 0, weightedDown = 0;
    const upvoters: { pubkey: string; weight: number }[] = [];
    const downvoters: { pubkey: string; weight: number }[] = [];
    const latestVote = new Map<string, DListReaction>();

    for (const aTag of aTags) {
      const itemReactions = reactionsByItem.get(aTag) || [];
      for (const r of itemReactions) {
        const existing = latestVote.get(r.pubkey);
        if (!existing || r.createdAt > existing.createdAt) {
          latestVote.set(r.pubkey, r);
        }
      }
    }

    for (const [pubkey, r] of latestVote) {
      const w = weights.get(pubkey) ?? 0;

      if (r.isUpvote) {
        rawUp++;
        weightedUp += w;
        upvoters.push({ pubkey, weight: w });
      } else {
        rawDown++;
        weightedDown += w;
        downvoters.push({ pubkey, weight: w });
      }
    }

    scores.set(item.aTag, {
      rawUp,
      rawDown,
      weightedUp,
      weightedDown,
      netScore: weightedUp - weightedDown,
      upvoters,
      downvoters,
    });
  }
  return scores;
}

function TrustRing({ score, size = 28 }: { score: number; size?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score * circumference);
  const ringColor = pct >= 50 ? "stroke-emerald-500" : pct >= 20 ? "stroke-indigo-500" : pct >= 7 ? "stroke-orange-300" : "stroke-amber-500";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
        <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3" strokeLinecap="round"
          className={ringColor} style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: "stroke-dashoffset 0.8s ease-out" }} />
      </svg>
      <span className="text-[9px] font-bold font-mono tabular-nums text-indigo-300">{pct}</span>
    </div>
  );
}

function VoterRow({ pubkey, weight, isUpvote }: { pubkey: string; weight: number; isUpvote: boolean }) {
  const [profile, setProfile] = useState<any>(null);
  const npub = useMemo(() => { try { return nip19.npubEncode(pubkey); } catch { return pubkey.slice(0, 16); } }, [pubkey]);
  const displayNpub = npub.slice(0, 12) + "..." + npub.slice(-6);

  useEffect(() => {
    let cancelled = false;
    fetchOutboxRelayList(pubkey).then(() => fetchProfile(pubkey)).then(p => {
      if (!cancelled && p) setProfile(p);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pubkey]);

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors" data-testid={`voter-${pubkey.slice(0, 8)}`}>
      <Avatar className="h-6 w-6 border border-white/10 shrink-0">
        {profile?.picture ? <AvatarImage src={profile.picture} className="object-cover" /> : null}
        <AvatarFallback className="bg-indigo-900/40 text-indigo-300 text-[10px] font-bold">
          {(profile?.display_name || profile?.name || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/80 truncate">{profile?.display_name || profile?.name || displayNpub}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isUpvote ? <ThumbsUp className="h-3 w-3 text-emerald-400" /> : <ThumbsDown className="h-3 w-3 text-red-400" />}
        <span className="text-[10px] font-mono tabular-nums text-slate-400">w={weight.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function ListDetailPage() {
  const [location, navigate] = useLocation();
  const [, params] = useRoute("/lists/:listId");
  let listId = "";
  try {
    listId = params?.listId ? decodeURIComponent(params.listId) : "";
  } catch {
    listId = params?.listId || "";
  }
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("net_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [trustMethod, setTrustMethod] = useState<TrustMethod>(() => {
    const saved = localStorage.getItem("brainstorm_trust_method");
    if (saved === "graperank" || saved === "follow_list" || saved === "trust_everyone") return saved;
    return "trust_everyone";
  });

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    setUser(u);
  }, [navigate]);

  const needsProfile = !!user && !user.displayName && !user.picture;
  useQuery({
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
    staleTime: Infinity,
  });

  const grapeRankQuery = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    retry: false,
  });

  const grapeRank = grapeRankQuery.data?.data;
  const calcDone = grapeRank ? typeof (grapeRank as any).internal_publication_status === "string" && (grapeRank as any).internal_publication_status.toLowerCase() === "success" : false;

  const headerQuery = useQuery({
    queryKey: ["dcosl-lists"],
    queryFn: () => fetchDListHeaders(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const listHeader = useMemo(() => {
    if (!headerQuery.data) return null;
    return headerQuery.data.find(h => h.aTag === listId) || null;
  }, [headerQuery.data, listId]);

  const itemsQuery = useQuery({
    queryKey: ["dcosl-items", listId],
    queryFn: () => fetchDListItems(listId),
    enabled: !!listId && !!user,
    staleTime: 5 * 60 * 1000,
  });

  const items = itemsQuery.data || [];

  const reactionsQuery = useQuery({
    queryKey: ["dcosl-reactions", listId, items.map(i => i.aTag).sort().join(",")],
    queryFn: () => {
      const aTags = items.flatMap(i => {
        const tags = [i.aTag];
        if (i.id && i.id !== i.aTag) tags.push(i.id);
        return tags;
      });
      return fetchDListReactions(aTags);
    },
    enabled: items.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const reactions = reactionsQuery.data || [];

  const allVoterPubkeys = useMemo(() => {
    const pks = new Set<string>();
    for (const r of reactions) pks.add(r.pubkey);
    return Array.from(pks);
  }, [reactions]);

  const followListQuery = useQuery({
    queryKey: ["follow-list", user?.pubkey],
    queryFn: () => fetchFollowList(user!.pubkey),
    enabled: !!user && trustMethod === "follow_list",
    staleTime: 10 * 60 * 1000,
  });

  const grapeRankScoresQuery = useQuery({
    queryKey: ["graperank-scores", user?.pubkey, allVoterPubkeys.sort().join(",")],
    queryFn: () => fetchGrapeRankScores(user!.pubkey, allVoterPubkeys),
    enabled: !!user && trustMethod === "graperank" && allVoterPubkeys.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const trustWeights = useMemo(() => {
    const weights = new Map<string, number>();
    if (trustMethod === "trust_everyone") {
      for (const pk of allVoterPubkeys) weights.set(pk, 1);
    } else if (trustMethod === "follow_list") {
      const follows = followListQuery.data || new Set<string>();
      for (const pk of allVoterPubkeys) weights.set(pk, follows.has(pk) ? 1 : 0);
    } else if (trustMethod === "graperank") {
      const scores = grapeRankScoresQuery.data || new Map<string, number>();
      for (const pk of allVoterPubkeys) weights.set(pk, scores.get(pk) ?? 0);
    }
    return weights;
  }, [trustMethod, allVoterPubkeys, followListQuery.data, grapeRankScoresQuery.data]);

  const itemScores = useMemo(
    () => computeItemScores(items, reactions, trustWeights, trustMethod),
    [items, reactions, trustWeights, trustMethod]
  );

  const filteredAndSorted = useMemo(() => {
    let filtered = items;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = items.filter(i =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.content || "").toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      const scoreA = itemScores.get(a.aTag);
      const scoreB = itemScores.get(b.aTag);
      let cmp = 0;
      if (sortKey === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      } else if (sortKey === "weighted_up") {
        cmp = (scoreA?.weightedUp ?? 0) - (scoreB?.weightedUp ?? 0);
      } else if (sortKey === "weighted_down") {
        cmp = (scoreA?.weightedDown ?? 0) - (scoreB?.weightedDown ?? 0);
      } else {
        cmp = (scoreA?.netScore ?? 0) - (scoreB?.netScore ?? 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [items, searchTerm, sortKey, sortDir, itemScores]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const handleMethodChange = useCallback((m: TrustMethod) => {
    setTrustMethod(m);
    localStorage.setItem("brainstorm_trust_method", m);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";
  const isLoadingWeights = (trustMethod === "follow_list" && followListQuery.isLoading) ||
    (trustMethod === "graperank" && grapeRankScoresQuery.isLoading);

  if (!user) return null;

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950 text-white">
      <PageBackground />

      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden text-slate-200 no-default-hover-elevate no-default-active-elevate" onClick={() => setMobileMenuOpen(true)} data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
            <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate("/dashboard")} data-testid="button-logo-home">
              <BrainLogo size={28} className="text-indigo-500" />
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-logo">
                Brainstorm
              </h1>
            </button>
            <div className="hidden lg:flex gap-1" data-testid="row-nav-links">
              <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/dashboard")} data-testid="button-nav-dashboard">
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/search")} data-testid="button-nav-search">
                <SearchIcon className="h-4 w-4" />
                Search
              </Button>
              <Button variant="ghost" size="sm" className={`gap-2 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200 ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/[0.06]" : "text-slate-600 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} title={!calcDone ? "Available after calculation completes" : undefined} data-testid="button-nav-network">
                <Users className="h-4 w-4" />
                Network
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-white bg-white/[0.12] rounded-md no-default-hover-elevate no-default-active-elevate" onClick={() => navigate("/lists")} data-testid="button-nav-lists">
                <List className="h-4 w-4" />
                Lists
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
                      {(user.displayName?.charAt(0) || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start mr-2">
                    <span className="text-sm font-bold text-white leading-none mb-0.5">{user.displayName || "Anon"}</span>
                    <span className="text-xs text-indigo-300 font-mono leading-none">{user.npub.slice(0, 8)}...</span>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-slate-200 shadow-xl">
                <DropdownMenuLabel className="text-xs text-slate-500 font-mono truncate">{truncatedNpub}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate(`/profile/${user.npub}`)} data-testid="menuitem-profile">
                  <Users className="h-4 w-4" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate("/settings")} data-testid="menuitem-settings">
                  <SettingsIcon className="h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-red-600" onClick={handleLogout} data-testid="menuitem-logout">
                  <LogOut className="h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentPath="/lists"
        navigate={navigate}
        calcDone={calcDone}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-slate-400 hover:text-white mb-4 no-default-hover-elevate no-default-active-elevate"
          onClick={() => navigate("/lists")}
          data-testid="button-back-to-lists"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lists
        </Button>

        {headerQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" data-testid="loading-list-detail">
            <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading list...</p>
          </div>
        ) : !listHeader ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="empty-list-detail">
            <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Inbox className="h-8 w-8 text-slate-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white mb-1">List not found</p>
              <p className="text-sm text-slate-400">This list may have been removed or the link is invalid.</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <List className="h-5 w-5 text-indigo-300" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-list-detail-title">
                    {listHeader.namePlural || listHeader.name}
                  </h2>
                  {listHeader.description && (
                    <p className="text-sm text-slate-400" data-testid="text-list-detail-desc">
                      {listHeader.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {itemsQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="loading-items">
                <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-400">Fetching list items...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="empty-items">
                <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Inbox className="h-6 w-6 text-slate-500" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-white mb-1">No items in this list</p>
                  <p className="text-sm text-slate-400">Items will appear here as they are added by the community.</p>
                </div>
              </div>
            ) : (
              <div data-testid="list-items">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm text-slate-400" data-testid="text-items-count">
                      {filteredAndSorted.length} of {items.length} {items.length === 1 ? "item" : "items"}
                    </p>
                    {reactionsQuery.isLoading && (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                        <span className="text-xs text-slate-500">Loading reactions...</span>
                      </div>
                    )}
                    {isLoadingWeights && (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                        <span className="text-xs text-slate-500">Loading trust weights...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56 sm:flex-none">
                      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search items..."
                        className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-lg"
                        data-testid="input-search-items"
                      />
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 bg-white/5 rounded-lg h-8 px-2.5 no-default-hover-elevate no-default-active-elevate" data-testid="button-trust-method">
                          <Eye className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{TRUST_METHOD_LABELS[trustMethod]}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64 bg-slate-900/95 backdrop-blur-xl border-white/10 shadow-xl">
                        <DropdownMenuLabel className="text-xs text-slate-400">Trust Weighting Method</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-white/10" />
                        {(["trust_everyone", "follow_list", "graperank"] as TrustMethod[]).map((m) => (
                          <DropdownMenuItem
                            key={m}
                            className={`cursor-pointer gap-2 text-xs ${trustMethod === m ? "text-indigo-300 bg-indigo-500/10" : "text-slate-300"}`}
                            onClick={() => handleMethodChange(m)}
                            data-testid={`menuitem-trust-${m}`}
                          >
                            <div className="flex-1">
                              <p className="font-medium">{TRUST_METHOD_LABELS[m]}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{TRUST_METHOD_DESCS[m]}</p>
                            </div>
                            {trustMethod === m && <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_80px_80px_90px] items-center px-4 py-2 border-b border-white/10 bg-white/[0.03]">
                    <button className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors text-left" onClick={() => handleSort("name")} data-testid="button-sort-name">
                      Item
                      {sortKey === "name" && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                    <button className="flex items-center justify-center gap-1 text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors" onClick={() => handleSort("weighted_up")} data-testid="button-sort-up">
                      <ThumbsUp className="h-3 w-3" />
                      {sortKey === "weighted_up" && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                    <button className="flex items-center justify-center gap-1 text-xs font-medium text-slate-400 hover:text-red-400 transition-colors" onClick={() => handleSort("weighted_down")} data-testid="button-sort-down">
                      <ThumbsDown className="h-3 w-3" />
                      {sortKey === "weighted_down" && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                    <button className="flex items-center justify-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-400 transition-colors" onClick={() => handleSort("net_score")} data-testid="button-sort-score">
                      Score
                      {sortKey === "net_score" && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                  </div>

                  {filteredAndSorted.map((item) => {
                    const score = itemScores.get(item.aTag);
                    const isExpanded = expandedItem === item.aTag;
                    const itemKey = item.dTag || item.id.slice(0, 8);
                    return (
                      <div key={item.aTag}>
                        <button
                          className="w-full grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_80px_80px_90px] items-center px-4 py-3 border-b border-white/5 hover:bg-white/[0.04] transition-colors text-left"
                          onClick={() => setExpandedItem(isExpanded ? null : item.aTag)}
                          data-testid={`row-item-${itemKey}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                              <span className="text-xs text-indigo-300 font-bold">
                                {(item.name || "?").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate" data-testid={`text-item-name-${itemKey}`}>
                                {item.name || item.content?.slice(0, 50) || "Unnamed item"}
                              </p>
                              {item.content && item.content !== item.name && (
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {item.content.slice(0, 60)}
                                </p>
                              )}
                            </div>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                          </div>

                          <div className="flex items-center justify-center">
                            <UITooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-mono tabular-nums text-emerald-400 cursor-help" data-testid={`text-upvotes-${itemKey}`}>
                                  {score ? (trustMethod === "trust_everyone" ? score.rawUp : score.weightedUp.toFixed(1)) : "0"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-slate-800 border-slate-700 text-slate-200 text-xs">
                                {score?.rawUp ?? 0} raw upvotes{trustMethod !== "trust_everyone" && `, ${(score?.weightedUp ?? 0).toFixed(2)} weighted`}
                              </TooltipContent>
                            </UITooltip>
                          </div>

                          <div className="flex items-center justify-center">
                            <UITooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-mono tabular-nums text-red-400 cursor-help" data-testid={`text-downvotes-${itemKey}`}>
                                  {score ? (trustMethod === "trust_everyone" ? score.rawDown : score.weightedDown.toFixed(1)) : "0"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-slate-800 border-slate-700 text-slate-200 text-xs">
                                {score?.rawDown ?? 0} raw downvotes{trustMethod !== "trust_everyone" && `, ${(score?.weightedDown ?? 0).toFixed(2)} weighted`}
                              </TooltipContent>
                            </UITooltip>
                          </div>

                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`text-sm font-bold font-mono tabular-nums ${(score?.netScore ?? 0) > 0 ? "text-emerald-400" : (score?.netScore ?? 0) < 0 ? "text-red-400" : "text-slate-500"}`} data-testid={`text-score-${itemKey}`}>
                              {score ? (score.netScore >= 0 ? "+" : "") + (trustMethod === "trust_everyone" ? score.netScore.toString() : score.netScore.toFixed(1)) : "0"}
                            </span>
                          </div>
                        </button>

                        {isExpanded && score && (
                          <div className="px-4 py-4 border-b border-white/10 bg-white/[0.02]" data-testid={`detail-panel-${itemKey}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <ThumbsUp className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-xs font-medium text-emerald-400">Upvotes ({score.upvoters.length})</span>
                                  {trustMethod !== "trust_everyone" && (
                                    <span className="text-[10px] text-slate-500 font-mono">weighted: {score.weightedUp.toFixed(2)}</span>
                                  )}
                                </div>
                                <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                                  {score.upvoters.length === 0 ? (
                                    <p className="text-xs text-slate-600 px-3 py-2">No upvotes yet</p>
                                  ) : (
                                    score.upvoters.map((v) => (
                                      <VoterRow key={v.pubkey} pubkey={v.pubkey} weight={v.weight} isUpvote={true} />
                                    ))
                                  )}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <ThumbsDown className="h-3.5 w-3.5 text-red-400" />
                                  <span className="text-xs font-medium text-red-400">Downvotes ({score.downvoters.length})</span>
                                  {trustMethod !== "trust_everyone" && (
                                    <span className="text-[10px] text-slate-500 font-mono">weighted: {score.weightedDown.toFixed(2)}</span>
                                  )}
                                </div>
                                <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                                  {score.downvoters.length === 0 ? (
                                    <p className="text-xs text-slate-600 px-3 py-2">No downvotes yet</p>
                                  ) : (
                                    score.downvoters.map((v) => (
                                      <VoterRow key={v.pubkey} pubkey={v.pubkey} weight={v.weight} isUpvote={false} />
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>

                            {item.jsonData && (
                              <div className="mt-4 pt-3 border-t border-white/5">
                                <p className="text-[10px] text-slate-500 font-medium mb-1.5">Properties</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(item.jsonData).map(([k, v]) => (
                                    <Badge key={k} variant="outline" className="text-[10px] border-white/10 text-slate-400 bg-white/[0.03] no-default-hover-elevate no-default-active-elevate">
                                      {k}: {String(v)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-indigo-400" />
                    <p className="text-sm font-semibold text-indigo-300">Trust Method: {TRUST_METHOD_LABELS[trustMethod]}</p>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {TRUST_METHOD_DESCS[trustMethod]}
                    {trustMethod === "trust_everyone" && " — Switch to Follow List or GrapeRank to weight reactions by your Web of Trust."}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <p className="text-[10px] text-slate-500">
                      {reactions.length} total reactions from {allVoterPubkeys.length} unique voters
                    </p>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-slate-600 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-slate-800 border-slate-700 text-slate-200 max-w-xs">
                        <p className="text-xs leading-relaxed">
                          Reactions are kind 7 Nostr events from the DCoSL relay. Each voter's reaction is weighted according to the selected trust method to produce the final scores.
                        </p>
                      </TooltipContent>
                    </UITooltip>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
