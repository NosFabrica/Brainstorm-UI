import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import {
  Search as SearchIcon,
  User,
  Home,
  LogOut,
  Menu,
  X,
  Info,
  Loader2,
  Copy,
  Check,
  Settings as SettingsIcon,
  BookOpen,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser, logout, fetchProfile, fetchProfiles, eventStore, type NostrUser } from "@/services/nostr";
import { getProfileContent, isValidProfile } from "applesauce-core/helpers/profile";
import { apiClient } from "@/services/api";
import { toPubkeys, toInfluenceMap } from "../services/graphHelpers";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";

const FollowersIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 19.5c0-3.5 2.8-6 6.5-6s6.5 2.5 6.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="17.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.6" />
    <path d="M17.5 13c2.2 0 4 1.5 4.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
  </svg>
);

const FollowingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 20c0-3.5 3-6.5 7-6.5s7 3 7 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 4l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
    <path d="M12 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
  </svg>
);

const InfluenceIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" strokeOpacity="0.4" />
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 3" strokeOpacity="0.2" />
    <path d="M12 5v-2M12 21v-2M5 12H3M21 12h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35" />
  </svg>
);

const MutedByIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 10v4a2 2 0 002 2h2l5 4V6L7 10H5a2 2 0 00-2 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M17 9l-5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 9l5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ReportedByIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 3L4 9v11a1 1 0 001 1h14a1 1 0 001-1V9l-8-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
    <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1" fill="currentColor" />
  </svg>
);

const MutingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 10v4a2 2 0 002 2h2l5 4V6L7 10H5a2 2 0 00-2 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M16 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ReportingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M5 4h10l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M14 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 11v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12" cy="17.5" r="0.75" fill="currentColor" />
  </svg>
);

const MutualIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 19c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 19c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
    <path d="M10 14l2-1.5 2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
  </svg>
);

const SharedConnectionIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="18" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1" fill="currentColor" fillOpacity="0.4" />
    <path d="M6 9.5V6a2 2 0 012-2h8a2 2 0 012 2v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4" />
    <path d="M6 14.5V18a2 2 0 002 2h8a2 2 0 002-2v-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4" />
  </svg>
);

const TrustShieldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.08" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RiskAdvisoryIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 3l9 16H3L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.08" />
    <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </svg>
);

const EnterpriseSearchIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <g clipPath="url(#clip0_search_icon)">
      <path d="M12 22.75C6.07 22.75 1.25 17.93 1.25 12C1.25 6.07 6.07 1.25 12 1.25C17.93 1.25 22.75 6.07 22.75 12C22.75 12.41 22.41 12.75 22 12.75C21.59 12.75 21.25 12.41 21.25 12C21.25 6.9 17.1 2.75 12 2.75C6.9 2.75 2.75 6.9 2.75 12C2.75 17.1 6.9 21.25 12 21.25C12.41 21.25 12.75 21.59 12.75 22C12.75 22.41 12.41 22.75 12 22.75Z" fill="currentColor" />
      <path d="M18.2 22.15C16.02 22.15 14.25 20.38 14.25 18.2C14.25 16.02 16.02 14.25 18.2 14.25C20.38 14.25 22.15 16.02 22.15 18.2C22.15 20.38 20.38 22.15 18.2 22.15ZM18.2 15.75C16.85 15.75 15.75 16.85 15.75 18.2C15.75 19.55 16.85 20.65 18.2 20.65C19.55 20.65 20.65 19.55 20.65 18.2C20.65 16.85 19.55 15.75 18.2 15.75Z" fill="currentColor" />
      <path d="M21.9999 22.7495C21.8099 22.7495 21.6199 22.6795 21.4699 22.5295L20.4699 21.5295C20.1799 21.2395 20.1799 20.7595 20.4699 20.4695C20.7599 20.1795 21.2399 20.1795 21.5299 20.4695L22.5299 21.4695C22.8199 21.7595 22.8199 22.2395 22.5299 22.5295C22.3799 22.6795 22.1899 22.7495 21.9999 22.7495Z" fill="currentColor" />
    </g>
    <defs>
      <clipPath id="clip0_search_icon">
        <rect width="24" height="24" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

const EnterpriseUserIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <g clipPath="url(#clip0_user_icon)">
      <path d="M18 18.8597H17.24C16.44 18.8597 15.68 19.1697 15.12 19.7297L13.41 21.4197C12.63 22.1897 11.36 22.1897 10.58 21.4197L8.87 19.7297C8.31 19.1697 7.54 18.8597 6.75 18.8597H6C4.34 18.8597 3 17.5298 3 15.8898V4.97974C3 3.33974 4.34 2.00977 6 2.00977H18C19.66 2.00977 21 3.33974 21 4.97974V15.8898C21 17.5198 19.66 18.8597 18 18.8597Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.9999 9.99982C13.2868 9.99982 14.33 8.95662 14.33 7.6698C14.33 6.38298 13.2868 5.33984 11.9999 5.33984C10.7131 5.33984 9.66992 6.38298 9.66992 7.6698C9.66992 8.95662 10.7131 9.99982 11.9999 9.99982Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 15.6594C16 13.8594 14.21 12.3994 12 12.3994C9.79 12.3994 8 13.8594 8 15.6594" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <defs>
      <clipPath id="clip0_user_icon">
        <rect width="24" height="24" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 8 + Math.random() * 84,
  y: 8 + Math.random() * 84,
  size: Math.random() * 2.5 + 1.5,
  popDelay: i * 1.2 + Math.random() * 2,
  floatDuration: Math.random() * 20 + 22,
  floatDelay: Math.random() * 6,
}));

const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 7], [4, 8],
  [5, 9], [0, 6], [1, 7], [2, 8], [6, 9],
];

const decorativeText = [
  "trust_score: 0.847",
  "npub1qd9...k7a2",
  "hops: 3",
  "relay: wss://nos.lol",
  "verify(sig)",
  "WOT(u) = f(G, seeds)",
  "muted_by: 0",
  "followers: 142",
  "influence: 1.0",
  "kind: 22242",
  "relay: wss://damus.io",
  "G = (V, E, W)",
  "score = f(hops)",
  "compute(graperank)",
  "npub1z8f...m4c9",
  "following: 87",
  "attenuation: 0.5",
  "rigor: 0.25",
];

function estimateSearchLineLength(a: number, b: number): number {
  const dx = (floatingNodes[a].x - floatingNodes[b].x);
  const dy = (floatingNodes[a].y - floatingNodes[b].y);
  return Math.sqrt(dx * dx + dy * dy) * 12;
}

type SearchError = {
  code: "MISSING_QUERY" | "INVALID_NPUB" | "NOT_FOUND" | "RELAY_TIMEOUT";
  title: string;
  message: string;
};

