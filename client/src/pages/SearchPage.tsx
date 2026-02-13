import { useState, useEffect } from "react";
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
  Users,
  ShieldAlert,
  VolumeX,
  Flag,
  TrendingUp,
  ExternalLink,
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
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";

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

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/");
      return;
    }
    setUser(u);
  }, [navigate]);

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

  const isLikelyNpub = (value: string) =>
    /^npub1[02-9ac-hj-np-z]{20,}$/i.test(value.trim());

  const handleSearch = async () => {
    const q = (npub || keyword || "").trim();

    setSearchError(null);
    setHasSearched(false);
    setProfileResult(null);
    setNostrProfile(null);
    setAboutExpanded(false);

    if (!q) {
      setSearchError({
        code: "MISSING_QUERY",
        title: "Enter a search value",
        message:
          activeTab === "npub"
            ? "Paste an npub to look up a profile."
            : "Type a keyword to search identities.",
      });
      return;
    }

    if (activeTab === "npub" && !isLikelyNpub(q)) {
      setSearchError({
        code: "INVALID_NPUB",
        title: "That doesn\u2019t look like a valid npub",
        message: 'Npubs start with "npub1\u2026" and are Bech32-encoded.',
      });
      return;
    }

    let hexPubkey: string;
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

    setSearchQuery(q);
    setIsSearching(true);
    setNostrProfile(null);

    try {
      const [graphRes, profileRes] = await Promise.allSettled([
        apiClient.getUserByPubkey(hexPubkey),
        fetch(`/api/profile/${hexPubkey}`).then(r => r.json()),
      ]);

      const graphData = graphRes.status === "fulfilled" ? graphRes.value?.data : null;
      setProfileResult(graphData || null);

      if (profileRes.status === "fulfilled" && profileRes.value?.event) {
        try {
          const meta = JSON.parse(profileRes.value.event.content);
          setNostrProfile(meta);
        } catch {
          setNostrProfile(null);
        }
      }

      setHasSearched(true);
      if (!graphData) {
        setSearchError({
          code: "NOT_FOUND",
          title: "No profile found",
          message: "We couldn\u2019t find data for that npub on the Brainstorm backend.",
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
              className="absolute text-[11px] font-mono text-indigo-400/50 select-none whitespace-nowrap"
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
                      <span className="text-[10px] text-indigo-300 font-mono leading-none">
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
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-mobile-menu-kicker">Brainstorm</p>
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

            <div className="relative flex-1 overflow-y-auto py-4 px-3 space-y-6">
              <div className="space-y-2">
                <p className="px-3 text-[10px] font-semibold text-slate-300/70 uppercase tracking-[0.22em]">Navigation</p>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-[15px] font-semibold text-white bg-white/10 border border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/dashboard"); }}
                  data-testid="button-mobile-nav-dashboard"
                >
                  <Home className="h-5 w-5 text-indigo-200" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-[15px] font-medium text-white bg-white/10 border border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="button-mobile-nav-search"
                >
                  <SearchIcon className="h-5 w-5 text-indigo-200" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-[15px] font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/settings"); }}
                  data-testid="button-mobile-nav-settings"
                >
                  <SettingsIcon className="h-5 w-5 text-slate-200/80" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-[15px] font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/what-is-wot"); }}
                  data-testid="button-mobile-nav-wot"
                >
                  <BookOpen className="h-5 w-5 text-slate-200/80" />
                  What is WoT?
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
        <div className="space-y-8 animate-fade-up">
          <div className="text-left relative z-10 mb-8 pt-2" data-testid="section-search-header">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />
            <div className="flex flex-col items-start gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm" data-testid="pill-search-kicker">
                <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
                <span className="text-[9px] font-bold tracking-[0.15em] text-indigo-900 uppercase">Profile Search</span>
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
              <CardHeader className="bg-gradient-to-b from-indigo-500/15 to-white/60 border-b border-indigo-500/10 py-4 px-5">
                <div className="flex flex-row flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-sm text-indigo-800 ring-1 ring-slate-100">
                      <EnterpriseSearchIcon className="h-4 w-4" />
                    </div>
                    <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                      <CardTitle className="text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Profile Discovery</CardTitle>
                      <CardDescription className="text-slate-500 text-[10px] font-medium uppercase tracking-wide">Trust Search</CardDescription>
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-full bg-indigo-500/10 text-[10px] font-bold text-indigo-900 border border-indigo-500/20 uppercase tracking-wider flex items-center gap-1.5 shrink-0" data-testid="badge-nostr">
                    <img src="/nostr-ostrich.gif" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                    <span>NOSTR</span>
                  </div>
                </div>

                <TabsList className="mt-6 w-full grid grid-cols-2 h-auto p-1 bg-slate-100/50 rounded-lg border border-slate-200/50" data-testid="tabs-search-mode">
                  <TabsTrigger
                    value="npub"
                    className="data-[state=active]:bg-white data-[state=active]:text-indigo-800 data-[state=active]:shadow-sm data-[state=active]:border-slate-200 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-500 transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5"
                    data-testid="tab-npub"
                  >
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>
                      <span className="lg:hidden">Npub</span>
                      <span className="hidden lg:inline">Public Key</span>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="keyword"
                    disabled
                    className="data-[state=active]:bg-white data-[state=active]:text-indigo-800 data-[state=active]:shadow-sm data-[state=active]:border-slate-200 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-400 transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 opacity-70 cursor-not-allowed"
                    data-testid="tab-keyword-coming-soon"
                  >
                    <SearchIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="inline-flex items-center gap-2">
                      <span>
                        <span className="lg:hidden">Keyword</span>
                        <span className="hidden lg:inline">Keyword Search</span>
                      </span>
                      <span className="rounded-full bg-indigo-800 text-white border border-indigo-800/40 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase shadow-sm">
                        Coming soon
                      </span>
                    </span>
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="space-y-4 p-5 bg-white/60 min-h-[180px]">
                <TabsContent value="npub" className="mt-0 focus-visible:outline-none data-[state=inactive]:hidden">
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-800">
                        <EnterpriseUserIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-700" data-testid="text-npub-section-title">Npub Lookup</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Enter a Bech32-encoded public key</p>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1 group/input">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-indigo-800 rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500" />
                        <Input
                          placeholder="npub1..."
                          className={
                            "relative bg-white/90 backdrop-blur-sm border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)] text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 h-11 rounded-lg transition-all font-mono text-sm shadow-sm focus:shadow-[0_0_20px_rgba(99,102,241,0.2)]" +
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
                        className="h-11 px-6 bg-indigo-800 hover:bg-indigo-900 text-white shadow-lg shadow-indigo-800/20 font-bold tracking-wide text-xs"
                        data-testid="button-npub-lookup"
                      >
                        {isSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
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
                          <p className="text-[11px] font-bold text-red-900" data-testid="text-search-invalid-npub-title">{searchError.title}</p>
                          <p className="text-[11px] text-red-800/80" data-testid="text-search-invalid-npub-body">{searchError.message}</p>
                        </div>
                      </div>
                    )}

                    {searchError?.code === "MISSING_QUERY" && (
                      <div className="-mt-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2" data-testid="alert-search-missing-query">
                        <div className="mt-0.5 h-5 w-5 rounded-full bg-amber-600/10 text-amber-700 flex items-center justify-center shrink-0">
                          <Info className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-amber-900" data-testid="text-search-missing-title">{searchError.title}</p>
                          <p className="text-[11px] text-amber-800/80" data-testid="text-search-missing-body">{searchError.message}</p>
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
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Find profiles by name, NIP-05, or attributes</p>
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
                      <Button disabled className="h-11 px-6 bg-indigo-800 text-white font-bold tracking-wide text-xs opacity-50" data-testid="button-keyword-lookup">
                        LOOKUP
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {isSearching && (
            <div className="overflow-hidden" data-testid="panel-search-processing">
              <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 border border-indigo-500/30 shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/40 via-violet-900/40 to-slate-900/40 backdrop-blur-md" />
                <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(to right, #6366f1 1px, transparent 1px), linear-gradient(to bottom, #6366f1 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute top-0 bottom-0 w-1 bg-indigo-500/50 blur-[4px]" style={{ animation: "searchScanLine 2s linear infinite" }} />
                <div className="relative z-10 p-8 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 border border-indigo-500/20">
                    <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 tracking-tight" data-testid="text-search-processing-title">Analyzing Trust Signals...</h3>
                  <p className="text-indigo-200/60 text-sm font-mono mb-6" data-testid="text-search-processing-subtitle">Querying Decentralized Identity Network</p>
                  <div className="w-full max-w-md bg-slate-800/50 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" style={{ animation: "searchProgressBar 1.5s ease-out forwards" }} />
                  </div>
                  <div className="mt-6 text-xs text-indigo-300/60 font-mono border-t border-indigo-500/10 pt-4 w-full flex items-center justify-center">
                    <span data-testid="text-search-processing-query">Query: <span className="text-indigo-200">{searchQuery || "..."}</span></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isSearching && hasSearched && (
            <div className="mt-6" data-testid="panel-search-result">
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
                              : "bg-indigo-800 hover:bg-indigo-900 text-white")
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
                        <p className="text-[11px] text-slate-600">
                          Tip: if this is a brand-new identity, it may not have published metadata yet.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : profileResult ? (
                <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden relative" data-testid="card-search-result">
                  <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />

                  <div className="p-5 sm:p-6 relative"
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
                    <div className="flex items-start gap-4 mb-5">
                      <Avatar className="h-16 w-16 border-2 border-indigo-100 shadow-md shrink-0">
                        {nostrProfile?.picture && <AvatarImage src={nostrProfile.picture} alt={nostrProfile?.display_name || nostrProfile?.name || "Profile"} className="object-cover" />}
                        <AvatarFallback className="bg-indigo-50 text-indigo-600 text-lg font-bold">
                          {(nostrProfile?.display_name || nostrProfile?.name || searchQuery.slice(0, 2)).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }} data-testid="text-search-result-title">
                            {nostrProfile?.display_name || nostrProfile?.name || searchQuery.slice(0, 18) + "..."}
                          </h3>
                          <Badge variant="secondary" className="text-[9px] font-bold tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-100" data-testid="badge-search-result-found">
                            Profile Found
                          </Badge>
                        </div>
                        {nostrProfile?.nip05 && (
                          <p className="text-xs text-indigo-600 font-medium mt-0.5 truncate" data-testid="text-search-result-nip05">{nostrProfile.nip05}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <code className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] sm:max-w-[300px]" data-testid="text-search-result-npub">{searchQuery}</code>
                          <button onClick={() => handleCopyNpub(searchQuery)} className="p-0.5 text-slate-400 hover:text-indigo-500 transition-colors shrink-0" data-testid="button-copy-search-npub">
                            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        {nostrProfile?.about && (
                          <div className="mt-2" data-testid="text-search-result-about">
                            <p className={`text-xs text-slate-500 leading-relaxed whitespace-pre-line ${!aboutExpanded ? "line-clamp-4" : ""}`}>
                              {renderLinkedText(nostrProfile.about)}
                            </p>
                            {nostrProfile.about.length > 180 && (
                              <button
                                onClick={() => setAboutExpanded(!aboutExpanded)}
                                className="text-[10px] text-indigo-500 font-medium mt-1"
                                data-testid="button-about-toggle"
                              >
                                {aboutExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {(profileResult.followed_by || profileResult.following || profileResult.influence !== undefined) && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                            <Users className="h-3.5 w-3.5" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Trust Signals</h4>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {profileResult.followed_by !== undefined && (
                            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100" data-testid="metric-search-followers">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Users className="h-3 w-3 text-blue-500" />
                                <p className="text-[10px] text-blue-700 font-bold uppercase tracking-wide">Followers</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-followers">
                                {Array.isArray(profileResult.followed_by) ? profileResult.followed_by.length.toLocaleString() : profileResult.followed_by}
                              </p>
                              <p className="text-[9px] text-blue-600/60 mt-0.5">People following this account</p>
                            </div>
                          )}

                          {profileResult.following !== undefined && (
                            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100" data-testid="metric-search-following">
                              <div className="flex items-center gap-1.5 mb-1">
                                <ExternalLink className="h-3 w-3 text-blue-500" />
                                <p className="text-[10px] text-blue-700 font-bold uppercase tracking-wide">Following</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-following">
                                {Array.isArray(profileResult.following) ? profileResult.following.length.toLocaleString() : profileResult.following}
                              </p>
                              <p className="text-[9px] text-blue-600/60 mt-0.5">Accounts this person follows</p>
                            </div>
                          )}

                          {profileResult.influence !== undefined && (
                            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 cursor-help" title="Score from 0–1 based on social graph position. Higher means more connected to well-connected people." data-testid="metric-search-influence">
                              <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp className="h-3 w-3 text-emerald-500" />
                                <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wide">Influence</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-influence">
                                {typeof profileResult.influence === "number" ? profileResult.influence.toFixed(2) : profileResult.influence}
                              </p>
                              <p className="text-[9px] text-emerald-600/60 mt-0.5">Network influence score</p>
                            </div>
                          )}

                          {profileResult.muted_by !== undefined && (
                            <div className={`p-3 rounded-xl border cursor-help ${(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : profileResult.muted_by) > 0 ? "bg-amber-50/70 border-amber-200" : "bg-slate-50/70 border-slate-100"}`} title="A soft negative signal. Muting means someone chose to hide this account's content from their feed." data-testid="metric-search-muted-by">
                              <div className="flex items-center gap-1.5 mb-1">
                                <VolumeX className={`h-3 w-3 ${(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : profileResult.muted_by) > 0 ? "text-amber-500" : "text-slate-400"}`} />
                                <p className={`text-[10px] font-bold uppercase tracking-wide ${(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : profileResult.muted_by) > 0 ? "text-amber-700" : "text-slate-500"}`}>Muted by</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-muted-by">
                                {Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length.toLocaleString() : profileResult.muted_by}
                              </p>
                              <p className="text-[9px] text-slate-500/60 mt-0.5">Others who muted this account</p>
                            </div>
                          )}

                          {profileResult.reported_by !== undefined && (
                            <div className={`p-3 rounded-xl border cursor-help ${(Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : profileResult.reported_by) > 0 ? "bg-red-50/70 border-red-200" : "bg-slate-50/70 border-slate-100"}`} title="A stronger negative signal than muting. Reports indicate someone flagged this account for harmful or inappropriate behavior." data-testid="metric-search-reported-by">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Flag className={`h-3 w-3 ${(Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : profileResult.reported_by) > 0 ? "text-red-500" : "text-slate-400"}`} />
                                <p className={`text-[10px] font-bold uppercase tracking-wide ${(Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : profileResult.reported_by) > 0 ? "text-red-700" : "text-slate-500"}`}>Reported by</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-reported-by">
                                {Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length.toLocaleString() : profileResult.reported_by}
                              </p>
                              <p className="text-[9px] text-slate-500/60 mt-0.5">Reports filed against this account</p>
                            </div>
                          )}

                          {profileResult.muting !== undefined && (
                            <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100" data-testid="metric-search-muting">
                              <div className="flex items-center gap-1.5 mb-1">
                                <VolumeX className="h-3 w-3 text-slate-400" />
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Muting</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-muting">
                                {Array.isArray(profileResult.muting) ? profileResult.muting.length.toLocaleString() : profileResult.muting}
                              </p>
                              <p className="text-[9px] text-slate-500/60 mt-0.5">Accounts this person has muted</p>
                            </div>
                          )}

                          {profileResult.reporting !== undefined && (
                            <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-100" data-testid="metric-search-reporting">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Flag className="h-3 w-3 text-slate-400" />
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Reporting</p>
                              </div>
                              <p className="text-lg font-bold text-slate-900 font-mono leading-none" data-testid="text-search-result-reporting">
                                {Array.isArray(profileResult.reporting) ? profileResult.reporting.length.toLocaleString() : profileResult.reporting}
                              </p>
                              <p className="text-[9px] text-slate-500/60 mt-0.5">Reports filed by this person</p>
                            </div>
                          )}
                        </div>

                        {((Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : 0) > 0 || (Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : 0) > 0) && (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5" data-testid="alert-search-trust-warning">
                            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-bold text-amber-900">Heads up</p>
                              <p className="text-[11px] text-amber-800/80 leading-relaxed">
                                This account has been {(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : 0) > 0 ? `muted by ${(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : 0).toLocaleString()} ${(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : 0) === 1 ? "person" : "people"}` : ""}
                                {(Array.isArray(profileResult.muted_by) ? profileResult.muted_by.length : 0) > 0 && (Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : 0) > 0 ? " and " : ""}
                                {(Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : 0) > 0 ? `reported by ${(Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : 0).toLocaleString()} ${(Array.isArray(profileResult.reported_by) ? profileResult.reported_by.length : 0) === 1 ? "person" : "people"}` : ""}.
                                Use your own judgment when interacting with this account.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <details className="mt-4">
                      <summary className="text-[10px] text-slate-400 font-medium uppercase tracking-wide cursor-pointer hover:text-slate-600 transition-colors" data-testid="button-search-result-raw">Raw API Data</summary>
                      <pre className="text-[10px] text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100 overflow-auto max-h-48 font-mono mt-2" data-testid="text-search-result-raw">
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
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed" data-testid={`text-search-feature-desc-${idx}`}>{feature.desc}</p>
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
        @keyframes searchScanLine {
          0% { left: 0%; }
          100% { left: 100%; }
        }
        @keyframes searchProgressBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
      <Footer />
    </div>
  );
}
