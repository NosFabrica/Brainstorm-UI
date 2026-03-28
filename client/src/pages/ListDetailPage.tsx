import { useEffect, useState, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  Inbox,
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
  type DListHeader,
  type DListItem,
} from "@/services/nostr";
import { apiClient } from "@/services/api";

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

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";

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
                <Search className="h-4 w-4" />
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
            <div className="mb-8">
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
              <div className="space-y-2" data-testid="list-items">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-400" data-testid="text-items-count">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </p>
                </div>

                {items.map((item) => (
                  <div
                    key={item.aTag}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                    data-testid={`row-item-${item.dTag || item.id.slice(0, 8)}`}
                  >
                    <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <span className="text-xs text-indigo-300 font-bold">
                        {(item.name || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate" data-testid={`text-item-name-${item.dTag || item.id.slice(0, 8)}`}>
                        {item.name || item.content?.slice(0, 50) || "Unnamed item"}
                      </p>
                      {item.content && item.content !== item.name && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {item.content.slice(0, 80)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                <div className="mt-8 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainLogo size={16} className="text-indigo-400" />
                    <p className="text-sm font-semibold text-indigo-300">Reactions & Trust Weighting</p>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Trust-weighted reactions and curation controls are coming in the next update. You'll be able to see how the community rates each item through the lens of your personal Web of Trust.
                  </p>
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
