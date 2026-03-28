import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Button } from "@/components/ui/button";
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
  Home,
  Search,
  Users,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  List,
  Loader2,
  ChevronRight,
  Inbox,
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
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, { name: string; picture?: string }>>({});

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
            return { pk, name: content.display_name || content.name || fallback, picture: content.picture || content.image };
          }
          return { pk, name: fallback, picture: undefined };
        })
      );
      if (cancelled) return;
      const profiles: Record<string, { name: string; picture?: string }> = {};
      for (const r of results) {
        if (r.status === "fulfilled") profiles[r.value.pk] = { name: r.value.name, picture: r.value.picture };
      }
      setAuthorProfiles(profiles);
    }

    loadAuthorProfiles();
    return () => { cancelled = true; };
  }, [lists]);

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
                  <Search className="h-4 w-4" />
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
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anonymous"}</p>
                      <p className="text-xs leading-none text-slate-500">{truncatedNpub}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate(`/profile/${user.npub}`)} data-testid="menuitem-profile">
                    <Users className="h-4 w-4" /> My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate("/faq")} data-testid="menuitem-faq">
                    <HelpCircle className="h-4 w-4" /> FAQ
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate("/settings")} data-testid="menuitem-settings">
                    <SettingsIcon className="h-4 w-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer gap-2 text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="menuitem-logout">
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
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm text-[#333286]">
              <List className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-page-title">
                Curated Lists
              </h2>
              <p className="text-sm text-slate-500" data-testid="text-page-subtitle">
                Decentralized lists curated by the Nostr community
              </p>
            </div>
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
          <div className="grid gap-5 sm:grid-cols-2" data-testid="grid-lists">
            {lists.map((list) => {
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
                      <div className="flex items-center gap-2">
                        {author?.picture ? (
                          <Avatar className="h-6 w-6 border border-slate-200">
                            <AvatarImage src={author.picture} alt={author.name} className="object-cover" />
                            <AvatarFallback className="bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                              {(author.name || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                            <span className="text-[10px] text-indigo-700 font-bold">{(author?.name || "?").charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-xs text-slate-500 truncate max-w-[120px] font-medium" data-testid={`text-list-author-${list.dTag || list.id.slice(0, 8)}`}>
                          {author?.name || nip19.npubEncode(list.pubkey).slice(0, 12) + "..."}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400">
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
      </main>

      <Footer />
    </div>
  );
}
