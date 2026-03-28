import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  Search as SearchIcon,
  Users,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  List,
  Loader2,
  ChevronRight,
  Inbox,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getCurrentUser,
  logout,
  fetchProfile,
  fetchOutboxRelayList,
  applyProfileToUser,
  updateCurrentUser,
  fetchDListHeaders,
  fetchDListItems,
  fetchGrapeRankScores,
  type NostrUser,
} from "@/services/nostr";
import { apiClient } from "@/services/api";

function formatAge(ts: number): string {
  if (!ts) return "";
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ListsPage() {
  const [location, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, { name: string; picture?: string; nip05?: string }>>({});
  const [authorTrustScores, setAuthorTrustScores] = useState<Record<string, number | null>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("newest");

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

  const listsQuery = useQuery({
    queryKey: ["dcosl-lists"],
    queryFn: () => fetchDListHeaders(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const lists = listsQuery.data || [];

  const exampleList = useMemo(() => {
    return lists.find(l => {
      const namePlural = (l.namePlural || "").toLowerCase();
      const name = (l.name || "").toLowerCase();
      return namePlural.includes("dwarf") || namePlural.includes("dwarves") ||
             name.includes("dwarf") || name.includes("dwarves");
    }) || null;
  }, [lists]);

  const filteredAndSorted = useMemo(() => {
    let filtered = searchTerm.trim()
      ? lists
      : lists.filter(l => !exampleList || l.aTag !== exampleList.aTag);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(l => {
        const name = (l.namePlural || l.name || "").toLowerCase();
        const desc = (l.description || "").toLowerCase();
        const authorName = (authorProfiles[l.pubkey]?.name || "").toLowerCase();
        return name.includes(q) || desc.includes(q) || authorName.includes(q);
      });
    }
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return (a.createdAt || 0) - (b.createdAt || 0);
        case "most_items":
          return (itemCounts[b.aTag] ?? 0) - (itemCounts[a.aTag] ?? 0);
        case "most_trusted":
          return (authorTrustScores[b.pubkey] ?? -1) - (authorTrustScores[a.pubkey] ?? -1);
        case "name_az":
          return (a.namePlural || a.name || "").localeCompare(b.namePlural || b.name || "");
        case "name_za":
          return (b.namePlural || b.name || "").localeCompare(a.namePlural || a.name || "");
        case "newest":
        default:
          return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });
  }, [lists, searchTerm, sortKey, itemCounts, authorProfiles, authorTrustScores, exampleList]);

  useEffect(() => {
    if (lists.length === 0) return;
    let cancelled = false;

    async function loadItemCounts() {
      const results = await Promise.allSettled(
        lists.map(list => fetchDListItems(list.aTag).then(items => ({ aTag: list.aTag, count: items.length })))
      );
      if (cancelled) return;
      const counts: Record<string, number> = {};
      for (const r of results) {
        if (r.status === "fulfilled") counts[r.value.aTag] = r.value.count;
      }
      setItemCounts(counts);
    }

    loadItemCounts();
    return () => { cancelled = true; };
  }, [lists]);

  useEffect(() => {
    if (lists.length === 0) return;
    let cancelled = false;

    async function loadAuthorProfiles() {
      const uniquePubkeys = [...new Set(lists.map(l => l.pubkey))];
      const results = await Promise.allSettled(
        uniquePubkeys.map(async pk => {
          const content = await fetchProfile(pk);
          const fallback = nip19.npubEncode(pk).slice(0, 12) + "...";
          if (content) {
            return { pk, name: content.display_name || content.name || fallback, picture: content.picture || content.image, nip05: content.nip05 };
          }
          return { pk, name: fallback, picture: undefined, nip05: undefined };
        })
      );
      if (cancelled) return;
      const profiles: Record<string, { name: string; picture?: string; nip05?: string }> = {};
      for (const r of results) {
        if (r.status === "fulfilled") profiles[r.value.pk] = { name: r.value.name, picture: r.value.picture, nip05: r.value.nip05 };
      }
      setAuthorProfiles(profiles);
    }

    loadAuthorProfiles();
    return () => { cancelled = true; };
  }, [lists]);

  useEffect(() => {
    if (lists.length === 0 || !user?.pubkey) return;
    let cancelled = false;

    async function loadAuthorTrustScores() {
      const uniquePubkeys = [...new Set(lists.map(l => l.pubkey))];
      try {
        await fetchOutboxRelayList(user!.pubkey);
        const scores = await fetchGrapeRankScores(user!.pubkey, uniquePubkeys);
        if (cancelled) return;
        const result: Record<string, number | null> = {};
        for (const pk of uniquePubkeys) {
          result[pk] = scores.has(pk) ? scores.get(pk)! : null;
        }
        setAuthorTrustScores(result);
      } catch {
        if (!cancelled) {
          const result: Record<string, number | null> = {};
          for (const pk of [...new Set(lists.map(l => l.pubkey))]) {
            result[pk] = null;
          }
          setAuthorTrustScores(result);
        }
      }
    }

    loadAuthorTrustScores();
    return () => { cancelled = true; };
  }, [lists, user?.pubkey]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";

  if (!user) return null;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 overflow-hidden">
      <PageBackground />

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-lists">
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
                <Button variant="ghost" size="sm" className="gap-2 text-white bg-white/[0.12] rounded-md no-default-hover-elevate no-default-active-elevate" data-testid="button-nav-lists">
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
        <div className="mb-8 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />
          <div className="flex flex-col items-start gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm" data-testid="pill-lists-kicker">
              <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
              <span className="text-xs font-bold tracking-[0.15em] text-indigo-900 uppercase">Curated Lists</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight relative" style={{ fontFamily: "var(--font-display)" }} data-testid="text-page-title">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block">
                Community Curation
              </span>
            </h1>
            <p className="text-slate-500 text-xs md:text-sm max-w-xl leading-relaxed font-light" data-testid="text-page-subtitle">
              Discover what your trusted network recommends.
            </p>
          </div>
        </div>

        {listsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" data-testid="loading-lists">
            <div className="p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
              <Loader2 className="h-8 w-8 text-[#7c86ff] animate-spin" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Fetching lists from relay...</p>
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="empty-lists">
            <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
              <Inbox className="h-8 w-8 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900 mb-1" style={{ fontFamily: "var(--font-display)" }}>No lists available</p>
              <p className="text-sm text-slate-500 max-w-md">
                No decentralized lists were found on the DCoSL relay. Lists will appear here as they are created by the community.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6 p-3 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200/60 shadow-sm" data-testid="toolbar-lists">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  placeholder="Search lists by name, description, or author..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 bg-white/80 border-slate-200 text-sm placeholder:text-slate-400 focus-visible:ring-[#7c86ff]/30 focus-visible:border-[#7c86ff]/40"
                  data-testid="input-search-lists"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <Select value={sortKey} onValueChange={setSortKey}>
                    <SelectTrigger className="h-9 w-[160px] bg-white/80 border-slate-200 text-sm focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40" data-testid="select-sort-lists">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white/95 backdrop-blur-xl border-slate-200 shadow-xl">
                      <SelectItem value="newest" data-testid="sort-newest">Newest First</SelectItem>
                      <SelectItem value="oldest" data-testid="sort-oldest">Oldest First</SelectItem>
                      <SelectItem value="most_items" data-testid="sort-most-items">Most Items</SelectItem>
                      <SelectItem value="most_trusted" data-testid="sort-most-trusted">Most Trusted</SelectItem>
                      <SelectItem value="name_az" data-testid="sort-name-az">Name (A–Z)</SelectItem>
                      <SelectItem value="name_za" data-testid="sort-name-za">Name (Z–A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {searchTerm.trim() && (
                  <span className="text-xs text-slate-400 font-medium whitespace-nowrap" data-testid="text-results-count">
                    {filteredAndSorted.length} of {lists.length} {lists.length === 1 ? "list" : "lists"}
                  </span>
                )}
              </div>
            </div>

            {exampleList && !searchTerm.trim() && (() => {
              const exAuthor = authorProfiles[exampleList.pubkey];
              const exCount = itemCounts[exampleList.aTag];
              const exIdEncoded = encodeURIComponent(exampleList.aTag);
              return (
                <div className="mb-6" data-testid="pinned-example-card">
                  <Card
                    className="group relative overflow-hidden bg-gradient-to-br from-white/95 via-white/80 to-emerald-50/40 backdrop-blur-xl border-emerald-400/30 shadow-[0_0_20px_rgba(16,185,129,0.08)] hover:shadow-[0_20px_40px_-12px_rgba(16,185,129,0.2)] hover:border-emerald-400/50 hover:-translate-y-1 transition-all duration-500 cursor-pointer rounded-xl"
                    onClick={() => navigate(`/lists/${exIdEncoded}`)}
                    data-testid={`card-example-${exampleList.dTag || exampleList.id.slice(0, 8)}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-400 animate-gradient-x absolute top-0 left-0" />
                    <CardContent className="p-5 pt-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/30" data-testid="badge-example">
                              <Sparkles className="h-3 w-3 text-emerald-600" />
                              <span className="text-[10px] font-bold tracking-[0.1em] text-emerald-700 uppercase">Example</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="p-1 rounded-md bg-emerald-600/8 text-emerald-700">
                              <List className="h-3.5 w-3.5" />
                            </div>
                            <h3 className="text-base font-bold text-slate-900 truncate" style={{ fontFamily: "var(--font-display)" }} data-testid="text-example-list-name">
                              {exampleList.namePlural || exampleList.name}
                            </h3>
                          </div>
                          {exampleList.description && (
                            <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed mb-2" data-testid="text-example-list-desc">
                              {exampleList.description}
                            </p>
                          )}
                          <p className="text-xs text-emerald-600/80 leading-relaxed" data-testid="text-example-helper">
                            Pre-built demo with 14 dwarves (7 spam), test accounts with bad actors, and community reactions. Explore all 4 trust methods.
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-emerald-300 group-hover:text-emerald-500 transition-colors shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-emerald-100/60">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative shrink-0">
                            {exAuthor?.picture ? (
                              <Avatar className="h-7 w-7 border border-slate-200">
                                <AvatarImage src={exAuthor.picture} alt={exAuthor.name} className="object-cover" />
                                <AvatarFallback className="bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                  {(exAuthor.name || "?").charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                                <span className="text-[10px] text-emerald-700 font-bold">{(exAuthor?.name || "?").charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs text-slate-600 truncate block max-w-[130px] font-medium" data-testid="text-example-author">
                              {exAuthor?.name || nip19.npubEncode(exampleList.pubkey).slice(0, 12) + "..."}
                            </span>
                            {exAuthor?.nip05 && (
                              <span className="text-[10px] text-emerald-500 truncate block max-w-[130px]" data-testid="text-example-nip05">
                                {exAuthor.nip05}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
                          {exCount !== undefined ? (
                            <span className="font-mono tabular-nums text-emerald-700 font-semibold" data-testid="text-example-count">
                              {exCount} {exCount === 1 ? "item" : "items"}
                            </span>
                          ) : (
                            <Loader2 className="h-3 w-3 animate-spin text-emerald-300" />
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-400" data-testid="text-example-age">
                            {formatAge(exampleList.createdAt)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {filteredAndSorted.length === 0 && searchTerm.trim() && (
              <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="empty-search-results">
                <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                  <SearchIcon className="h-8 w-8 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-900 mb-1" style={{ fontFamily: "var(--font-display)" }}>No lists match your search</p>
                  <p className="text-sm text-slate-500 max-w-md">
                    Try adjusting your search term or clearing the filter.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={() => setSearchTerm("")}
                  data-testid="button-clear-search"
                >
                  Clear search
                </Button>
              </div>
            )}

            {filteredAndSorted.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2" data-testid="grid-lists">
                {filteredAndSorted.map((list) => {
                  const author = authorProfiles[list.pubkey];
                  const count = itemCounts[list.aTag];
                  const listIdEncoded = encodeURIComponent(list.aTag);
                  return (
                    <Card
                      key={list.aTag}
                      className="group relative overflow-hidden bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 cursor-pointer rounded-xl"
                      onClick={() => navigate(`/lists/${listIdEncoded}`)}
                      data-testid={`card-list-${list.dTag || list.id.slice(0, 8)}`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x absolute top-0 left-0" />
                      <CardContent className="p-5 pt-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="p-1 rounded-md bg-[#333286]/8 text-[#333286]">
                                <List className="h-3.5 w-3.5" />
                              </div>
                              <h3 className="text-base font-bold text-slate-900 truncate" style={{ fontFamily: "var(--font-display)" }} data-testid={`text-list-name-${list.dTag || list.id.slice(0, 8)}`}>
                                {list.namePlural || list.name}
                              </h3>
                            </div>
                            {list.description && (
                              <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed" data-testid={`text-list-desc-${list.dTag || list.id.slice(0, 8)}`}>
                                {list.description}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-[#7c86ff] transition-colors shrink-0 mt-1" />
                        </div>
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative shrink-0">
                              {author?.picture ? (
                                <Avatar className="h-7 w-7 border border-slate-200">
                                  <AvatarImage src={author.picture} alt={author.name} className="object-cover" />
                                  <AvatarFallback className="bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                                    {(author.name || "?").charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                  <span className="text-[10px] text-indigo-700 font-bold">{(author?.name || "?").charAt(0).toUpperCase()}</span>
                                </div>
                              )}
                              {(() => {
                                const trustScore = authorTrustScores[list.pubkey];
                                if (trustScore === undefined) return null;
                                if (trustScore === null) return null;
                                const clampedScore = Math.min(1, Math.max(0, trustScore));
                                const pct = Math.round(clampedScore * 100);
                                const ringColor = pct >= 50 ? "stroke-emerald-500" : pct >= 20 ? "stroke-indigo-500" : pct >= 7 ? "stroke-orange-300" : "stroke-amber-500";
                                const circumference = 2 * Math.PI * 10;
                                const offset = circumference - (clampedScore * circumference);
                                return (
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center cursor-help shadow-sm" data-testid={`badge-trust-${list.dTag || list.id.slice(0, 8)}`}>
                                        <svg className="w-3.5 h-3.5 -rotate-90" viewBox="0 0 24 24">
                                          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-100" />
                                          <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.5" strokeLinecap="round"
                                            className={ringColor} style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
                                        </svg>
                                        <span className="absolute text-[6px] font-bold font-mono text-indigo-700">{pct}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-2.5 max-w-[220px]">
                                      <p className="text-xs font-semibold text-slate-900 mb-0.5">Curator Trust Score: {pct}%</p>
                                      <p className="text-[11px] leading-relaxed text-slate-500">
                                        {pct >= 50 ? "High confidence — this curator is well-trusted in your network."
                                          : pct >= 20 ? "Moderate confidence — some trust signals from your network."
                                          : pct >= 7 ? "Low confidence — limited trust signals from your network."
                                          : "Very low confidence — exercise caution."}
                                      </p>
                                    </TooltipContent>
                                  </UITooltip>
                                );
                              })()}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs text-slate-600 truncate block max-w-[130px] font-medium" data-testid={`text-list-author-${list.dTag || list.id.slice(0, 8)}`}>
                                {author?.name || nip19.npubEncode(list.pubkey).slice(0, 12) + "..."}
                              </span>
                              {author?.nip05 && (
                                <span className="text-[10px] text-indigo-500 truncate block max-w-[130px]" data-testid={`text-nip05-${list.dTag || list.id.slice(0, 8)}`}>
                                  {author.nip05}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
                            {count !== undefined ? (
                              <span className="font-mono tabular-nums text-[#333286] font-semibold" data-testid={`text-list-count-${list.dTag || list.id.slice(0, 8)}`}>
                                {count} {count === 1 ? "item" : "items"}
                              </span>
                            ) : (
                              <Loader2 className="h-3 w-3 animate-spin text-indigo-300" />
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400" data-testid={`text-list-age-${list.dTag || list.id.slice(0, 8)}`}>
                              {formatAge(list.createdAt)}
                            </span>
                          </div>
                        </div>
                        {list.propertyTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                            {list.propertyTags.slice(0, 4).map((pt, i) => (
                              <span
                                key={i}
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                                  pt.requirement === "required"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : pt.requirement === "recommended"
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-slate-50 text-slate-500 border-slate-200"
                                }`}
                                data-testid={`badge-property-${i}`}
                              >
                                {pt.value}
                              </span>
                            ))}
                            {list.propertyTags.length > 4 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200 font-medium">
                                +{list.propertyTags.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
