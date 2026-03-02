import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { nip19 } from "nostr-tools";
import {
  Home,
  LogOut,
  Menu,
  X,
  Loader2,
  Copy,
  Check,
  Settings as SettingsIcon,
  BookOpen,
  ArrowLeft,
  ChevronDown,
  Search as SearchIcon,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
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

const RiskAdvisoryIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 3l9 16H3L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.08" />
    <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </svg>
);

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/profile/:npub");
  const npubParam = params?.npub || "";

  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [profileResult, setProfileResult] = useState<any>(null);
  const [nostrProfile, setNostrProfile] = useState<{ name?: string; display_name?: string; picture?: string; nip05?: string; about?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const [selfData, setSelfData] = useState<any>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [sectionVisibleCount, setSectionVisibleCount] = useState<Record<string, number>>({});
  const expandProfileCache = useRef<Map<string, any>>(new Map());
  const expandTrustCache = useRef<Map<string, number | null>>(new Map());
  const [forceRender, setForceRender] = useState(0);

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

    const urlParams = new URLSearchParams(window.location.search);
    const group = urlParams.get("fromGroup");
    if (group) setFromGroup(group);
  }, [navigate]);

  useEffect(() => {
    if (user) {
      apiClient.getSelf().then(res => {
        if (res?.data) setSelfData(res.data);
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user || !npubParam) return;

    let hexPubkey: string;
    try {
      if (/^npub1[02-9ac-hj-np-z]{20,}$/i.test(npubParam)) {
        const decoded = nip19.decode(npubParam);
        if (decoded.type !== "npub" || typeof decoded.data !== "string") {
          setLoadError("Invalid npub format");
          setIsLoading(false);
          return;
        }
        hexPubkey = decoded.data;
      } else if (/^[0-9a-f]{64}$/i.test(npubParam)) {
        hexPubkey = npubParam.toLowerCase();
      } else {
        setLoadError("Invalid profile identifier");
        setIsLoading(false);
        return;
      }
    } catch {
      setLoadError("Could not decode this npub");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setProfileResult(null);
    setNostrProfile(null);
    setLoadError(null);
    setExpandedSections({});
    setSectionVisibleCount({});
    expandProfileCache.current.clear();
    expandTrustCache.current.clear();

    apiClient.getUserByPubkey(hexPubkey)
      .then(res => {
        setProfileResult(res?.data || null);
        if (!res?.data) {
          setLoadError("No profile data found for this identity on the Brainstorm backend.");
        }
      })
      .catch(() => {
        setLoadError("No profile data found for this identity on the Brainstorm backend.");
      })
      .finally(() => {
        setIsLoading(false);
      });

    fetchProfile(hexPubkey)
      .then(profile => {
        if (profile) setNostrProfile(profile as any);
      })
      .catch(() => {});
  }, [user, npubParam]);

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
    if (toFetch.length === 0) return;
    const profilePubkeys = toFetch.filter(pk => !expandProfileCache.current.has(pk));
    const trustPubkeys = toFetch.filter(pk => !expandTrustCache.current.has(pk));
    const missingProfiles: string[] = [];
    for (const pk of profilePubkeys) {
      const event = eventStore.getReplaceable(0, pk);
      if (event) {
        if (isValidProfile(event)) expandProfileCache.current.set(pk, getProfileContent(event));
      } else {
        missingProfiles.push(pk);
      }
    }
    if (fetchAbortRef.current !== fetchId) return;
    if (missingProfiles.length > 0 || trustPubkeys.length > 0) {
      setForceRender(c => c + 1);
    }
    await Promise.allSettled([
      ...(missingProfiles.length > 0 ? [fetchProfiles(missingProfiles, (pubkey, profile) => {
        expandProfileCache.current.set(pubkey, profile);
        setForceRender(c => c + 1);
      })] : []),
      ...trustPubkeys.map(pk =>
        apiClient.getUserByPubkey(pk)
          .then(resp => expandTrustCache.current.set(pk, resp?.data?.influence ?? null))
          .catch(() => expandTrustCache.current.set(pk, null))
      ),
    ]);
    if (fetchAbortRef.current !== fetchId) return;
    setForceRender(c => c + 1);
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

  const navigateToProfile = (pk: string) => {
    const targetNpub = nip19.npubEncode(pk);
    navigate(`/profile/${targetNpub}${fromGroup ? `?fromGroup=${fromGroup}` : ""}`);
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
                onClick={() => navigateToProfile(pk)}
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

  const handleCopyNpub = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const displayNpub = useMemo(() => {
    if (/^npub1/.test(npubParam)) return npubParam;
    try { return nip19.npubEncode(npubParam); } catch { return npubParam; }
  }, [npubParam]);

  if (!user) return null;

  const truncatedNpub = user.npub.slice(0, 12) + "..." + user.npub.slice(-6);

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden"
      data-testid="page-profile"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.28] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/30 blur-[130px]" style={{ animation: "profileBlobA 28s ease-in-out infinite" }} />
        <div className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/20 blur-[150px]" style={{ animation: "profileBlobB 32s ease-in-out infinite 2s" }} />
      </div>

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-profile">
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
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/search")}
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
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/dashboard"); }}
                  data-testid="button-mobile-nav-dashboard"
                >
                  <Home className="h-5 w-5 text-slate-200/80" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/search"); }}
                  data-testid="button-mobile-nav-search"
                >
                  <SearchIcon className="h-5 w-5 text-slate-200/80" />
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
        <div className="flex items-center gap-2 mb-6">
          {fromGroup ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50/60 -ml-1 no-default-hover-elevate no-default-active-elevate"
              onClick={() => navigate(`/network?group=${fromGroup}`)}
              data-testid="button-back-to-network"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Network
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50/60 -ml-1 no-default-hover-elevate no-default-active-elevate"
              onClick={() => navigate("/search")}
              data-testid="button-back-to-search"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Button>
          )}
        </div>

        {isLoading && (
          <div data-testid="panel-profile-skeleton">
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

        {!isLoading && loadError && (
          <div style={{ animation: "profileFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative" data-testid="card-profile-error">
              <div className="p-7 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl blur-md opacity-70 bg-gradient-to-br from-indigo-500/40 to-indigo-800/25" />
                  <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border border-slate-200 bg-slate-50 text-indigo-800 shadow-sm flex items-center justify-center" data-testid="icon-profile-error">
                    <User className="h-6 w-6" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold tracking-wider uppercase text-slate-400">Profile</p>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Profile not found
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{loadError}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => navigate("/search")}
                      className="h-10 rounded-xl px-4 font-bold tracking-wide text-xs shadow-sm bg-[#3730a3] hover:bg-[#312e81] text-white"
                      data-testid="button-profile-new-search"
                    >
                      New Search
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {!isLoading && !loadError && profileResult && (
          <div style={{ animation: "profileFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative" data-testid="card-profile-result">
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
                        style={{ strokeDasharray: len, strokeDashoffset: len, ['--dash' as string]: len, animation: `profileLineDraw 1.8s ${0.3 + i * 0.1}s ease-out forwards, profileLinePulse 6s ${2.5 + i * 0.25}s ease-in-out infinite` }} />
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
                      style={{ animation: `profileNodePop 0.6s ${n.delay}s ease-out forwards, profileNodeFloat ${5 + (i % 3) * 2}s ${2 + n.delay}s ease-in-out infinite` }} />
                  ))}
                </svg>

                <div className="relative z-10">
                <div className="flex items-start gap-3 sm:gap-4 mb-5">
                  <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-indigo-100 shadow-md shrink-0">
                    {nostrProfile?.picture && <AvatarImage src={nostrProfile.picture} alt={nostrProfile?.display_name || nostrProfile?.name || "Profile"} className="object-cover" />}
                    <AvatarFallback className="bg-indigo-50 text-indigo-600 text-base sm:text-lg font-bold">
                      {(nostrProfile?.display_name || nostrProfile?.name || displayNpub.slice(0, 2)).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }} data-testid="text-profile-title">
                            {nostrProfile?.display_name || nostrProfile?.name || displayNpub.slice(0, 18) + "..."}
                          </h3>
                          <Badge variant="secondary" className="text-[10px] font-bold tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-100" data-testid="badge-profile-found">
                            Profile Found
                          </Badge>
                        </div>
                        {nostrProfile?.nip05 && (
                          <p className="text-xs sm:text-xs text-indigo-600 font-medium mt-0.5 truncate" data-testid="text-profile-nip05">{nostrProfile.nip05}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <code className="text-xs text-slate-400 font-mono truncate max-w-[120px] sm:max-w-[300px]" data-testid="text-profile-npub">{displayNpub}</code>
                          <button onClick={() => handleCopyNpub(displayNpub)} className="p-0.5 text-slate-400 hover:text-indigo-500 transition-colors shrink-0" data-testid="button-copy-profile-npub">
                            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
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
                  <div className="mb-4 overflow-hidden" data-testid="text-profile-about">
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
                              data-testid="metric-profile-followers"
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
                                <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-profile-followers">
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
                              data-testid="metric-profile-following"
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
                                <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-profile-following">
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
                              data-testid="metric-profile-mutual"
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
                                <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-profile-mutual">
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
                          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group cursor-help" title="Score from 0-1 based on social graph position. Higher means more connected to well-connected people." data-testid="metric-profile-influence">
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
                              <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-profile-influence">
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
                              data-testid="metric-profile-muted-by"
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
                                <p className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${mutedByCount > 0 ? "text-amber-700" : "text-slate-900"}`} data-testid="text-profile-muted-by">
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
                              data-testid="metric-profile-reported-by"
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
                                <p className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${reportedByCount > 0 ? "text-red-600" : "text-slate-900"}`} data-testid="text-profile-reported-by">
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
                              data-testid="metric-profile-muting"
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
                                <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-profile-muting">
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
                              data-testid="metric-profile-reporting"
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
                                <p className="text-lg sm:text-xl font-bold text-slate-900 font-mono tabular-nums tracking-tight" data-testid="text-profile-reporting">
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
                      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/50 overflow-hidden" data-testid="alert-profile-trust-warning">
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
                  <summary className="text-xs text-slate-400 font-medium uppercase tracking-wide cursor-pointer hover:text-slate-600 transition-colors" data-testid="button-profile-raw">Raw API Data</summary>
                  <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100 overflow-auto max-h-48 font-mono mt-2" data-testid="text-profile-raw">
                    {JSON.stringify(profileResult, null, 2)}
                  </pre>
                </details>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/search")}
                    className="h-10 rounded-xl px-4 border-slate-200 bg-white"
                    data-testid="button-profile-new-search"
                  >
                    New Search
                  </Button>
                </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      <style>{`
        @keyframes profileBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(15px) scale(1.03); }
        }
        @keyframes profileBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-20px) scale(1.05); }
        }
        @keyframes profileLineDraw {
          0% { stroke-dashoffset: var(--dash); opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0.18; }
        }
        @keyframes profileLinePulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.2; }
        }
        @keyframes profileNodePop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 0.25; transform: scale(1.15); }
          100% { opacity: 0.18; transform: scale(1); }
        }
        @keyframes profileNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-12px); opacity: 0.25; }
        }
        @keyframes profileFadeIn {
          0% { opacity: 0; transform: translateY(24px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <Footer />
    </div>
  );
}