export default function SearchPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [npub, setNpub] = useState("");
  const [keyword, setKeyword] = useState("");
  const [activeTab, setActiveTab] = useState<"npub" | "keyword">("npub");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<SearchError | null>(null);

  const [profileResult, setProfileResult] = useState<any>(null);
  const [nostrProfile, setNostrProfile] = useState<{ name?: string; display_name?: string; picture?: string; nip05?: string; about?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const [selfData, setSelfData] = useState<any>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [sectionVisibleCount, setSectionVisibleCount] = useState<Record<string, number>>({});
  const expandProfileCache = useRef<Map<string, any>>(new Map());
  const expandTrustCache = useRef<Map<string, number | null>>(new Map());
  const [forceRender, setForceRender] = useState(0);

  const autoSearchTriggered = useRef(false);
  const pendingAutoSearch = useRef<string | null>(null);
  const [cameFromNetwork, setCameFromNetwork] = useState(false);
  const [fromGroup, setFromGroup] = useState<string | null>(null);

  const { data: grapeRankData } = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const calcDone = grapeRankData?.data?.internal_publication_status === "success";

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/");
      return;
    }
    setUser(u);

    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("npub");
    const group = params.get("fromGroup");
    if (prefill && !autoSearchTriggered.current) {
      setNpub(prefill);
      setActiveTab("npub");
      pendingAutoSearch.current = prefill;
      setCameFromNetwork(true);
      if (group) setFromGroup(group);
    }
  }, [navigate]);

  useEffect(() => {
    if (user) {
      apiClient.getSelf().then(res => {
        if (res?.data) setSelfData(res.data);
      }).catch(() => {});
    }
  }, [user]);


  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const renderLinkedText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        urlRegex.lastIndex = 0;
        const display = part.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2 decoration-indigo-300 break-all" data-testid={`link-about-url-${i}`}>
            {display}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const fetchAbortRef = useRef<number>(0);

  const fetchSectionProfiles = async (key: string, pubkeys: string[], startIdx = 0, count = 10) => {
    const fetchId = ++fetchAbortRef.current;
    const toFetch = pubkeys.slice(startIdx, startIdx + count).filter(
      pk => !expandProfileCache.current.has(pk) || !expandTrustCache.current.has(pk)
    );
    const batchSize = 10;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      if (fetchAbortRef.current !== fetchId) return;
      const batch = toFetch.slice(i, i + batchSize);
      const profilePubkeys = batch.filter(pk => !expandProfileCache.current.has(pk));
      const trustPubkeys = batch.filter(pk => !expandTrustCache.current.has(pk));
      const missingProfiles: string[] = [];
      for (const pk of profilePubkeys) {
        const event = eventStore.getReplaceable(0, pk);
        if (event) {
          if (isValidProfile(event)) expandProfileCache.current.set(pk, getProfileContent(event));
        } else {
          missingProfiles.push(pk);
        }
      }
      await Promise.allSettled([
        ...(missingProfiles.length > 0 ? [fetchProfiles(missingProfiles, (pubkey, profile) => {
          expandProfileCache.current.set(pubkey, profile);
        })] : []),
        ...trustPubkeys.map(pk =>
          apiClient.getUserByPubkey(pk)
            .then(resp => expandTrustCache.current.set(pk, resp?.data?.influence ?? null))
            .catch(() => expandTrustCache.current.set(pk, null))
        ),
      ]);
      if (fetchAbortRef.current !== fetchId) return;
      setForceRender(c => c + 1);
    }
  };

  const mutualPubkeys = useMemo(() => {
    if (!profileResult) return [];
    const followedBy = toPubkeys(profileResult.followed_by);
    const following = toPubkeys(profileResult.following);
    const followingSet = new Set(following);
    return followedBy.filter((pk: string) => followingSet.has(pk));
  }, [profileResult]);

  const sharedFollowerPubkeys = useMemo(() => {
    if (!selfData || !profileResult) return [];
    const selfGraph = selfData?.graph || selfData;
    const selfFollowedBy = toPubkeys(selfGraph?.followed_by);
    const selfFollowedBySet = new Set(selfFollowedBy);
    const searchedFollowedBy = toPubkeys(profileResult.followed_by);
    return searchedFollowedBy.filter((pk: string) => selfFollowedBySet.has(pk));
  }, [selfData, profileResult]);

  const sharedFollowingPubkeys = useMemo(() => {
    if (!selfData || !profileResult) return [];
    const selfGraph = selfData?.graph || selfData;
    const selfFollowing = toPubkeys(selfGraph?.following);
    const selfFollowingSet = new Set(selfFollowing);
    const searchedFollowing = toPubkeys(profileResult.following);
    return searchedFollowing.filter((pk: string) => selfFollowingSet.has(pk));
  }, [selfData, profileResult]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!prev[key]) {
        setSectionVisibleCount(vc => ({ ...vc, [key]: 10 }));
        const pubkeys = key === "mutual" ? mutualPubkeys
          : key === "shared_followers" ? sharedFollowerPubkeys
          : key === "shared_following" ? sharedFollowingPubkeys
          : toPubkeys(profileResult?.[key]);
        if (pubkeys.length > 0) {
          const influenceMap = toInfluenceMap(profileResult?.[key]);
          influenceMap.forEach((inf, pk) => {
            if (!expandTrustCache.current.has(pk)) {
              expandTrustCache.current.set(pk, inf);
            }
          });
          fetchSectionProfiles(key, pubkeys);
        }
      } else {
        setSectionVisibleCount(vc => {
          const copy = { ...vc };
          delete copy[key];
          return copy;
        });
      }
      return next;
    });
  };

  const getGroupsForPubkey = (pk: string): { key: string; label: string; colors: string }[] => {
    const groupDefs: { key: string; label: string; colors: string }[] = [
      { key: "followed_by", label: "Follower", colors: "bg-blue-50 text-blue-500 border-blue-100" },
      { key: "following", label: "Following", colors: "bg-blue-50 text-blue-500 border-blue-100" },
      { key: "mutual", label: "Mutual", colors: "bg-teal-50 text-teal-500 border-teal-100" },
      { key: "shared_followers", label: "Shared Follower", colors: "bg-indigo-50 text-indigo-500 border-indigo-100" },
      { key: "shared_following", label: "Shared Following", colors: "bg-indigo-50 text-indigo-500 border-indigo-100" },
      { key: "muted_by", label: "Muted By", colors: "bg-amber-50 text-amber-500 border-amber-200" },
      { key: "muting", label: "Muting", colors: "bg-amber-50 text-amber-500 border-amber-200" },
      { key: "reported_by", label: "Reported", colors: "bg-red-50 text-red-500 border-red-200" },
      { key: "reporting", label: "Reporting", colors: "bg-slate-50 text-slate-500 border-slate-200" },
    ];
    if (!profileResult) return [];
    return groupDefs.filter(g => {
      if (g.key === "mutual") {
        const fb = toPubkeys(profileResult.followed_by);
        const fg = toPubkeys(profileResult.following);
        return fb.includes(pk) && fg.includes(pk);
      }
      if (g.key === "shared_followers") return sharedFollowerPubkeys.includes(pk);
      if (g.key === "shared_following") return sharedFollowingPubkeys.includes(pk);
      return toPubkeys(profileResult[g.key]).includes(pk);
    });
  };

  const drillDownRef = useRef<string | null>(null);

  const drillDown = (pk: string) => {
    const targetNpub = nip19.npubEncode(pk);
    fetchAbortRef.current++;
    setExpandedSections({});
    setSectionVisibleCount({});
    setProfileResult(null);
    setNostrProfile(null);
    setHasSearched(false);
    setSearchError(null);
    expandProfileCache.current.clear();
    expandTrustCache.current.clear();
    setActiveTab("npub");
    setNpub(targetNpub);
    drillDownRef.current = targetNpub;
  };

  useEffect(() => {
    if (drillDownRef.current && npub === drillDownRef.current) {
      drillDownRef.current = null;
      handleSearch();
    }
  }, [npub]);

  const sectionBorderColors: Record<string, string> = {
    followed_by: "border-blue-300",
    following: "border-blue-300",
    mutual: "border-teal-300",
    shared_followers: "border-indigo-300",
    shared_following: "border-indigo-300",
    muted_by: "border-amber-300",
    reported_by: "border-red-300",
    muting: "border-amber-200",
    reporting: "border-slate-300",
  };

  const renderExpandedPanel = (key: string, pubkeys: string[]) => {
    const isExpanded = expandedSections[key];
    if (!isExpanded || pubkeys.length === 0) return null;
    const visibleCount = sectionVisibleCount[key] || 10;
    const visiblePubkeys = pubkeys.slice(0, visibleCount);
    const borderColor = sectionBorderColors[key] || "border-slate-300";

    return (
      <div className="border-t border-slate-100 bg-slate-50/50">
        <div className={`border-l-2 ${borderColor} ml-4`}>
          {visiblePubkeys.map(pk => {
            const profile = expandProfileCache.current.get(pk);
            const trustScore = expandTrustCache.current.get(pk);
            const displayName = profile?.display_name || profile?.name || nip19.npubEncode(pk).slice(0, 12) + "...";
            const overlappingGroups = getGroupsForPubkey(pk).filter(g => g.key !== key);

            const trustPct = trustScore !== undefined && trustScore !== null ? Math.round(Math.min(1, Math.max(0, trustScore)) * 100) : null;
            const circ = 2 * Math.PI * 18;
            const trustOffset = trustPct !== null ? circ - (trustPct / 100) * circ : circ;
            const ringColor = trustPct !== null ? (trustPct >= 50 ? "text-indigo-500" : trustPct >= 20 ? "text-indigo-400" : trustPct >= 7 ? "text-indigo-300" : "text-indigo-200") : "text-indigo-100";

            if (profile === undefined) {
              return (
                <div key={pk} className="flex items-center gap-3 px-4 py-2" data-testid={`expand-profile-${pk.slice(0,8)}`}>
                  <div className="h-7 w-7 rounded-full bg-slate-200 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
                    <div className="h-2 w-16 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
              );
            }

            return (
              <div
                key={pk}
                className="flex items-center gap-3 px-4 py-2 hover:bg-white/80 cursor-pointer transition-colors"
                onClick={() => drillDown(pk)}
                data-testid={`expand-profile-${pk.slice(0,8)}`}
              >
                <Avatar className="h-7 w-7 border border-slate-200/60 shrink-0">
                  {profile?.picture ? <AvatarImage src={profile.picture} /> : null}
                  <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{displayName}</p>
                  {profile?.nip05 && <p className="text-xs text-indigo-500 truncate">{profile.nip05}</p>}
                </div>
                {overlappingGroups.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {overlappingGroups.map(g => (
                      <Badge key={g.key} variant="outline" className={`text-[10px] px-1 py-0 no-default-hover-elevate no-default-active-elevate ${g.colors}`}>{g.label}</Badge>
                    ))}
                  </div>
                )}
                {trustScore !== undefined && trustScore !== null && (
                  <div className="w-6 h-6 relative shrink-0">
                    <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-indigo-100" />
                      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" strokeLinecap="round"
                        className={ringColor} style={{ strokeDasharray: circ, strokeDashoffset: trustOffset }} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-indigo-700">{trustPct}</span>
                  </div>
                )}
                {trustScore === undefined && (
                  <Loader2 className="h-3 w-3 text-indigo-300 animate-spin shrink-0" />
                )}
              </div>
            );
          })}
          {pubkeys.length > visibleCount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                const newCount = (sectionVisibleCount[key] || 10) + 10;
                setSectionVisibleCount(vc => ({ ...vc, [key]: newCount }));
                fetchSectionProfiles(key, pubkeys, visibleCount, 10);
              }}
              className="w-full text-xs font-medium text-indigo-600"
              data-testid={`button-show-more-${key}`}
            >
              Show {Math.min(10, pubkeys.length - visibleCount)} more ({pubkeys.length - visibleCount} remaining)
            </Button>
          )}
        </div>
      </div>
    );
  };

  const isLikelyNpub = (value: string) =>
    /^npub1[02-9ac-hj-np-z]{20,}$/i.test(value.trim());

  const isHexPubkey = (value: string) =>
    /^[0-9a-f]{64}$/i.test(value.trim());

  const isNip05Handle = (value: string) => {
    const v = value.trim();
    if (v.includes("@")) {
      const parts = v.split("@");
      return parts.length === 2 && parts[0].length > 0 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(parts[1]);
    }
    return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
  };

  const resolveNip05 = async (handle: string): Promise<string> => {
    const trimmed = handle.trim();
    let name: string;
    let domain: string;
    if (trimmed.includes("@")) {
      [name, domain] = trimmed.split("@");
    } else {
      name = "_";
      domain = trimmed;
    }
    const resp = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      throw new Error("Could not resolve handle");
    }
    const data = await resp.json();
    const pubkey = data?.names?.[name] || data?.names?.[name.toLowerCase()];
    if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) {
      throw new Error("Handle not found");
    }
    return pubkey;
  };

  const handleSearch = async () => {
    const q = (npub || keyword || "").trim();

    setSearchError(null);
    setHasSearched(false);
    setProfileResult(null);
    setNostrProfile(null);
    setAboutExpanded(false);
    setExpandedSections({});
    setSectionVisibleCount({});
    fetchAbortRef.current++;
    expandProfileCache.current.clear();
    expandTrustCache.current.clear();

    if (!q) {
      setSearchError({
        code: "MISSING_QUERY",
        title: "Enter a search value",
        message:
          activeTab === "npub"
            ? "Enter an npub, hex pubkey, or NIP-05 handle (e.g. name@domain.com)."
            : "Type a keyword to search identities.",
      });
      return;
    }

    let hexPubkey: string;
    let displayQuery: string = q;

    if (activeTab === "npub") {
      if (isLikelyNpub(q)) {
        try {
          const decoded = nip19.decode(q);
          if (decoded.type !== "npub" || typeof decoded.data !== "string") {
            setSearchError({ code: "INVALID_NPUB", title: "Invalid npub format", message: "Could not decode this npub. Make sure it's a valid Bech32-encoded public key." });
            return;
          }
          hexPubkey = decoded.data;
        } catch {
          setSearchError({ code: "INVALID_NPUB", title: "Invalid npub format", message: "Could not decode this npub. Make sure it's a valid Bech32-encoded public key." });
          return;
        }
      } else if (isHexPubkey(q)) {
        hexPubkey = q.toLowerCase();
        displayQuery = nip19.npubEncode(hexPubkey);
      } else if (isNip05Handle(q)) {
        setSearchQuery(q);
        setIsSearching(true);
        try {
          hexPubkey = await resolveNip05(q);
          displayQuery = nip19.npubEncode(hexPubkey);
        } catch (err) {
          setIsSearching(false);
          setHasSearched(true);
          setSearchError({
            code: "INVALID_NPUB",
            title: "Handle not found",
            message: err instanceof Error ? err.message : "Could not resolve that NIP-05 handle. Check the format and try again.",
          });
          return;
        }
      } else {
        setSearchError({
          code: "INVALID_NPUB",
          title: "Unrecognized format",
          message: 'Enter an npub (npub1...), a 64-character hex pubkey, or a NIP-05 handle (name@domain.com).',
        });
        return;
      }
    } else {
      setSearchError({ code: "MISSING_QUERY", title: "Not yet available", message: "Keyword search is coming soon." });
      return;
    }

    setSearchQuery(displayQuery);
    setIsSearching(true);
    setNostrProfile(null);

    try {
      const [graphRes, profileRes] = await Promise.allSettled([
        apiClient.getUserByPubkey(hexPubkey),
        fetchProfile(hexPubkey),
      ]);

      const graphData = graphRes.status === "fulfilled" ? graphRes.value?.data : null;
      setProfileResult(graphData || null);

      if (profileRes.status === "fulfilled" && profileRes.value) {
        setNostrProfile(profileRes.value as any);
      } else {
        setNostrProfile(null);
      }

      setHasSearched(true);
      if (!graphData) {
        setSearchError({
          code: "NOT_FOUND",
          title: "No profile found",
          message: "We couldn\u2019t find data for this identity on the Brainstorm backend.",
        });
      }
    } catch (err) {
      setHasSearched(true);
      setSearchError({
        code: "RELAY_TIMEOUT",
        title: "Lookup failed",
        message:
          err instanceof Error
            ? err.message
            : "An error occurred while searching. Try again.",
      });
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (pendingAutoSearch.current && npub === pendingAutoSearch.current && !autoSearchTriggered.current) {
      autoSearchTriggered.current = true;
      pendingAutoSearch.current = null;
      handleSearch();
    }
  }, [npub]);

  const handleCopyNpub = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!user) return null;

  const truncatedNpub = user.npub.slice(0, 12) + "..." + user.npub.slice(-6);

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden"
      data-testid="page-search"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.28] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/30 blur-[130px]"
          style={{ animation: "searchBlobA 28s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/20 blur-[150px]"
          style={{ animation: "searchBlobB 32s ease-in-out infinite 2s" }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/15 blur-[110px]"
          style={{ animation: "searchBlobC 24s ease-in-out infinite 5s" }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-[600px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute inset-0 w-full h-full">
          {connectionPairs.map(([a, b], i) => {
            const len = estimateSearchLineLength(a, b);
            const drawDelay = i * 0.8 + 0.3;
            return (
              <line
                key={i}
                x1={`${floatingNodes[a].x}%`}
                y1={`${floatingNodes[a].y}%`}
                x2={`${floatingNodes[b].x}%`}
                y2={`${floatingNodes[b].y}%`}
                stroke="url(#searchLineGrad)"
                strokeWidth="0.5"
                strokeDasharray={len}
                strokeDashoffset={len}
                style={{
                  ["--dash" as string]: len,
                  animation: `searchLineDraw ${1.2 + (i % 3) * 0.4}s ease-out ${drawDelay}s forwards, searchLinePulse 12s ease-in-out ${drawDelay + 1.5}s infinite`,
                } as React.CSSProperties}
              />
            );
          })}
          <defs>
            <linearGradient id="searchLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.14" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white/80 border border-slate-200/40"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: node.size + 5,
              height: node.size + 5,
              opacity: 0,
              transform: "scale(0)",
              animation: `searchNodePop 0.6s ease-out ${node.popDelay}s forwards, searchNodeFloat ${node.floatDuration}s ease-in-out ${node.popDelay + 0.6}s infinite`,
            }}
          />
        ))}

      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
        {decorativeText.map((text, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const left = 3 + col * 24 + ((row % 2) * 10);
          const top = 80 + row * 220;
          return (
            <div
              key={i}
              className="absolute text-xs font-mono text-indigo-400/50 select-none whitespace-nowrap"
              style={{
                left: `${left}%`,
                top: `${top}px`,
                opacity: 0,
                animation: `searchCalcFloat 10s ease-in-out ${i * 1.2 + 1}s infinite`,
              }}
              data-testid={`text-search-bg-decorative-${i}`}
            >
              {text}
            </div>
          );
        })}
      </div>

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-search">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                  className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => navigate("/dashboard")}
                data-testid="button-brand"
              >
                <BrainLogo size={28} className="text-indigo-500" />
                <h1
                  className="text-lg sm:text-xl font-bold tracking-tight text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-logo"
                >
                  Brainstorm
                </h1>
              </button>
              <div className="hidden lg:flex gap-2" data-testid="row-nav-links">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white bg-white/10 no-default-hover-elevate no-default-active-elevate"
                  data-testid="button-nav-search"
                >
                  <SearchIcon className="h-4 w-4" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`gap-2 no-default-hover-elevate no-default-active-elevate ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-600 opacity-40 cursor-not-allowed"}`}
                  onClick={() => calcDone && navigate("/network")}
                  disabled={!calcDone}
                  title={!calcDone ? "Available after calculation completes" : undefined}
                  data-testid="button-nav-network"
                >
                  <User className="h-4 w-4" />
                  Network
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                      {user.picture ? (
                        <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {user.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2">
                      <span className="text-sm font-bold text-white leading-none mb-0.5">
                        {user.displayName || "Anon"}
                      </span>
                      <span className="text-xs text-indigo-300 font-mono leading-none">
                        {user.npub.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
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
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={handleLogout}
                    data-testid="dropdown-logout"
                  >
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
          <div
            className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="overlay-mobile-menu"
          />
          <div
            className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-xl flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950"
            data-testid="panel-mobile-menu"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-[90px]" />
              <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-indigo-900/18 blur-[110px]" />
            </div>

            <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
                  <BrainLogo size={22} className="text-indigo-200" />
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-mobile-menu-kicker">Brainstorm</p>
                  <h2 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mobile-menu-title">Menu</h2>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-200/80 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                data-testid="button-close-mobile-menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative flex-1 flex flex-col overflow-y-auto py-4 px-3">
              <div className="space-y-2">
                <p className="px-3 text-xs font-semibold text-slate-300/70 uppercase tracking-[0.22em]">Navigation</p>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-semibold text-white bg-white/10 border border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/dashboard"); }}
                  data-testid="button-mobile-nav-dashboard"
                >
                  <Home className="h-5 w-5 text-indigo-200" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-white bg-white/10 border border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="button-mobile-nav-search"
                >
                  <SearchIcon className="h-5 w-5 text-indigo-200" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  className={`w-full justify-start gap-3 text-base font-medium border border-transparent rounded-2xl no-default-hover-elevate no-default-active-elevate ${calcDone ? "text-slate-200/90 hover:text-white hover:bg-white/10 hover:border-white/10" : "text-slate-500 opacity-40 cursor-not-allowed"}`}
                  onClick={() => { if (calcDone) { setMobileMenuOpen(false); navigate("/network"); } }}
                  disabled={!calcDone}
                  title={!calcDone ? "Available after calculation completes" : undefined}
                  data-testid="button-mobile-nav-network"
                >
                  <User className={`h-5 w-5 ${calcDone ? "text-slate-200/80" : "text-slate-500"}`} />
                  Network
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/what-is-wot"); }}
                  data-testid="button-mobile-nav-wot"
                >
                  <BookOpen className="h-5 w-5 text-slate-200/80" />
                  What is WoT?
                </Button>
              </div>
              <div className="mt-auto pt-4 px-0">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/settings"); }}
                  data-testid="button-mobile-nav-settings"
                >
                  <SettingsIcon className="h-5 w-5 text-slate-200/80" />
                  Settings
                </Button>
              </div>
            </div>

            <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                <Avatar className="h-10 w-10 border border-white/10">
                  {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} /> : null}
                  <AvatarFallback className="bg-indigo-900 text-white font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user.displayName || "Anonymous"}</p>
                  <p className="text-xs text-slate-300/70 font-mono truncate">{truncatedNpub}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-center gap-2 text-red-200 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                data-testid="button-mobile-sign-out"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </>
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        {cameFromNetwork && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50/60 mb-4 -ml-1 no-default-hover-elevate no-default-active-elevate"
            onClick={() => navigate(fromGroup ? `/network?group=${fromGroup}` : "/network")}
            data-testid="button-back-to-network"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Network
          </Button>
        )}
        <div className="space-y-8 animate-fade-up">
          <div className="text-left relative z-10 mb-8 pt-2" data-testid="section-search-header">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />
            <div className="flex flex-col items-start gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm" data-testid="pill-search-kicker">
                <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
                <span className="text-xs font-bold tracking-[0.15em] text-indigo-900 uppercase">Profile Search</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight relative" style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-title">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block">
                  Explore Nostr
                </span>
              </h1>
              <p className="text-slate-500 text-xs md:text-sm max-w-xl leading-relaxed font-light" data-testid="text-search-subtitle">
                Tap into the open network to find people, verify identities, and see who is trusted by your community.
              </p>
            </div>
          </div>

          <Card className="bg-white/90 backdrop-blur-xl border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.07)] overflow-hidden rounded-xl relative" data-testid="card-search">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />

            <Tabs defaultValue="npub" className="w-full" onValueChange={(v) => setActiveTab((v as "npub" | "keyword") || "npub")}>
              <CardHeader className="bg-gradient-to-b from-indigo-500/15 to-white/60 border-b border-indigo-500/10 py-3 px-3 sm:py-4 sm:px-5">
                <div className="flex flex-row flex-wrap items-center justify-between gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-white border border-slate-100 shadow-sm text-indigo-800 ring-1 ring-slate-100">
                      <EnterpriseSearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <div className="bg-white/50 backdrop-blur-sm px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl border border-slate-100 shadow-sm">
                      <CardTitle className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Profile Discovery</CardTitle>
                      <CardDescription className="text-slate-500 text-[10px] sm:text-xs font-medium uppercase tracking-wide">Trust Search</CardDescription>
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-full bg-indigo-500/10 text-[10px] sm:text-xs font-bold text-indigo-900 border border-indigo-500/20 uppercase tracking-wider flex items-center gap-1 sm:gap-1.5 shrink-0" data-testid="badge-nostr">
                    <img src="/nostr-ostrich.gif" alt="" className="h-3.5 w-3.5 sm:h-4 sm:w-4 object-contain" aria-hidden="true" />
                    <span>NOSTR</span>
                  </div>
                </div>

                <TabsList className="mt-4 sm:mt-6 w-full grid grid-cols-2 h-auto p-0.5 sm:p-1 bg-slate-100/50 rounded-lg border border-slate-200/50" data-testid="tabs-search-mode">
                  <TabsTrigger
                    value="npub"
                    className="data-[state=active]:bg-white data-[state=active]:text-indigo-800 data-[state=active]:shadow-sm data-[state=active]:border-slate-200 py-1.5 sm:py-2.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-slate-500 transition-all flex flex-row items-center justify-center gap-1 sm:gap-1.5"
                    data-testid="tab-npub"
                  >
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>
                      <span className="sm:hidden">Npub</span>
                      <span className="hidden sm:inline lg:hidden">Npub</span>
                      <span className="hidden lg:inline">Public Key</span>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="keyword"
                    disabled
                    className="data-[state=active]:bg-white data-[state=active]:text-indigo-800 data-[state=active]:shadow-sm data-[state=active]:border-slate-200 py-1.5 sm:py-2.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-slate-400 transition-all flex flex-row items-center justify-center gap-1 sm:gap-1.5 opacity-70 cursor-not-allowed"
                    data-testid="tab-keyword-coming-soon"
                  >
                    <SearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="inline-flex items-center gap-1 sm:gap-2">
                      <span>
                        <span className="sm:hidden">Keyword</span>
                        <span className="hidden sm:inline lg:hidden">Keyword</span>
                        <span className="hidden lg:inline">Keyword Search</span>
                      </span>
                      <span className="rounded-full bg-indigo-800 text-white border border-indigo-800/40 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-xs font-bold tracking-wider uppercase shadow-sm">
                        Soon
                      </span>
                    </span>
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-5 bg-white/60 min-h-[140px] sm:min-h-[180px]">
                <TabsContent value="npub" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                  <div className="flex flex-col gap-3 sm:gap-4 py-3 sm:py-4">
                    <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                      <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-800">
                        <EnterpriseUserIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-700" data-testid="text-npub-section-title">Identity Lookup</h4>
                        <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">
                          <span className="sm:hidden">npub, hex, or NIP-05</span>
                          <span className="hidden sm:inline">npub, hex pubkey, or NIP-05 handle</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <div className="relative flex-1 group/input">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-indigo-800 rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500" />
                        <Input
                          placeholder="npub1..., hex, or name@domain.com"
                          className={
                            "relative bg-white/90 backdrop-blur-sm border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)] text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 h-10 sm:h-11 rounded-lg transition-all font-mono text-xs sm:text-sm shadow-sm focus:shadow-[0_0_20px_rgba(99,102,241,0.2)]" +
                            (searchError?.code === "INVALID_NPUB"
                              ? " border-red-300 focus:border-red-400 focus:ring-red-200/40"
                              : "")
                          }
                          value={npub}
                          onChange={(e) => {
                            setNpub(e.target.value);
                            if (searchError) setSearchError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSearch();
                          }}
                          aria-invalid={searchError?.code === "INVALID_NPUB"}
                          data-testid="input-npub"
                        />
                      </div>
                      <Button
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="h-10 sm:h-11 px-6 bg-[#3730a3] hover:bg-[#312e81] text-white shadow-lg shadow-[#3730a3]/20 font-bold tracking-wide text-xs gap-2 w-full sm:w-auto"
                        data-testid="button-npub-lookup"
                      >
                        {isSearching ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Looking up...
                          </>
                        ) : (
                          "LOOKUP"
                        )}
                      </Button>
                    </div>

                    {activeTab === "npub" && searchError?.code === "INVALID_NPUB" && (
                      <div className="-mt-1 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-search-invalid-npub">
                        <div className="mt-0.5 h-5 w-5 rounded-full bg-red-600/10 text-red-700 flex items-center justify-center shrink-0">
                          <Info className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-red-900" data-testid="text-search-invalid-npub-title">{searchError.title}</p>
                          <p className="text-xs text-red-800/80" data-testid="text-search-invalid-npub-body">{searchError.message}</p>
                        </div>
                      </div>
                    )}

                    {searchError?.code === "MISSING_QUERY" && (
                      <div className="-mt-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" data-testid="alert-search-missing-query">
                        <div className="mt-0.5 h-5 w-5 rounded-full bg-amber-600/10 text-amber-700 flex items-center justify-center shrink-0">
                          <Info className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-amber-900" data-testid="text-search-missing-title">{searchError.title}</p>
                          <p className="text-xs text-amber-800/80" data-testid="text-search-missing-body">{searchError.message}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="keyword" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-800">
                        <SearchIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-700">Identity Search</h4>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Find profiles by name, NIP-05, or attributes</p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1 group/input">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-indigo-800 rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500" />
                        <Input
                          placeholder="Search..."
                          className="relative bg-white/90 backdrop-blur-sm border-indigo-500/30 text-slate-900 placeholder:text-slate-400 h-11 rounded-lg font-mono text-sm shadow-sm"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          disabled
                          data-testid="input-keyword"
                        />
                      </div>
                      <Button disabled className="h-11 px-6 bg-[#3730a3] text-white font-bold tracking-wide text-xs opacity-50" data-testid="button-keyword-lookup">
                        LOOKUP
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {isSearching && (
            <div className="mt-6" data-testid="panel-search-skeleton">
              <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden">
                <div className="p-6 sm:p-8 animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-full bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2.5 pt-1">
                      <div className="h-4 bg-slate-200 rounded w-36" />
                      <div className="h-3 bg-slate-100 rounded w-48" />
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="h-16 bg-slate-100 rounded-xl" />
                    <div className="h-16 bg-slate-100 rounded-xl" />
                    <div className="h-16 bg-slate-100 rounded-xl" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="h-12 bg-slate-50 rounded-xl" />
                    <div className="h-12 bg-slate-50 rounded-xl" />
                  </div>
                </div>
              </Card>
            </div>
          )}

          {!isSearching && hasSearched && (
            <div className="mt-6" data-testid="panel-search-result" style={{ animation: "processingFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
              {searchError ? (
                <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative" data-testid="card-search-empty-state">
                  <div className="p-7 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
                    <div className="relative">
                      <div
                        className={
                          "absolute -inset-1 rounded-2xl blur-md opacity-70 " +
                          (searchError.code === "RELAY_TIMEOUT"
                            ? "bg-gradient-to-br from-amber-400/40 to-indigo-800/20"
                            : "bg-gradient-to-br from-indigo-500/40 to-indigo-800/25")
                        }
                      />
                      <div
                        className={
                          "relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border shadow-sm flex items-center justify-center " +
                          (searchError.code === "RELAY_TIMEOUT"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-indigo-800")
                        }
                        data-testid="icon-search-empty"
                      >
                        <SearchIcon className="h-6 w-6" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold tracking-wider uppercase text-slate-400" data-testid="text-search-empty-kicker">
                        {searchError.code === "RELAY_TIMEOUT" ? "Network" : "Lookup"}
                      </p>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-empty-title">
                        {searchError.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed" data-testid="text-search-empty-body">{searchError.message}</p>
                      <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="row-search-empty-actions">
                        <Button
                          type="button"
                          onClick={handleSearch}
                          className={
                            "h-10 rounded-xl px-4 font-bold tracking-wide text-xs shadow-sm " +
                            (searchError.code === "RELAY_TIMEOUT"
                              ? "bg-amber-600 hover:bg-amber-700 text-white"
                              : "bg-[#3730a3] hover:bg-[#312e81] text-white")
                          }
                          data-testid="button-search-retry"
                        >
                          Try again
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setHasSearched(false);
                            setSearchError(null);
                            setSearchQuery("");
                            setNpub("");
                            setProfileResult(null);
                            setNostrProfile(null);
                          }}
                          className="h-10 rounded-xl px-4 border-slate-200 bg-white"
                          data-testid="button-search-clear"
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5" data-testid="note-search-empty">
                        <p className="text-xs text-slate-600">
                          Tip: if this is a brand-new identity, it may not have published metadata yet.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : profileResult ? (
                <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative" data-testid="card-search-result">
                  <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />

                  <div className="p-5 sm:p-6 relative overflow-hidden"
                    style={{
                      backgroundImage: [
                        'radial-gradient(circle at 90% 10%, rgba(99,102,241,0.12) 0%, transparent 50%)',
                        'radial-gradient(circle at 5% 95%, rgba(99,102,241,0.06) 0%, transparent 40%)',
                        'radial-gradient(circle, rgba(99,102,241,0.08) 1px, transparent 1px)',
                      ].join(', '),
                      backgroundSize: '100% 100%, 100% 100%, 20px 20px',
                      boxShadow: 'inset 0 1px 0 0 rgba(99,102,241,0.12), inset 0 -1px 0 0 rgba(99,102,241,0.04)',
                    }}
                  >
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" data-testid="svg-network-bg">
                      {[
                        { x1: 10, y1: 5, x2: 28, y2: 14 },
                        { x1: 10, y1: 5, x2: 4, y2: 20 },
                        { x1: 28, y1: 14, x2: 45, y2: 8 },
                        { x1: 28, y1: 14, x2: 38, y2: 28 },
                        { x1: 4, y1: 20, x2: 18, y2: 35 },
                        { x1: 45, y1: 8, x2: 62, y2: 12 },
                        { x1: 62, y1: 12, x2: 78, y2: 6 },
                        { x1: 62, y1: 12, x2: 72, y2: 25 },
                        { x1: 78, y1: 6, x2: 93, y2: 15 },
                        { x1: 72, y1: 25, x2: 88, y2: 35 },
                        { x1: 38, y1: 28, x2: 52, y2: 38 },
                        { x1: 18, y1: 35, x2: 8, y2: 50 },
                        { x1: 18, y1: 35, x2: 30, y2: 48 },
                        { x1: 52, y1: 38, x2: 65, y2: 48 },
                        { x1: 88, y1: 35, x2: 95, y2: 50 },
                        { x1: 8, y1: 50, x2: 20, y2: 62 },
                        { x1: 30, y1: 48, x2: 45, y2: 58 },
                        { x1: 65, y1: 48, x2: 80, y2: 55 },
                        { x1: 95, y1: 50, x2: 85, y2: 65 },
                        { x1: 20, y1: 62, x2: 35, y2: 72 },
                        { x1: 45, y1: 58, x2: 55, y2: 70 },
                        { x1: 80, y1: 55, x2: 92, y2: 68 },
                        { x1: 35, y1: 72, x2: 15, y2: 82 },
                        { x1: 35, y1: 72, x2: 50, y2: 80 },
                        { x1: 55, y1: 70, x2: 70, y2: 78 },
                        { x1: 92, y1: 68, x2: 82, y2: 80 },
                        { x1: 15, y1: 82, x2: 28, y2: 92 },
                        { x1: 50, y1: 80, x2: 65, y2: 90 },
                        { x1: 70, y1: 78, x2: 82, y2: 80 },
                        { x1: 82, y1: 80, x2: 95, y2: 92 },
                      ].map((l, i) => {
                        const len = Math.sqrt(Math.pow(l.x2 - l.x1, 2) + Math.pow(l.y2 - l.y1, 2)) * 5;
                        return (
                          <line key={`cl-${i}`} x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
                            stroke="rgb(99,102,241)" strokeWidth="0.5" opacity="0"
                            style={{ strokeDasharray: len, strokeDashoffset: len, ['--dash' as string]: len, animation: `searchLineDraw 1.8s ${0.3 + i * 0.1}s ease-out forwards, searchLinePulse 6s ${2.5 + i * 0.25}s ease-in-out infinite` }} />
                        );
                      })}
                      {[
                        { cx: 10, cy: 5, r: 3.5, delay: 0.2 },
                        { cx: 28, cy: 14, r: 2.5, delay: 0.4 },
                        { cx: 4, cy: 20, r: 2, delay: 0.6 },
                        { cx: 45, cy: 8, r: 2, delay: 0.5 },
                        { cx: 62, cy: 12, r: 2.5, delay: 0.6 },
                        { cx: 78, cy: 6, r: 1.5, delay: 0.5 },
                        { cx: 93, cy: 15, r: 2, delay: 0.7 },
                        { cx: 38, cy: 28, r: 2, delay: 0.8 },
                        { cx: 72, cy: 25, r: 2.5, delay: 0.8 },
                        { cx: 18, cy: 35, r: 2, delay: 0.9 },
                        { cx: 88, cy: 35, r: 2, delay: 0.9 },
                        { cx: 52, cy: 38, r: 2.5, delay: 1.0 },
                        { cx: 8, cy: 50, r: 1.5, delay: 1.0 },
                        { cx: 65, cy: 48, r: 2, delay: 1.1 },
                        { cx: 95, cy: 50, r: 1.5, delay: 1.1 },
                        { cx: 30, cy: 48, r: 2, delay: 1.0 },
                        { cx: 20, cy: 62, r: 2, delay: 1.2 },
                        { cx: 45, cy: 58, r: 1.5, delay: 1.2 },
                        { cx: 80, cy: 55, r: 2, delay: 1.2 },
                        { cx: 85, cy: 65, r: 1.5, delay: 1.3 },
                        { cx: 35, cy: 72, r: 2, delay: 1.3 },
                        { cx: 55, cy: 70, r: 2, delay: 1.4 },
                        { cx: 92, cy: 68, r: 1.5, delay: 1.3 },
                        { cx: 15, cy: 82, r: 2, delay: 1.5 },
                        { cx: 50, cy: 80, r: 2, delay: 1.5 },
                        { cx: 70, cy: 78, r: 1.5, delay: 1.5 },
                        { cx: 82, cy: 80, r: 2, delay: 1.6 },
                        { cx: 28, cy: 92, r: 1.5, delay: 1.7 },
                        { cx: 65, cy: 90, r: 1.5, delay: 1.7 },
                        { cx: 95, cy: 92, r: 2, delay: 1.8 },
                      ].map((n, i) => (
                        <circle key={`cn-${i}`} cx={`${n.cx}%`} cy={`${n.cy}%`} r={n.r} fill="rgb(99,102,241)" opacity="0"
                          style={{ animation: `searchNodePop 0.6s ${n.delay}s ease-out forwards, searchNodeFloat ${5 + (i % 3) * 2}s ${2 + n.delay}s ease-in-out infinite` }} />
                      ))}
                    </svg>

                    <div className="relative z-10">
                    <div className="flex items-start gap-3 sm:gap-4 mb-5">
                      <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-indigo-100 shadow-md shrink-0">
                        {nostrProfile?.picture && <AvatarImage src={nostrProfile.picture} alt={nostrProfile?.display_name || nostrProfile?.name || "Profile"} className="object-cover" />}
                        <AvatarFallback className="bg-indigo-50 text-indigo-600 text-base sm:text-lg font-bold">
                          {(nostrProfile?.display_name || nostrProfile?.name || searchQuery.slice(0, 2)).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-result-title">
                                {nostrProfile?.display_name || nostrProfile?.name || searchQuery.slice(0, 18) + "..."}
                              </h3>
                              <Badge variant="secondary" className="text-[10px] font-bold tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-100" data-testid="badge-search-result-found">
                                Profile Found
                              </Badge>
                            </div>
                            {nostrProfile?.nip05 && (
                              <p className="text-xs sm:text-xs text-indigo-600 font-medium mt-0.5 truncate" data-testid="text-search-result-nip05">{nostrProfile.nip05}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <code className="text-xs text-slate-400 font-mono truncate max-w-[120px] sm:max-w-[300px]" data-testid="text-search-result-npub">{searchQuery}</code>
                              <button onClick={() => handleCopyNpub(searchQuery)} className="p-0.5 text-slate-400 hover:text-indigo-500 transition-colors shrink-0" data-testid="button-copy-search-npub">
                                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                            {(() => {
                              const followers = Array.isArray(profileResult.followed_by) ? toPubkeys(profileResult.followed_by).length : (profileResult.followed_by || 0);
                              const mutedBy = Array.isArray(profileResult.muted_by) ? toPubkeys(profileResult.muted_by).length : (profileResult.muted_by || 0);
                              const denom = followers + mutedBy;
                              const trustRatio = denom > 0 ? (followers / denom) * 100 : 100;
                              const trustColor = trustRatio > 90 ? "text-emerald-700 bg-emerald-50 border-emerald-200" : trustRatio >= 50 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-red-700 bg-red-50 border-red-200";
                              const iconColor = trustRatio > 90 ? "text-emerald-500" : trustRatio >= 50 ? "text-amber-500" : "text-red-500";
                              return (
                                <Badge variant="outline" className={`mt-2 text-[10px] font-semibold no-default-hover-elevate no-default-active-elevate ${trustColor}`} data-testid="badge-trust-ratio">
                                  <TrustShieldIcon className={`h-3 w-3 mr-1 ${iconColor}`} />
                                  Trust Ratio: {trustRatio.toFixed(1)}%
                                </Badge>
                              );
                            })()}
                          </div>
                          {profileResult.influence !== undefined && (() => {
                            const rawScore = typeof profileResult.influence === "number" ? profileResult.influence : 0;
                            const score = Math.min(1, Math.max(0, rawScore));
                            const pct = Math.round(score * 100);
                            const tier = pct >= 50 ? { label: "Trust Score", ring: "stroke-indigo-500", opacity: "1" }
                              : pct >= 20 ? { label: "Trust Score", ring: "stroke-indigo-400", opacity: "0.85" }
                              : pct >= 7 ? { label: "Trust Score", ring: "stroke-indigo-300", opacity: "0.7" }
                              : { label: "Trust Score", ring: "stroke-indigo-200", opacity: "0.55" };
                            const circumference = 2 * Math.PI * 18;
                            const offset = circumference - (score * circumference);
                            return (
                              <div className="flex flex-col items-center gap-0.5 bg-indigo-50/80 border border-indigo-200 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 backdrop-blur-sm shrink-0" data-testid="badge-trust-score">
                                <div className="flex items-center gap-1">
                                  <BrainLogo size={8} className="text-indigo-400 sm:hidden" />
                                  <BrainLogo size={10} className="text-indigo-400 hidden sm:block" />
                                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-400">Brainstorm</span>
                                </div>
                                <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
                                    <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-100" />
                                    <circle cx="22" cy="22" r="18" fill="none" strokeWidth="2.5" strokeLinecap="round"
                                      className={tier.ring} style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: "stroke-dashoffset 1s ease-out", opacity: tier.opacity }} />
                                  </svg>
                                  <span className="text-xs sm:text-sm font-bold font-mono tabular-nums text-indigo-700">{pct}</span>
                                </div>
                                <span className="text-[10px] sm:text-xs font-semibold text-indigo-600">{tier.label}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    {nostrProfile?.about && (
                      <div className="mb-4 overflow-hidden" data-testid="text-search-result-about">
                        <p className={`text-xs text-slate-500 leading-relaxed whitespace-pre-line break-words overflow-wrap-anywhere ${!aboutExpanded ? "line-clamp-3" : ""}`} style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {renderLinkedText(nostrProfile.about)}
                        </p>
                        {nostrProfile.about.length > 140 && (
                          <button
                            onClick={() => setAboutExpanded(!aboutExpanded)}
                            className="text-xs text-indigo-500 font-medium mt-1"
                            data-testid="button-about-toggle"
                          >
                            {aboutExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>
                    )}

                    {(() => {
                      if (!selfData || !profileResult) return null;
                      const sharedUnique = new Set([...sharedFollowerPubkeys, ...sharedFollowingPubkeys]);
                      const sharedCount = sharedUnique.size;
                      const mutualFollowersCount = sharedFollowerPubkeys.length;
                      const mutualFollowingCount = sharedFollowingPubkeys.length;
                      const isExpandable = sharedCount > 0;
                      const isAnyExpanded = expandedSections["shared_followers"] || expandedSections["shared_following"];

                      return (
                        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 overflow-hidden" data-testid="banner-shared-connections">
                          <div
                            className={`px-4 py-3 flex items-start gap-3 ${isExpandable ? "cursor-pointer hover:bg-indigo-50/80 transition-colors" : ""}`}
                            onClick={isExpandable ? () => {
                              if (isAnyExpanded) {
                                setExpandedSections(prev => ({ ...prev, shared_followers: false, shared_following: false }));
                              } else {
                                toggleSection("shared_followers");
                                if (mutualFollowingCount > 0) {
                                  setTimeout(() => toggleSection("shared_following"), 0);
                                }
                              }
                            } : undefined}
                          >
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
                              <SharedConnectionIcon className="h-4 w-4 text-indigo-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {sharedCount > 0 ? (
                                <>
                                  <p className="text-sm font-semibold text-indigo-900">
                                    You share {sharedCount.toLocaleString()} connection{sharedCount !== 1 ? "s" : ""} with this person
                                  </p>
                                  <p className="text-xs text-indigo-600/70 mt-0.5">
                                    {mutualFollowersCount.toLocaleString()} mutual follower{mutualFollowersCount !== 1 ? "s" : ""} · {mutualFollowingCount.toLocaleString()} mutual following
                                  </p>
                                </>
                              ) : (
                                <p className="text-sm text-slate-400 font-medium">No shared connections</p>
                              )}
                            </div>
                            {isExpandable && (
                              <ChevronDown className={`h-4 w-4 text-indigo-400 shrink-0 mt-1 transition-transform ${isAnyExpanded ? "rotate-180" : ""}`} />
                            )}
                          </div>
                          {isAnyExpanded && (
                            <div className="border-t border-indigo-100">
                              {mutualFollowersCount > 0 && (
                                <div>
                                  <div
                                    className="flex items-center justify-between px-4 py-2 bg-indigo-50/40 cursor-pointer hover:bg-indigo-50/70 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); toggleSection("shared_followers"); }}
                                    data-testid="toggle-shared-followers"
                                  >
                                    <div className="flex items-center gap-2">
                                      <FollowersIcon className="h-3.5 w-3.5 text-indigo-400" />
                                      <span className="text-xs font-semibold text-indigo-700">
                                        Mutual Followers ({mutualFollowersCount.toLocaleString()})
                                      </span>
                                    </div>
                                    <ChevronDown className={`h-3.5 w-3.5 text-indigo-400 transition-transform ${expandedSections["shared_followers"] ? "rotate-180" : ""}`} />
                                  </div>
                                  {renderExpandedPanel("shared_followers", sharedFollowerPubkeys)}
                                </div>
                              )}
                              {mutualFollowingCount > 0 && (
                                <div>
                                  <div
                                    className="flex items-center justify-between px-4 py-2 bg-indigo-50/40 cursor-pointer hover:bg-indigo-50/70 transition-colors border-t border-indigo-100/60"
                                    onClick={(e) => { e.stopPropagation(); toggleSection("shared_following"); }}
                                    data-testid="toggle-shared-following"
                                  >
                                    <div className="flex items-center gap-2">
                                      <FollowingIcon className="h-3.5 w-3.5 text-indigo-400" />
                                      <span className="text-xs font-semibold text-indigo-700">
                                        Mutual Following ({mutualFollowingCount.toLocaleString()})
                                      </span>
                                    </div>
                                    <ChevronDown className={`h-3.5 w-3.5 text-indigo-400 transition-transform ${expandedSections["shared_following"] ? "rotate-180" : ""}`} />
                                  </div>
                                  {renderExpandedPanel("shared_following", sharedFollowingPubkeys)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {(profileResult.followed_by || profileResult.following || profileResult.influence !== undefined) && (() => {
                      const mutedByCount = Array.isArray(profileResult.muted_by) ? toPubkeys(profileResult.muted_by).length : (profileResult.muted_by || 0);
                      const reportedByCount = Array.isArray(profileResult.reported_by) ? toPubkeys(profileResult.reported_by).length : (profileResult.reported_by || 0);
                      const mutingCount = Array.isArray(profileResult.muting) ? toPubkeys(profileResult.muting).length : (profileResult.muting || 0);
                      const reportingCount = Array.isArray(profileResult.reporting) ? toPubkeys(profileResult.reporting).length : (profileResult.reporting || 0);
                      const hasRiskSignals = mutedByCount > 0 || reportedByCount > 0;
                      const totalNegativeSignals = mutedByCount + reportedByCount;
                      const riskLevel = reportedByCount > 10 ? "High" : reportedByCount > 0 || mutedByCount > 30 ? "Medium" : mutedByCount > 0 ? "Low" : "None";
                      const riskColor = riskLevel === "High" ? "text-red-600" : riskLevel === "Medium" ? "text-amber-600" : riskLevel === "Low" ? "text-amber-500" : "text-emerald-600";

                      return (
                      <div className="space-y-5">
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              <h4 className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-widest" data-testid="header-social-reach">Social Reach</h4>
                            </div>
                            <span className="text-[10px] sm:text-xs text-slate-400 font-mono hidden sm:inline">Network Position</span>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {profileResult.followed_by !== undefined && (() => {
                              const fbIsArray = Array.isArray(profileResult.followed_by);
                              const fbCount = fbIsArray ? toPubkeys(profileResult.followed_by).length : (profileResult.followed_by || 0);
                              const fbExpandable = fbIsArray && fbCount > 0;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group ${fbExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : ""}`}
                                  onClick={fbExpandable ? () => toggleSection("followed_by") : undefined}
                                  data-testid="metric-search-followers"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                      <FollowersIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Followers</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">People following this account</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-search-result-followers">
                                      {fbCount.toLocaleString()}
                                    </p>
                                    {fbExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["followed_by"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {fbExpandable && renderExpandedPanel("followed_by", toPubkeys(profileResult.followed_by))}
                              </div>
                              );
                            })()}
                            {profileResult.following !== undefined && (() => {
                              const fgIsArray = Array.isArray(profileResult.following);
                              const fgCount = fgIsArray ? toPubkeys(profileResult.following).length : (profileResult.following || 0);
                              const fgExpandable = fgIsArray && fgCount > 0;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group ${fgExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : ""}`}
                                  onClick={fgExpandable ? () => toggleSection("following") : undefined}
                                  data-testid="metric-search-following"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                      <FollowingIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Following</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Accounts this person follows</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-search-result-following">
                                      {fgCount.toLocaleString()}
                                    </p>
                                    {fgExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["following"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {fgExpandable && renderExpandedPanel("following", toPubkeys(profileResult.following))}
                              </div>
                              );
                            })()}
                            {(() => {
                              const mtCount = mutualPubkeys.length;
                              const mtExpandable = mtCount > 0;
                              if (!Array.isArray(profileResult.followed_by) || !Array.isArray(profileResult.following)) return null;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group ${mtExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : ""}`}
                                  onClick={mtExpandable ? () => toggleSection("mutual") : undefined}
                                  data-testid="metric-search-mutual"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                                      <MutualIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-teal-500" />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Mutual</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Follow each other mutually</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-search-result-mutual">
                                      {mtCount.toLocaleString()}
                                    </p>
                                    {mtExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["mutual"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {mtExpandable && renderExpandedPanel("mutual", mutualPubkeys)}
                              </div>
                              );
                            })()}
                            {profileResult.influence !== undefined && (
                              <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group cursor-help" title="Score from 0-1 based on social graph position. Higher means more connected to well-connected people." data-testid="metric-search-influence">
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                    <BrainLogo size={14} className="text-indigo-500 sm:hidden" />
                                    <BrainLogo size={16} className="text-indigo-500 hidden sm:block" />
                                  </div>
                                  <div>
                                    <p className="text-xs sm:text-sm font-semibold text-slate-700">Influence</p>
                                    <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Network influence rating (0-1)</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-2.5">
                                  <div className="w-10 sm:w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500" style={{ width: `${Math.min((typeof profileResult.influence === "number" ? profileResult.influence : 0) * 100, 100)}%` }} />
                                  </div>
                                  <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-search-result-influence">
                                    {typeof profileResult.influence === "number" ? profileResult.influence.toFixed(2) : profileResult.influence}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${hasRiskSignals ? "bg-amber-500" : "bg-slate-300"}`} />
                              <h4 className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-widest" data-testid="header-risk-assessment">Risk Assessment</h4>
                            </div>
                            <span className={`text-[11px] sm:text-xs font-semibold font-mono ${riskColor}`}>{riskLevel} Risk</span>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {profileResult.muted_by !== undefined && (() => {
                              const mbIsArray = Array.isArray(profileResult.muted_by);
                              const mbExpandable = mbIsArray && mutedByCount > 0;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${mbExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : "cursor-help"}`}
                                  title="A soft negative signal. Muting means someone chose to hide this account's content from their feed."
                                  onClick={mbExpandable ? () => toggleSection("muted_by") : undefined}
                                  data-testid="metric-search-muted-by"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center shrink-0 ${mutedByCount > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                                      <MutedByIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${mutedByCount > 0 ? "text-amber-500" : "text-slate-400"}`} />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Muted By</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Others who muted this account</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${mutedByCount > 0 ? "text-amber-700" : "text-slate-900"}`} data-testid="text-search-result-muted-by">
                                      {mutedByCount.toLocaleString()}
                                    </p>
                                    {mbExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["muted_by"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {mbExpandable && renderExpandedPanel("muted_by", toPubkeys(profileResult.muted_by))}
                              </div>
                              );
                            })()}
                            {profileResult.reported_by !== undefined && (() => {
                              const rbIsArray = Array.isArray(profileResult.reported_by);
                              const rbExpandable = rbIsArray && reportedByCount > 0;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${rbExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : "cursor-help"}`}
                                  title="A stronger negative signal than muting. Reports indicate someone flagged this account for harmful or inappropriate behavior."
                                  onClick={rbExpandable ? () => toggleSection("reported_by") : undefined}
                                  data-testid="metric-search-reported-by"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center shrink-0 ${reportedByCount > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-100"}`}>
                                      <ReportedByIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${reportedByCount > 0 ? "text-red-500" : "text-slate-400"}`} />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Reported By</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Reports filed against this account</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${reportedByCount > 0 ? "text-red-600" : "text-slate-900"}`} data-testid="text-search-result-reported-by">
                                      {reportedByCount.toLocaleString()}
                                    </p>
                                    {rbExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["reported_by"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {rbExpandable && renderExpandedPanel("reported_by", toPubkeys(profileResult.reported_by))}
                              </div>
                              );
                            })()}
                            {profileResult.muting !== undefined && (() => {
                              const mtIsArray = Array.isArray(profileResult.muting);
                              const mtExpandable = mtIsArray && mutingCount > 0;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${mtExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : ""}`}
                                  onClick={mtExpandable ? () => toggleSection("muting") : undefined}
                                  data-testid="metric-search-muting"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                      <MutingIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Muting</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Accounts this person has muted</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-search-result-muting">
                                      {mutingCount.toLocaleString()}
                                    </p>
                                    {mtExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["muting"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {mtExpandable && renderExpandedPanel("muting", toPubkeys(profileResult.muting))}
                              </div>
                              );
                            })()}
                            {profileResult.reporting !== undefined && (() => {
                              const rpIsArray = Array.isArray(profileResult.reporting);
                              const rpExpandable = rpIsArray && reportingCount > 0;
                              return (
                              <div>
                                <div
                                  className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${rpExpandable ? "cursor-pointer hover:bg-slate-50/50 transition-colors" : ""}`}
                                  onClick={rpExpandable ? () => toggleSection("reporting") : undefined}
                                  data-testid="metric-search-reporting"
                                >
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                      <ReportingIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-sm font-semibold text-slate-700">Reporting</p>
                                      <p className="text-[10px] sm:text-xs text-slate-400 leading-tight hidden sm:block">Reports filed by this person</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-search-result-reporting">
                                      {reportingCount.toLocaleString()}
                                    </p>
                                    {rpExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expandedSections["reporting"] ? "rotate-180" : ""}`} />}
                                  </div>
                                </div>
                                {rpExpandable && renderExpandedPanel("reporting", toPubkeys(profileResult.reporting))}
                              </div>
                              );
                            })()}
                          </div>
                        </div>

                        {hasRiskSignals && (
                          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/50 overflow-hidden" data-testid="alert-search-trust-warning">
                            <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-start gap-2 sm:gap-3">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                                <RiskAdvisoryIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-amber-900">Risk Advisory</p>
                                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${riskLevel === "High" ? "bg-red-100 text-red-700" : riskLevel === "Medium" ? "bg-amber-100 text-amber-700" : "bg-amber-50 text-amber-600"}`}>
                                    {totalNegativeSignals.toLocaleString()} signal{totalNegativeSignals !== 1 ? "s" : ""} detected
                                  </span>
                                </div>
                                <p className="text-xs text-amber-800/70 leading-relaxed mt-1">
                                  This account has been {mutedByCount > 0 ? `muted by ${mutedByCount.toLocaleString()} ${mutedByCount === 1 ? "person" : "people"}` : ""}
                                  {mutedByCount > 0 && reportedByCount > 0 ? " and " : ""}
                                  {reportedByCount > 0 ? `reported by ${reportedByCount.toLocaleString()} ${reportedByCount === 1 ? "person" : "people"}` : ""}.
                                  Exercise due diligence when evaluating this identity.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    <details className="mt-4">
                      <summary className="text-xs text-slate-400 font-medium uppercase tracking-wide cursor-pointer hover:text-slate-600 transition-colors" data-testid="button-search-result-raw">Raw API Data</summary>
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100 overflow-auto max-h-48 font-mono mt-2" data-testid="text-search-result-raw">
                        {JSON.stringify(profileResult, null, 2)}
                      </pre>
                    </details>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setHasSearched(false);
                          setSearchError(null);
                          setSearchQuery("");
                          setNpub("");
                          setProfileResult(null);
                          setNostrProfile(null);
                        }}
                        className="h-10 rounded-xl px-4 border-slate-200 bg-white"
                        data-testid="button-search-new"
                      >
                        New Search
                      </Button>
                    </div>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="section-search-features">
              {[
                { icon: User, title: "Identity Verification", desc: "Look up any Nostr public key and check its trust signals." },
                { icon: SearchIcon, title: "Network Analysis", desc: "See followers, following, and influence scores from the graph." },
                { icon: Info, title: "Trust Computation", desc: "Powered by GrapeRank and Web-of-Trust scoring algorithms." },
              ].map((feature, idx) => (
                <Card key={idx} className="bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-sm rounded-xl overflow-hidden" data-testid={`card-search-feature-${idx}`}>
                  <div className="h-0.5 w-full bg-gradient-to-r from-indigo-500/50 via-indigo-800/50 to-indigo-500/50" />
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0 mt-0.5">
                      <feature.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800" data-testid={`text-search-feature-title-${idx}`}>{feature.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed" data-testid={`text-search-feature-desc-${idx}`}>{feature.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes searchBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(15px) scale(1.03); }
        }
        @keyframes searchBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-20px) scale(1.05); }
        }
        @keyframes searchBlobC {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-25px); opacity: 0.35; }
        }
        @keyframes searchLineDraw {
          0% { stroke-dashoffset: var(--dash); opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0.18; }
        }
        @keyframes searchLinePulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.2; }
        }
        @keyframes searchNodePop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 0.25; transform: scale(1.15); }
          100% { opacity: 0.18; transform: scale(1); }
        }
        @keyframes searchNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-12px); opacity: 0.25; }
        }
        @keyframes searchCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          20%, 80% { opacity: 0.45; transform: translateY(-6px); }
        }
        @keyframes processingFadeIn {
          0% { opacity: 0; transform: translateY(24px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <Footer />
    </div>
  );
}
