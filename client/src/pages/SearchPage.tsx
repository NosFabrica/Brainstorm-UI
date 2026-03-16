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
  Settings as SettingsIcon,
  BookOpen,
  HelpCircle,
} from "lucide-react";
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
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { apiClient, isAuthRedirecting } from "@/services/api";
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
  const [searchError, setSearchError] = useState<SearchError | null>(null);

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
      navigate("/", { replace: true });
      return;
    }
    setUser(u);

    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("npub");
    const group = params.get("fromGroup");
    if (prefill) {
      const target = group ? `/profile/${prefill}?fromGroup=${group}` : `/profile/${prefill}`;
      navigate(target, { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
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
    let displayNpub: string;

    if (activeTab === "npub") {
      if (isLikelyNpub(q)) {
        try {
          const decoded = nip19.decode(q);
          if (decoded.type !== "npub" || typeof decoded.data !== "string") {
            setSearchError({ code: "INVALID_NPUB", title: "Invalid npub format", message: "Could not decode this npub. Make sure it's a valid Bech32-encoded public key." });
            return;
          }
          hexPubkey = decoded.data;
          displayNpub = q;
        } catch {
          setSearchError({ code: "INVALID_NPUB", title: "Invalid npub format", message: "Could not decode this npub. Make sure it's a valid Bech32-encoded public key." });
          return;
        }
      } else if (isHexPubkey(q)) {
        hexPubkey = q.toLowerCase();
        displayNpub = nip19.npubEncode(hexPubkey);
      } else if (isNip05Handle(q)) {
        setIsSearching(true);
        try {
          hexPubkey = await resolveNip05(q);
          displayNpub = nip19.npubEncode(hexPubkey);
        } catch (err) {
          setIsSearching(false);
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

    setIsSearching(false);
    navigate(`/profile/${displayNpub}`);
  };

  if (!user || isAuthRedirecting()) return null;

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
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>FAQ</span>
                  </DropdownMenuItem>
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
                  onClick={() => { setMobileMenuOpen(false); navigate("/faq"); }}
                  data-testid="button-mobile-nav-faq"
                >
                  <HelpCircle className="h-5 w-5 text-slate-200/80" />
                  FAQ
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
                      <span className="rounded-full bg-[#6366f1] text-white border border-[#6366f1]/40 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-xs font-bold tracking-wider uppercase shadow-sm">
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
                        className="h-10 sm:h-11 px-6 bg-[#6366f1] hover:bg-[#4f46e5] text-white shadow-lg shadow-[#6366f1]/20 font-bold tracking-wide text-xs gap-2 w-full sm:w-auto"
                        data-testid="button-npub-lookup"
                      >
                        {isSearching ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Resolving...
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
                      <Button disabled className="h-11 px-6 bg-[#6366f1] text-white font-bold tracking-wide text-xs opacity-50" data-testid="button-keyword-lookup">
                        LOOKUP
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

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
      `}</style>
      <Footer />
    </div>
  );
}
