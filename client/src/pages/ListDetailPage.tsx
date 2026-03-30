import { useEffect, useState, useMemo, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Eye,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { TrustProvider, useTrust, type TrustMethod } from "@/contexts/TrustContext";
import {
  getCurrentUser,
  logout,
  fetchProfile,
  fetchProfiles,
  fetchOutboxRelayList,
  applyProfileToUser,
  updateCurrentUser,
  fetchDListHeaders,
  fetchDListItems,
  fetchDListReactions,
  fetchFollowList,
  fetchTrustedLists,
  fetchGrapeRankScores,
  type NostrUser,
  type DListHeader,
  type DListItem,
  type DListReaction,
  type TrustedListInfo,
  TAPESTRY_RELAY,
  DWARVES_ATAG_PREFIX,
  NOUS_DEMO_PUBKEY,
} from "@/services/nostr";
import { apiClient } from "@/services/api";

const TRUST_METHOD_LABELS: Record<TrustMethod, string> = {
  trust_everyone: "Trust Everyone",
  follow_list: "Follow List",
  trusted_list: "Trusted List",
  graperank: "Trusted Assertions (rank)",
};

const TRUST_METHOD_DESCS: Record<TrustMethod, string> = {
  trust_everyone: "All reactions weighted equally (weight = 1)",
  follow_list: "Only reactions from accounts you follow count",
  trusted_list: "Only reactions from your kind 30392 trusted list count",
  graperank: "Reactions weighted by GrapeRank trust scores (Trusted Assertions)",
};

type SortKey = "name" | "raw_up" | "raw_down" | "net_score";
type SortDir = "asc" | "desc";
type ScoreFilter = "all" | "has_votes" | "positive" | "negative";

interface VoterInfo {
  pubkey: string;
  weight: number;
  createdAt: number;
  content?: string;
}

interface ItemScore {
  rawUp: number;
  rawDown: number;
  weightedUp: number;
  weightedDown: number;
  netScore: number;
  upvoters: VoterInfo[];
  downvoters: VoterInfo[];
}

interface ProfileContent {
  display_name?: string;
  name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

function computeItemScores(
  items: DListItem[],
  reactions: DListReaction[],
  weights: Map<string, number>,
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
    const upvoters: VoterInfo[] = [];
    const downvoters: VoterInfo[] = [];
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
        upvoters.push({ pubkey, weight: w, createdAt: r.createdAt, content: r.content || undefined });
      } else {
        rawDown++;
        weightedDown += w;
        downvoters.push({ pubkey, weight: w, createdAt: r.createdAt, content: r.content || undefined });
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

function formatRelativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function extractPubkey(content: string, jsonData: Record<string, unknown> | null): string {
  if (jsonData && typeof jsonData.pubkey === "string") {
    const pk = jsonData.pubkey;
    if (/^[0-9a-f]{64}$/i.test(pk)) return pk.toLowerCase();
  }
  if (/^[0-9a-f]{64}$/.test(content)) return content;
  const hexMatch = content.match(/\b([0-9a-f]{64})\b/i);
  if (hexMatch) return hexMatch[1].toLowerCase();
  const npubMatch = content.match(/\b(npub1[02-9ac-hj-np-z]{20,})\b/i);
  if (npubMatch) {
    try {
      const decoded = nip19.decode(npubMatch[1]);
      if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
    } catch {}
  }
  return "";
}

function ScoreBreakdownRow({ pubkey, weight, isUpvote, createdAt, content, extraRelays, itemAuthorPubkey, prefetchedProfile, batchDone }: VoterInfo & { isUpvote: boolean; extraRelays?: string[]; itemAuthorPubkey?: string; prefetchedProfile?: ProfileContent | null; batchDone?: boolean }) {
  const [fetchedProfile, setFetchedProfile] = useState<ProfileContent | null>(null);
  const profile = prefetchedProfile || fetchedProfile;
  const npub = useMemo(() => { try { return nip19.npubEncode(pubkey); } catch { return pubkey.slice(0, 16); } }, [pubkey]);
  const displayNpub = npub.slice(0, 12) + "..." + npub.slice(-6);
  const contribution = isUpvote ? weight : -weight;
  const hasWeight = weight > 0;
  const relativeTime = useMemo(() => formatRelativeTime(createdAt), [createdAt]);

  useEffect(() => {
    if (prefetchedProfile || !batchDone) return;
    let cancelled = false;
    fetchOutboxRelayList(pubkey, 10000, extraRelays).then(() => fetchProfile(pubkey, 10000, extraRelays)).then(p => {
      if (!cancelled && p) setFetchedProfile(p as ProfileContent);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pubkey, extraRelays, prefetchedProfile, batchDone]);

  return (
    <div className="grid grid-cols-[1fr_40px_90px_100px_1fr] items-center px-3 py-1.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors" data-testid={`breakdown-${pubkey.slice(0, 8)}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="h-5 w-5 border border-slate-200 shrink-0">
          {profile?.picture ? <AvatarImage src={profile.picture} className="object-cover" /> : null}
          <AvatarFallback className="bg-indigo-50 text-indigo-700 text-[8px] font-bold">
            {(profile?.display_name || profile?.name || "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex flex-col">
          <span className="text-xs text-slate-700 truncate">{profile?.display_name || profile?.name || displayNpub}</span>
          <span className="text-[9px] text-slate-400">{relativeTime}</span>
        </div>
      </div>

      <div className="flex justify-center">
        {isUpvote ? <ThumbsUp className="h-3 w-3 text-emerald-500" /> : <ThumbsDown className="h-3 w-3 text-red-500" />}
      </div>

      <div className="text-center">
        <span className={`text-[11px] font-mono tabular-nums ${hasWeight ? "text-slate-700" : "text-slate-400"}`}>
          {hasWeight ? weight.toFixed(3) : "\u2014"}
        </span>
      </div>

      <div className="text-center">
        <span className={`text-[11px] font-mono tabular-nums font-medium ${!hasWeight ? "text-slate-400" : contribution > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {hasWeight ? (contribution > 0 ? "+" : "") + contribution.toFixed(3) : "\u2014"}
        </span>
      </div>

      <div className="min-w-0">
        {content ? (
          <span className="text-[10px] text-slate-600 truncate block" title={content} data-testid={`note-${pubkey.slice(0, 8)}`}>
            {content}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ItemProfileAvatar({ pubkey, extraRelays, prefetchedProfile, batchDone, fallbackImage, fallbackName }: { pubkey: string; extraRelays?: string[]; prefetchedProfile?: ProfileContent | null; batchDone?: boolean; fallbackImage?: string; fallbackName?: string }) {
  const [fetchedProfile, setFetchedProfile] = useState<ProfileContent | null>(null);
  const profile = prefetchedProfile || fetchedProfile;
  const avatarSrc = profile?.picture || fallbackImage || "";

  useEffect(() => {
    if (prefetchedProfile || !batchDone || !isPubkey(pubkey)) return;
    let cancelled = false;
    fetchOutboxRelayList(pubkey, 10000, extraRelays).then(() => fetchProfile(pubkey, 10000, extraRelays)).then(p => {
      if (!cancelled && p) setFetchedProfile(p as ProfileContent);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pubkey, extraRelays, prefetchedProfile, batchDone]);

  return (
    <Avatar className="h-8 w-8 border border-slate-200 shrink-0 rounded-xl" data-testid={`avatar-item-${pubkey.slice(0, 8)}`}>
      {avatarSrc ? <AvatarImage src={avatarSrc} className="object-cover" /> : null}
      <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold rounded-xl">
        {(profile?.display_name || profile?.name || fallbackName || "?").charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function AuthorBadge({ pubkey, extraRelays, prefetchedProfile, batchDone }: { pubkey: string; extraRelays?: string[]; prefetchedProfile?: ProfileContent | null; batchDone?: boolean }) {
  const [fetchedProfile, setFetchedProfile] = useState<ProfileContent | null>(null);
  const profile = prefetchedProfile || fetchedProfile;

  useEffect(() => {
    if (prefetchedProfile || !batchDone || !isPubkey(pubkey)) return;
    let cancelled = false;
    fetchOutboxRelayList(pubkey, 10000, extraRelays).then(() => fetchProfile(pubkey, 10000, extraRelays)).then(p => {
      if (!cancelled && p) setFetchedProfile(p as ProfileContent);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pubkey, extraRelays, prefetchedProfile, batchDone]);

  const displayName = profile?.display_name || profile?.name || pubkey.slice(0, 8) + "...";

  return (
    <div className="flex items-center gap-1.5 min-w-0" data-testid={`author-${pubkey.slice(0, 8)}`}>
      <Avatar className="h-5 w-5 border border-slate-200 shrink-0">
        {profile?.picture ? <AvatarImage src={profile.picture} className="object-cover" /> : null}
        <AvatarFallback className="bg-slate-100 text-slate-600 text-[8px] font-bold">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-[11px] text-slate-600 truncate">{displayName}</span>
    </div>
  );
}

function ListDetailContent() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/lists/:listId");
  let listId = "";
  try {
    listId = params?.listId ? decodeURIComponent(params.listId) : "";
  } catch {
    listId = params?.listId || "";
  }
  const isDwarves = listId.startsWith(DWARVES_ATAG_PREFIX);
  const extraRelays = useMemo(() => isDwarves ? [TAPESTRY_RELAY] : [], [isDwarves]);
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("net_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [povInput, setPovInput] = useState("");
  const [showPovInput, setShowPovInput] = useState(false);

  const { povPubkey, method: trustMethod, trustedListId, setPovPubkey, setMethod: setTrustMethod, setTrustedListId, resetToSelf } = useTrust();

  const [dwarvesPovOverride, setDwarvesPovOverride] = useState<string | null>(() =>
    isDwarves ? NOUS_DEMO_PUBKEY : null
  );

  useEffect(() => {
    if (isDwarves) {
      setDwarvesPovOverride(NOUS_DEMO_PUBKEY);
    }
    return () => { setDwarvesPovOverride(null); };
  }, [isDwarves]);

  useEffect(() => {
    setScoreFilter("all");
  }, [trustMethod]);

  const effectivePovPubkey = isDwarves ? (dwarvesPovOverride || povPubkey) : povPubkey;
  const isDemoPov = isDwarves && dwarvesPovOverride === NOUS_DEMO_PUBKEY;

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

  const [povProfile, setPovProfile] = useState<ProfileContent | null>(null);
  useEffect(() => {
    if (!effectivePovPubkey || !user) return;
    if (effectivePovPubkey === user.pubkey) {
      setPovProfile(null);
      return;
    }
    let cancelled = false;
    const relays = isDwarves ? [TAPESTRY_RELAY] : undefined;
    fetchOutboxRelayList(effectivePovPubkey, 10000, relays).then(() => fetchProfile(effectivePovPubkey, 10000, relays)).then(p => {
      if (!cancelled && p) setPovProfile(p as ProfileContent);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [effectivePovPubkey, user, isDwarves]);

  const grapeRankQuery = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    retry: false,
  });

  const grapeRank = grapeRankQuery.data?.data;
  const calcDone = grapeRank ? typeof (grapeRank as Record<string, unknown>).internal_publication_status === "string" && ((grapeRank as Record<string, unknown>).internal_publication_status as string).toLowerCase() === "success" : false;

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
    queryKey: ["dcosl-reactions", listId, [...items.flatMap(i => { const t = [i.aTag]; if (i.id && i.id !== i.aTag) t.push(i.id); return t; })].sort().join(",")],
    queryFn: () => {
      const aTags = items.flatMap(i => {
        const tags = [i.aTag];
        if (i.id && i.id !== i.aTag) tags.push(i.id);
        return tags;
      });
      return fetchDListReactions(aTags, 15000, false, listId);
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

  const [profilesMap, setProfilesMap] = useState<Record<string, ProfileContent>>({});
  const [batchProfilesDone, setBatchProfilesDone] = useState(false);

  const allPubkeysToFetch = useMemo(() => {
    const pks = new Set<string>();
    for (const item of items) {
      if (item.pubkey && isPubkey(item.pubkey)) pks.add(item.pubkey);
      const subjectPk = extractPubkey(item.content || "", item.jsonData) || (item.referencedPubkey && isPubkey(item.referencedPubkey) ? item.referencedPubkey : "");
      if (subjectPk && isPubkey(subjectPk)) pks.add(subjectPk);
    }
    for (const pk of allVoterPubkeys) {
      if (isPubkey(pk)) pks.add(pk);
    }
    return Array.from(pks);
  }, [items, allVoterPubkeys]);

  useEffect(() => {
    if (allPubkeysToFetch.length === 0) return;
    let cancelled = false;
    setProfilesMap({});
    setBatchProfilesDone(false);
    const batchRelays = isDwarves
      ? [...new Set([...["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"], TAPESTRY_RELAY])]
      : undefined;
    fetchProfiles(allPubkeysToFetch, (pubkey, profile) => {
      if (cancelled) return;
      setProfilesMap(prev => ({ ...prev, [pubkey]: profile }));
    }, batchRelays).catch(() => {}).finally(() => {
      if (!cancelled) setBatchProfilesDone(true);
    });
    return () => { cancelled = true; };
  }, [allPubkeysToFetch, isDwarves]);

  const followListQuery = useQuery({
    queryKey: ["follow-list", effectivePovPubkey],
    queryFn: async () => { await fetchOutboxRelayList(effectivePovPubkey); return fetchFollowList(effectivePovPubkey); },
    enabled: !!effectivePovPubkey && trustMethod === "follow_list",
    staleTime: 10 * 60 * 1000,
  });

  const trustedListsQuery = useQuery({
    queryKey: ["trusted-lists-available", effectivePovPubkey],
    queryFn: async () => { await fetchOutboxRelayList(effectivePovPubkey); return fetchTrustedLists(effectivePovPubkey); },
    enabled: !!effectivePovPubkey && trustMethod === "trusted_list",
    staleTime: 10 * 60 * 1000,
  });

  const dcoslTrustSourcesQuery = useQuery({
    queryKey: ["dcosl-trust-sources", listId],
    queryFn: async () => {
      const headers = await fetchDListHeaders(10000);
      const sources: { dTag: string; label: string; pubkeys: Set<string>; isDcosl: boolean }[] = [];
      const otherHeaders = headers.filter(h => h.aTag !== listId);
      const itemResults = await Promise.all(otherHeaders.map(h => fetchDListItems(h.aTag, 10000)));
      for (let i = 0; i < otherHeaders.length; i++) {
        const header = otherHeaders[i];
        const items = itemResults[i];
        const pubkeys = new Set<string>();
        for (const item of items) {
          if (item.jsonData && typeof (item.jsonData as Record<string, unknown>).pubkey === "string") {
            const pk = (item.jsonData as Record<string, unknown>).pubkey as string;
            if (/^[0-9a-f]{64}$/i.test(pk)) pubkeys.add(pk.toLowerCase());
          }
          const hexMatch = item.content.match(/\b([0-9a-f]{64})\b/i);
          if (hexMatch) pubkeys.add(hexMatch[1].toLowerCase());
          const npubMatch = item.content.match(/\b(npub1[02-9ac-hj-np-z]{20,})\b/i);
          if (npubMatch) {
            try {
              const decoded = nip19.decode(npubMatch[1]);
              if (decoded.type === "npub" && typeof decoded.data === "string") pubkeys.add(decoded.data);
            } catch {}
          }
        }
        if (pubkeys.size > 0) {
          sources.push({ dTag: `dcosl:${header.aTag}`, label: header.name, pubkeys, isDcosl: true });
        }
      }
      return sources;
    },
    enabled: trustMethod === "trusted_list",
    staleTime: 10 * 60 * 1000,
  });

  const availableTrustedLists = useMemo(() => {
    const kind30392 = (trustedListsQuery.data || []).map(tl => ({
      dTag: tl.dTag,
      label: tl.dTag,
      pubkeys: tl.pubkeys,
      isDcosl: false,
    }));
    const dcoslSources = dcoslTrustSourcesQuery.data || [];
    return [...kind30392, ...dcoslSources];
  }, [trustedListsQuery.data, dcoslTrustSourcesQuery.data]);

  useEffect(() => {
    if (trustMethod !== "trusted_list" || availableTrustedLists.length === 0) return;
    const validIds = availableTrustedLists.map(l => l.dTag);
    if (!trustedListId || !validIds.includes(trustedListId)) {
      setTrustedListId(validIds[0]);
    }
  }, [trustMethod, availableTrustedLists, trustedListId, setTrustedListId]);

  const selectedTrustedPubkeys = useMemo(() => {
    if (trustMethod !== "trusted_list" || availableTrustedLists.length === 0) return new Set<string>();
    if (trustedListId) {
      const match = availableTrustedLists.find(l => l.dTag === trustedListId);
      return match ? match.pubkeys : new Set<string>();
    }
    const all = new Set<string>();
    for (const list of availableTrustedLists) {
      for (const pk of list.pubkeys) all.add(pk);
    }
    return all;
  }, [trustMethod, availableTrustedLists, trustedListId]);

  const grapeRankScoresQuery = useQuery({
    queryKey: ["graperank-scores", effectivePovPubkey, [...allVoterPubkeys].sort().join(",")],
    queryFn: async () => { await fetchOutboxRelayList(effectivePovPubkey, 10000, extraRelays); return fetchGrapeRankScores(effectivePovPubkey, allVoterPubkeys, 15000, extraRelays); },
    enabled: !!effectivePovPubkey && trustMethod === "graperank" && allVoterPubkeys.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const trustWeights = useMemo(() => {
    const weights = new Map<string, number>();
    if (trustMethod === "trust_everyone") {
      for (const pk of allVoterPubkeys) weights.set(pk, 1);
    } else if (trustMethod === "follow_list") {
      const follows = followListQuery.data || new Set<string>();
      for (const pk of allVoterPubkeys) weights.set(pk, follows.has(pk) ? 1 : 0);
    } else if (trustMethod === "trusted_list") {
      for (const pk of allVoterPubkeys) weights.set(pk, selectedTrustedPubkeys.has(pk) ? 1 : 0);
    } else if (trustMethod === "graperank") {
      const scores = grapeRankScoresQuery.data || new Map<string, number>();
      for (const pk of allVoterPubkeys) weights.set(pk, scores.get(pk) ?? 0);
    }
    return weights;
  }, [trustMethod, allVoterPubkeys, followListQuery.data, selectedTrustedPubkeys, grapeRankScoresQuery.data]);

  const itemScores = useMemo(
    () => computeItemScores(items, reactions, trustWeights),
    [items, reactions, trustWeights]
  );

  const filterCounts = useMemo(() => {
    const counts = { all: items.length, has_votes: 0, positive: 0, negative: 0 };
    for (const item of items) {
      const score = itemScores.get(item.aTag);
      if (score && (score.rawUp + score.rawDown > 0)) counts.has_votes++;
      if (score && score.netScore > 0) counts.positive++;
      if (score && score.netScore < 0) counts.negative++;
    }
    return counts;
  }, [items, itemScores]);

  const filteredAndSorted = useMemo(() => {
    let filtered = items;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(i =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.content || "").toLowerCase().includes(q)
      );
    }
    if (scoreFilter !== "all") {
      filtered = filtered.filter(i => {
        const score = itemScores.get(i.aTag);
        if (scoreFilter === "has_votes") return score ? (score.rawUp + score.rawDown > 0) : false;
        if (scoreFilter === "positive") return score ? score.netScore > 0 : false;
        if (scoreFilter === "negative") return score ? score.netScore < 0 : false;
        return true;
      });
    }
    return [...filtered].sort((a, b) => {
      const scoreA = itemScores.get(a.aTag);
      const scoreB = itemScores.get(b.aTag);
      let cmp = 0;
      if (sortKey === "name") {
        cmp = (a.name || "").localeCompare(b.name || "");
      } else if (sortKey === "raw_up") {
        cmp = (scoreA?.weightedUp ?? 0) - (scoreB?.weightedUp ?? 0);
      } else if (sortKey === "raw_down") {
        cmp = (scoreA?.weightedDown ?? 0) - (scoreB?.weightedDown ?? 0);
      } else {
        cmp = (scoreA?.netScore ?? 0) - (scoreB?.netScore ?? 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [items, searchTerm, scoreFilter, sortKey, sortDir, itemScores]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const handlePovSwitch = useCallback(() => {
    const input = povInput.trim();
    if (!input) return;
    let pk = input;
    if (input.startsWith("npub")) {
      try {
        const decoded = nip19.decode(input);
        if (decoded.type === "npub") pk = decoded.data;
      } catch { return; }
    }
    if (!/^[0-9a-f]{64}$/.test(pk)) return;
    if (isDwarves) {
      setDwarvesPovOverride(pk);
    } else {
      setPovPubkey(pk);
    }
    setShowPovInput(false);
    setPovInput("");
  }, [povInput, setPovPubkey, isDwarves]);

  const handleResetPov = useCallback(() => {
    if (isDwarves) {
      setDwarvesPovOverride(user?.pubkey || null);
    } else {
      resetToSelf();
    }
    setPovProfile(null);
  }, [resetToSelf, isDwarves, user?.pubkey]);

  const handleResetToDemo = useCallback(() => {
    setDwarvesPovOverride(NOUS_DEMO_PUBKEY);
    setPovProfile(null);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";
  const isLoadingWeights = (trustMethod === "follow_list" && followListQuery.isLoading) ||
    (trustMethod === "trusted_list" && (trustedListsQuery.isLoading || dcoslTrustSourcesQuery.isLoading)) ||
    (trustMethod === "graperank" && grapeRankScoresQuery.isLoading);

  const isEffectivelySelf = effectivePovPubkey === user?.pubkey;

  const resolvedPovProfile = povProfile || profilesMap[effectivePovPubkey] || null;

  const povDisplayName = useMemo(() => {
    if (isDemoPov) return "Nous (demo)";
    if (isEffectivelySelf) return user?.displayName || "You";
    if (resolvedPovProfile?.display_name || resolvedPovProfile?.name) return resolvedPovProfile.display_name || resolvedPovProfile.name;
    try { return nip19.npubEncode(effectivePovPubkey).slice(0, 12) + "..."; } catch { return effectivePovPubkey.slice(0, 12) + "..."; }
  }, [isDemoPov, isEffectivelySelf, user, resolvedPovProfile, effectivePovPubkey]);

  if (!user) return null;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 overflow-hidden">
      <PageBackground />

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-list-detail">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="lg:hidden">
                <Button variant="ghost" size="icon" className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10" onClick={() => setMobileMenuOpen(true)} data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <button type="button" className="flex items-center gap-2" onClick={() => navigate("/dashboard")} data-testid="button-logo-home">
                <BrainLogo size={28} className="text-indigo-500" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }} data-testid="text-logo">
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
        </div>
      </nav>

      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentPath="/lists"
        navigate={navigate}
        calcDone={calcDone}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-slate-500 hover:text-slate-900 mb-4 no-default-hover-elevate no-default-active-elevate"
          onClick={() => navigate("/lists")}
          data-testid="button-back-to-lists"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lists
        </Button>

        {headerQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" data-testid="loading-list-detail">
            <div className="p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
              <Loader2 className="h-8 w-8 text-[#7c86ff] animate-spin" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Loading list...</p>
          </div>
        ) : !listHeader ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="empty-list-detail">
            <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
              <Inbox className="h-8 w-8 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900 mb-1" style={{ fontFamily: "var(--font-display)" }}>List not found</p>
              <p className="text-sm text-slate-500">This list may have been removed or the link is invalid.</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-8 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />
              <div className="flex flex-col items-start gap-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm" data-testid="pill-list-detail-kicker">
                  <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
                  <span className="text-xs font-bold tracking-[0.15em] text-indigo-900 uppercase">List Detail</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight relative" style={{ fontFamily: "var(--font-display)" }} data-testid="text-list-detail-title">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block">
                    {listHeader.namePlural || listHeader.name}
                  </span>
                </h2>
                {listHeader.description && (
                  <p className="text-slate-500 text-xs md:text-sm max-w-xl leading-relaxed font-light" data-testid="text-list-detail-desc">
                    {listHeader.description}
                  </p>
                )}
              </div>
            </div>

            {itemsQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="loading-items">
                <div className="p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                  <Loader2 className="h-6 w-6 text-[#7c86ff] animate-spin" />
                </div>
                <p className="text-sm text-slate-500 font-medium">Fetching list items...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="empty-items">
                <div className="p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <Inbox className="h-6 w-6 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-slate-900 mb-1" style={{ fontFamily: "var(--font-display)" }}>No items in this list</p>
                  <p className="text-sm text-slate-500">Items will appear here as they are added by the community.</p>
                </div>
              </div>
            ) : (
              <div data-testid="list-items">
                <div className="flex flex-col gap-3 mb-4 p-3 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200/60 shadow-sm" data-testid="toolbar-list-detail">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm text-slate-500 font-medium" data-testid="text-items-count">
                        {filteredAndSorted.length} of {items.length} {items.length === 1 ? "item" : "items"}
                      </p>
                      {reactionsQuery.isLoading && (
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 text-[#7c86ff] animate-spin" />
                          <span className="text-xs text-slate-400">Loading reactions...</span>
                        </div>
                      )}
                      {isLoadingWeights && (
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 text-[#7c86ff] animate-spin" />
                          <span className="text-xs text-slate-400">Loading trust weights...</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400" data-testid="label-pov-header">Point of View</span>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 border border-indigo-200 bg-indigo-50/60 rounded-lg h-8 px-2 no-default-hover-elevate no-default-active-elevate" data-testid="button-pov-menu">
                            <Eye className="h-3 w-3" />
                            <span className="truncate max-w-[100px]">{povDisplayName}</span>
                            {isDemoPov && <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-px rounded-full border border-amber-200" data-testid="badge-demo-pov">demo</span>}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-slate-200 shadow-xl">
                          <DropdownMenuLabel className="text-xs text-slate-500">Point of View</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-slate-100" />
                          <div className="px-2 py-2 flex flex-col gap-1.5">
                            <p className="text-[11px] text-slate-600"><span className="font-medium text-indigo-600" data-testid="text-pov-name">{povDisplayName}</span></p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!isEffectivelySelf && (
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-600 hover:text-slate-900 gap-1 border border-slate-200 rounded-md no-default-hover-elevate no-default-active-elevate" onClick={handleResetPov} data-testid="button-reset-pov">
                                  <RotateCcw className="h-2.5 w-2.5" /> Reset to me
                                </Button>
                              )}
                              {isDwarves && !isDemoPov && (
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-amber-600 hover:text-amber-800 gap-1 border border-amber-200 rounded-md no-default-hover-elevate no-default-active-elevate" onClick={handleResetToDemo} data-testid="button-reset-demo-pov">
                                  <RotateCcw className="h-2.5 w-2.5" /> Reset to demo
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-slate-500 hover:text-slate-900 gap-1 border border-slate-200 rounded-md no-default-hover-elevate no-default-active-elevate" onClick={() => setShowPovInput(!showPovInput)} data-testid="button-switch-pov">
                                Switch
                              </Button>
                            </div>
                            {showPovInput && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Input
                                  value={povInput}
                                  onChange={(e) => setPovInput(e.target.value)}
                                  placeholder="npub or hex pubkey..."
                                  className="h-7 text-xs bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-md flex-1 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                                  onKeyDown={(e) => { if (e.key === "Enter") handlePovSwitch(); }}
                                  data-testid="input-pov-pubkey"
                                />
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-md no-default-hover-elevate no-default-active-elevate" onClick={handlePovSwitch} data-testid="button-apply-pov">
                                  Apply
                                </Button>
                              </div>
                            )}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>

                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400" data-testid="label-scoring-header">Scoring Method</span>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 bg-white/80 rounded-lg h-8 px-2.5 no-default-hover-elevate no-default-active-elevate" data-testid="button-trust-method">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{TRUST_METHOD_LABELS[trustMethod]}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 bg-white/95 backdrop-blur-xl border-slate-200 shadow-xl">
                          <DropdownMenuLabel className="text-xs text-slate-500">Scoring Method</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-slate-100" />
                          {(["trust_everyone", "follow_list", "trusted_list", "graperank"] as TrustMethod[]).map((m) => (
                            <DropdownMenuItem
                              key={m}
                              className={`cursor-pointer gap-2 text-xs ${trustMethod === m ? "text-indigo-700 bg-indigo-50" : "text-slate-700"}`}
                              onClick={() => setTrustMethod(m)}
                              data-testid={`menuitem-trust-${m}`}
                            >
                              <div className="flex-1">
                                <p className="font-medium">{TRUST_METHOD_LABELS[m]}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{TRUST_METHOD_DESCS[m]}</p>
                              </div>
                              {trustMethod === m && <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap" data-testid="filter-chips">
                    {([
                      { key: "all" as ScoreFilter, label: "All", count: filterCounts.all },
                      { key: "has_votes" as ScoreFilter, label: "Has Votes", count: filterCounts.has_votes },
                      { key: "positive" as ScoreFilter, label: "Positive", count: filterCounts.positive },
                      { key: "negative" as ScoreFilter, label: "Negative", count: filterCounts.negative },
                    ]).map((chip) => (
                      <button
                        key={chip.key}
                        onClick={() => setScoreFilter(chip.key)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                          scoreFilter === chip.key
                            ? "bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
                            : "bg-white/80 text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
                        }`}
                        data-testid={`chip-filter-${chip.key}`}
                      >
                        {chip.label} ({chip.count})
                      </button>
                    ))}
                  </div>

                  {trustMethod === "trusted_list" && availableTrustedLists.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white/70">
                      <span className="text-xs text-slate-500 shrink-0">List:</span>
                      <Select value={trustedListId || "__default__"} onValueChange={(v) => setTrustedListId(v === "__default__" ? "" : v)}>
                        <SelectTrigger className="h-7 text-xs bg-white border-slate-200 text-slate-900 rounded-md flex-1" data-testid="select-trusted-list">
                          <SelectValue placeholder="Select a trusted list" />
                        </SelectTrigger>
                        <SelectContent className="bg-white/95 backdrop-blur-xl border-slate-200">
                          {availableTrustedLists.map((tl) => (
                            <SelectItem key={tl.dTag || "__default__"} value={tl.dTag || "__default__"} className="text-xs text-slate-700">
                              {tl.isDcosl ? `📋 ${tl.label}` : tl.label || "Default"} ({tl.pubkeys.size} members)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {trustMethod === "trusted_list" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50" data-testid="chain-indicator">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Chain:</span>
                      <span className="text-[10px] font-semibold text-indigo-500">
                        {(() => {
                          if (!trustedListId) return "All Trusted Lists";
                          const match = availableTrustedLists.find(tl => tl.dTag === trustedListId);
                          if (!match) return trustedListId;
                          return `${match.label} (${match.pubkeys.size})`;
                        })()}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 text-indigo-400" />
                      <span className="text-[10px] font-semibold text-slate-900">{listHeader?.namePlural || listHeader?.name || "Current List"}</span>
                    </div>
                  )}

                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search items..."
                      className="pl-9 h-9 text-sm bg-white/80 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-lg focus-visible:ring-[#7c86ff]/30 focus-visible:border-[#7c86ff]/40"
                      data-testid="input-search-items"
                    />
                  </div>
                </div>

                {filteredAndSorted.length === 0 && items.length > 0 ? (
                  isLoadingWeights ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="loading-weights">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                        <Loader2 className="h-6 w-6 text-[#7c86ff] animate-spin" />
                      </div>
                      <p className="text-sm text-slate-500 font-medium">Loading trust weights...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="empty-filter-results">
                      <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                        <SearchIcon className="h-8 w-8 text-slate-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-slate-900 mb-1" style={{ fontFamily: "var(--font-display)" }}>No items match your filters</p>
                        <p className="text-sm text-slate-500 max-w-md">
                          Try adjusting your search term or changing the active filter.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1 border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() => { setSearchTerm(""); setScoreFilter("all"); }}
                        data-testid="button-clear-all-filters"
                      >
                        Clear all filters
                      </Button>
                    </div>
                  )
                ) : (
                <>{reactions.length > 0 && (
                  <div className="flex items-center gap-4 mb-3 px-1" data-testid="reaction-summary">
                    <div className="flex items-center gap-1.5">
                      <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-600" data-testid="text-total-upvotes">
                        {reactions.filter(r => r.isUpvote).length}
                      </span>
                      <span className="text-xs text-slate-400">upvotes</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ThumbsDown className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-sm font-semibold text-red-500" data-testid="text-total-downvotes">
                        {reactions.filter(r => !r.isUpvote).length}
                      </span>
                      <span className="text-xs text-slate-400">downvotes</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      ({reactions.length} total from {allVoterPubkeys.length} voters)
                    </span>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="hidden md:grid grid-cols-[1fr_120px_60px_60px_110px] items-center px-4 py-2 border-b border-slate-200 bg-slate-50">
                    <button className={`flex items-center gap-1 text-xs font-medium transition-colors text-left ${sortKey === "name" ? "text-indigo-600 font-semibold" : "text-slate-500 hover:text-slate-900"}`} onClick={() => handleSort("name")} data-testid="button-sort-name">
                      Item
                      {sortKey === "name" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                    <span className="text-xs font-medium text-slate-500">Author</span>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button className={`flex items-center justify-center gap-0.5 text-xs font-medium transition-colors ${sortKey === "raw_up" ? "text-indigo-600 font-semibold" : "text-slate-400 hover:text-slate-700"}`} onClick={() => handleSort("raw_up")} data-testid="button-sort-raw-up">
                          <ThumbsUp className="h-3 w-3" />
                          {sortKey === "raw_up" && (sortDir === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white border-slate-200 text-slate-700 text-xs shadow-lg">Weighted upvotes (raw count below)</TooltipContent>
                    </UITooltip>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <button className={`flex items-center justify-center gap-0.5 text-xs font-medium transition-colors ${sortKey === "raw_down" ? "text-indigo-600 font-semibold" : "text-slate-400 hover:text-slate-700"}`} onClick={() => handleSort("raw_down")} data-testid="button-sort-raw-down">
                          <ThumbsDown className="h-3 w-3" />
                          {sortKey === "raw_down" && (sortDir === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white border-slate-200 text-slate-700 text-xs shadow-lg">Weighted downvotes (raw count below)</TooltipContent>
                    </UITooltip>
                    <button className={`flex items-center justify-center gap-0.5 text-xs font-medium transition-colors ${sortKey === "net_score" ? "text-indigo-600 font-semibold" : "text-slate-400 hover:text-slate-700"}`} onClick={() => handleSort("net_score")} data-testid="button-sort-score">
                      Trust Score
                      {sortKey === "net_score" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                  </div>
                  <div className="flex md:hidden items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50">
                    <button className={`flex items-center gap-1 text-xs font-medium transition-colors ${sortKey === "name" ? "text-indigo-600 font-semibold" : "text-slate-500 hover:text-slate-900"}`} onClick={() => handleSort("name")} data-testid="button-sort-name-mobile">
                      Item {sortKey === "name" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                    </button>
                    <div className="flex items-center gap-3">
                      <button className={`flex items-center gap-0.5 text-xs font-medium transition-colors ${sortKey === "raw_up" ? "text-indigo-600 font-semibold" : "text-slate-400 hover:text-slate-700"}`} onClick={() => handleSort("raw_up")} data-testid="button-sort-raw-up-mobile">
                        <ThumbsUp className="h-3 w-3" /> {sortKey === "raw_up" && (sortDir === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)}
                      </button>
                      <button className={`flex items-center gap-0.5 text-xs font-medium transition-colors ${sortKey === "raw_down" ? "text-indigo-600 font-semibold" : "text-slate-400 hover:text-slate-700"}`} onClick={() => handleSort("raw_down")} data-testid="button-sort-raw-down-mobile">
                        <ThumbsDown className="h-3 w-3" /> {sortKey === "raw_down" && (sortDir === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)}
                      </button>
                      <button className={`flex items-center gap-0.5 text-xs font-medium transition-colors ${sortKey === "net_score" ? "text-indigo-600 font-semibold" : "text-slate-400 hover:text-slate-700"}`} onClick={() => handleSort("net_score")} data-testid="button-sort-score-mobile">
                        Score {sortKey === "net_score" && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                    </div>
                  </div>

                  {filteredAndSorted.map((item) => {
                    const score = itemScores.get(item.aTag);
                    const isExpanded = expandedItem === item.aTag;
                    const itemKey = item.dTag || item.id.slice(0, 8);
                    const pubkeyValue = extractPubkey(item.content || "", item.jsonData) || (item.referencedPubkey && /^[0-9a-f]{64}$/i.test(item.referencedPubkey) ? item.referencedPubkey : "");
                    const jd = item.jsonData as Record<string, unknown> | null;
                    const itemImage = item.image || (jd && typeof jd.image === "string" ? jd.image : "") || (jd && typeof jd.picture === "string" ? jd.picture : "") || (jd && typeof jd.avatar === "string" ? jd.avatar : "");

                    const allVoterPks = new Set([
                      ...(score?.upvoters.map(v => v.pubkey) ?? []),
                      ...(score?.downvoters.map(v => v.pubkey) ?? []),
                    ]);
                    const totalVoters = allVoterPks.size;
                    const weightedSources = (score?.upvoters.filter(v => v.weight !== 0).length ?? 0) + (score?.downvoters.filter(v => v.weight !== 0).length ?? 0);
                    const wUp = score?.weightedUp ?? 0;
                    const wDown = score?.weightedDown ?? 0;
                    const wTotal = wUp + wDown;
                    const sentimentPct = wTotal > 0 ? (wUp / wTotal) * 100 : 50;

                    return (
                      <div key={item.aTag}>
                        <button
                          className="w-full px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left"
                          onClick={() => setExpandedItem(isExpanded ? null : item.aTag)}
                          data-testid={`row-item-${itemKey}`}
                        >
                          <div className="hidden md:grid grid-cols-[1fr_120px_60px_60px_110px] items-center">
                            <div className="flex items-center gap-3 min-w-0">
                              {pubkeyValue ? (
                                <ItemProfileAvatar pubkey={pubkeyValue} extraRelays={extraRelays} prefetchedProfile={profilesMap[pubkeyValue] || null} batchDone={batchProfilesDone} fallbackImage={itemImage} fallbackName={item.name} />
                              ) : itemImage ? (
                                <Avatar className="h-8 w-8 border border-slate-200 shrink-0 rounded-xl" data-testid={`avatar-item-${itemKey}`}>
                                  <AvatarImage src={itemImage} className="object-cover" />
                                  <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold rounded-xl">
                                    {(item.name || "?").charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              ) : (
                                <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                  <span className="text-xs text-indigo-600 font-bold">
                                    {(item.name || "?").charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-900 truncate" data-testid={`text-item-name-${itemKey}`}>
                                    {item.name || item.content?.slice(0, 50) || "Unnamed item"}
                                  </p>
                                  {item.createdAt > 0 && (
                                    <span className="text-[9px] text-slate-400 shrink-0" data-testid={`text-item-date-${itemKey}`}>{formatRelativeTime(item.createdAt)}</span>
                                  )}
                                </div>
                                {item.description ? (
                                  <p className="text-[11px] text-slate-400 truncate mt-0.5" title={item.description} data-testid={`text-item-desc-row-${itemKey}`}>
                                    {item.description}
                                  </p>
                                ) : !pubkeyValue && item.content && item.content !== item.name ? (
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {item.content.slice(0, 60)}
                                  </p>
                                ) : null}
                              </div>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                            </div>

                            <div className="min-w-0">
                              <AuthorBadge pubkey={item.pubkey} extraRelays={extraRelays} prefetchedProfile={profilesMap[item.pubkey] || null} batchDone={batchProfilesDone} />
                            </div>

                            <div className="flex items-center justify-center">
                              <span className="text-xs font-mono tabular-nums text-emerald-600 font-semibold" data-testid={`text-weighted-up-${itemKey}`}>
                                {wUp.toFixed(1)}
                              </span>
                            </div>

                            <div className="flex items-center justify-center">
                              <span className="text-xs font-mono tabular-nums text-red-500 font-semibold" data-testid={`text-weighted-down-${itemKey}`}>
                                {wDown.toFixed(1)}
                              </span>
                            </div>

                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <span className={`text-sm font-bold font-mono tabular-nums ${(score?.netScore ?? 0) > 0 ? "text-emerald-600" : (score?.netScore ?? 0) < 0 ? "text-red-500" : "text-slate-500"}`} data-testid={`text-score-${itemKey}`}>
                                {score ? (score.netScore > 0 ? "+" : "") + score.netScore.toFixed(3) : "0.000"}
                              </span>
                              <div className="w-14 h-1 rounded-full overflow-hidden flex" data-testid={`bar-sentiment-${itemKey}`}>
                                {wTotal > 0 ? (
                                  <>
                                    <div className="h-full bg-emerald-500" style={{ width: `${sentimentPct}%` }} />
                                    <div className="h-full bg-red-400" style={{ width: `${100 - sentimentPct}%` }} />
                                  </>
                                ) : (
                                  <div className="h-full w-full bg-slate-200" />
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex md:hidden flex-col gap-2">
                            <div className="flex items-start gap-3">
                              <div className="shrink-0">
                                {pubkeyValue ? (
                                  <ItemProfileAvatar pubkey={pubkeyValue} extraRelays={extraRelays} prefetchedProfile={profilesMap[pubkeyValue] || null} batchDone={batchProfilesDone} fallbackImage={itemImage} fallbackName={item.name} />
                                ) : itemImage ? (
                                  <Avatar className="h-8 w-8 border border-slate-200 shrink-0 rounded-xl">
                                    <AvatarImage src={itemImage} className="object-cover" />
                                    <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold rounded-xl">
                                      {(item.name || "?").charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                ) : (
                                  <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                    <span className="text-xs text-indigo-600 font-bold">
                                      {(item.name || "?").charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-900 truncate">
                                    {item.name || item.content?.slice(0, 50) || "Unnamed item"}
                                  </p>
                                  {item.createdAt > 0 && (
                                    <span className="text-[9px] text-slate-400 shrink-0">{formatRelativeTime(item.createdAt)}</span>
                                  )}
                                </div>
                                {item.description ? (
                                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                                    {item.description}
                                  </p>
                                ) : !pubkeyValue && item.content && item.content !== item.name ? (
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {item.content.slice(0, 60)}
                                  </p>
                                ) : null}
                                <div className="mt-1">
                                  <AuthorBadge pubkey={item.pubkey} extraRelays={extraRelays} prefetchedProfile={profilesMap[item.pubkey] || null} batchDone={batchProfilesDone} />
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-1" />}
                            </div>

                            <div className="flex items-center justify-between pl-11">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                  <ThumbsUp className="h-3 w-3 text-emerald-500" />
                                  <span className="text-xs font-mono tabular-nums text-emerald-600 font-semibold">{wUp.toFixed(1)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <ThumbsDown className="h-3 w-3 text-red-400" />
                                  <span className="text-xs font-mono tabular-nums text-red-500 font-semibold">{wDown.toFixed(1)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-10 h-1 rounded-full overflow-hidden flex">
                                  {wTotal > 0 ? (
                                    <>
                                      <div className="h-full bg-emerald-500" style={{ width: `${sentimentPct}%` }} />
                                      <div className="h-full bg-red-400" style={{ width: `${100 - sentimentPct}%` }} />
                                    </>
                                  ) : (
                                    <div className="h-full w-full bg-slate-200" />
                                  )}
                                </div>
                                <span className={`text-sm font-bold font-mono tabular-nums ${(score?.netScore ?? 0) > 0 ? "text-emerald-600" : (score?.netScore ?? 0) < 0 ? "text-red-500" : "text-slate-500"}`}>
                                  {score ? (score.netScore > 0 ? "+" : "") + score.netScore.toFixed(3) : "0.000"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>

                        {isExpanded && score && (() => {
                          const allVoters = [
                            ...score.upvoters.map(v => ({ ...v, isUpvote: true })),
                            ...score.downvoters.map(v => ({ ...v, isUpvote: false })),
                          ].sort((a, b) => {
                            const contribA = a.isUpvote ? a.weight : -a.weight;
                            const contribB = b.isUpvote ? b.weight : -b.weight;
                            if (a.weight === 0 && b.weight === 0) return 0;
                            if (a.weight === 0) return 1;
                            if (b.weight === 0) return -1;
                            return contribB - contribA;
                          });

                          return (
                          <div className="px-4 py-4 border-b border-slate-100 bg-slate-50/50" data-testid={`detail-panel-${itemKey}`}>
                            <div className="flex flex-col gap-1.5 mb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Trust Score Breakdown</span>
                                  <span className={`text-sm font-bold font-mono tabular-nums ${score.netScore > 0 ? "text-emerald-600" : score.netScore < 0 ? "text-red-500" : "text-slate-500"}`}>
                                    {(score.netScore > 0 ? "+" : "") + score.netScore.toFixed(3)}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {score.upvoters.length} up / {score.downvoters.length} down
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                                <span className="font-mono"><span className="text-emerald-600 font-medium">{wUp.toFixed(1)}</span> weighted up</span>
                                <span>&middot;</span>
                                <span className="font-mono"><span className="text-red-500 font-medium">{wDown.toFixed(1)}</span> weighted down</span>
                                <span>&middot;</span>
                                <span>{score.rawUp} raw up / {score.rawDown} raw down</span>
                                <span>&middot;</span>
                                <span>from {totalVoters} voter{totalVoters !== 1 ? "s" : ""}</span>
                                <span>&middot;</span>
                                <span>{weightedSources} weighted source{weightedSources !== 1 ? "s" : ""}</span>
                              </div>
                            </div>

                            {item.description && (
                              <p className="text-xs text-slate-500 italic mb-3 px-1 border-l-2 border-indigo-200 pl-2" data-testid={`text-item-desc-${itemKey}`}>
                                {item.description}
                              </p>
                            )}

                            <div className="flex items-center gap-1.5 mb-3 text-[10px] text-slate-400" data-testid={`text-scoring-context-${itemKey}`}>
                              <Eye className="h-3 w-3 text-indigo-400 shrink-0" />
                              <span className="font-medium text-indigo-600">{TRUST_METHOD_LABELS[trustMethod]}</span>
                              <span>&middot;</span>
                              <span>{TRUST_METHOD_DESCS[trustMethod]}</span>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                              <div className="grid grid-cols-[1fr_40px_90px_100px_1fr] items-center px-3 py-2 bg-slate-50 border-b border-slate-200">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Source</span>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Vote</span>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Trust Weight</span>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Contribution</span>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Note</span>
                              </div>

                              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                {allVoters.length === 0 ? (
                                  <p className="text-xs text-slate-400 px-3 py-3 text-center">No votes yet</p>
                                ) : (
                                  allVoters.map((v) => (
                                    <ScoreBreakdownRow key={v.pubkey} pubkey={v.pubkey} weight={v.weight} createdAt={v.createdAt} content={v.content} isUpvote={v.isUpvote} extraRelays={extraRelays} itemAuthorPubkey={item.pubkey} prefetchedProfile={profilesMap[v.pubkey] || null} batchDone={batchProfilesDone} />
                                  ))
                                )}
                              </div>

                              <div className="grid grid-cols-[1fr_40px_90px_100px_1fr] items-center px-3 py-2 bg-slate-50 border-t border-slate-200">
                                <span className="text-xs font-bold text-slate-700">Total Trust Score</span>
                                <div />
                                <div />
                                <div className="text-center">
                                  <span className={`text-xs font-bold font-mono tabular-nums ${score.netScore > 0 ? "text-emerald-600" : score.netScore < 0 ? "text-red-500" : "text-slate-500"}`}>
                                    {(score.netScore > 0 ? "+" : "") + score.netScore.toFixed(3)}
                                  </span>
                                </div>
                                <div />
                              </div>
                            </div>

                            {item.jsonData && (
                              <div className="mt-4 pt-3 border-t border-slate-100">
                                <p className="text-[10px] text-slate-500 font-medium mb-1.5">Properties</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(item.jsonData).map(([k, v]) => (
                                    <Badge key={k} variant="outline" className="text-[10px] border-slate-200 text-slate-600 bg-white no-default-hover-elevate no-default-active-elevate">
                                      {k}: {String(v)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                </>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function ListDetailPage() {
  const [user, setUser] = useState<NostrUser | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const u = getCurrentUser();
    if (u) {
      setUser(u);
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-8 w-8 text-[#7c86ff] animate-spin" />
      </div>
    );
  }

  return (
    <TrustProvider selfPubkey={user.pubkey}>
      <ListDetailContent />
    </TrustProvider>
  );
}
