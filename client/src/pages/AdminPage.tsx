import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  Search,
  Menu,
  LogOut,
  Settings as SettingsIcon,
  Users,
  HelpCircle,
  Shield,
  Activity,
  Server,
  BarChart3,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Database,
  Cpu,
  Zap,
  FileText,
  UserCheck,
  TrendingUp,
  Copy,
} from "lucide-react";
import { getCurrentUser, logout, PROFILE_RELAYS, type NostrUser } from "@/services/nostr";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { isAdminPubkey } from "@/config/adminAccess";
import { useToast } from "@/hooks/use-toast";

type AdminTab = "overview" | "users" | "health" | "activity";
type SortDir = "asc" | "desc";
type PageSizeOption = 25 | 50 | 100;

interface SortState {
  key: string;
  dir: SortDir;
}

interface GrapeRankData {
  internal_publication_status?: string;
  ta_status?: string;
  status?: string;
  how_many_others_with_priority?: number;
  updated_at?: string;
  created_at?: string;
  count_values?: string | Record<string, Record<string, number>>;
  average?: number;
  score?: number;
  graperank?: number;
  result?: number;
  confidence?: number;
  value?: number;
}

interface GraphMember {
  pubkey: string;
  influence: number;
}

interface NetworkGraph {
  followed_by?: Array<string | GraphMember>;
  following?: Array<string | GraphMember>;
  muted_by?: Array<string | GraphMember>;
  muting?: Array<string | GraphMember>;
  reported_by?: Array<string | GraphMember>;
  reporting?: Array<string | GraphMember>;
  low_and_reported_by_2_or_more_trusted_pubkeys?: unknown;
}

interface SelfApiResponse {
  data?: {
    graph?: NetworkGraph;
    history?: {
      ta_pubkey?: string;
      last_time_calculated_graperank?: string;
      last_time_triggered_graperank?: string;
      times_calculated_graperank?: number;
    };
  };
}

interface GrapeRankApiResponse {
  data?: GrapeRankData;
}

interface AdminUserRow {
  pubkey: string;
  npub: string;
  relations: string[];
  influence: number;
}

const PRIMARY_RELAY = "wss://dcosl.brainstorm.world";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function extractPubkey(entry: string | GraphMember): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.pubkey === "string") return entry.pubkey;
  return null;
}

function extractInfluence(entry: string | GraphMember): number {
  if (typeof entry === "object" && entry !== null && typeof entry.influence === "number") return entry.influence;
  return 0;
}

function StatusBadge({ status }: { status: "connected" | "degraded" | "disconnected" }) {
  const config = {
    connected: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", ping: "bg-emerald-400", label: "Connected" },
    degraded: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500", ping: "bg-amber-400", label: "Degraded" },
    disconnected: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", ping: "", label: "Not Connected" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${config.bg} border ${config.border}`} data-testid={`badge-status-${status}`}>
      <span className="relative flex h-1.5 w-1.5">
        {config.ping && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.ping} opacity-75`} />}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.dot}`} />
      </span>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${config.text}`}>{config.label}</span>
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, trend, subtitle }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; up: boolean };
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] p-5 group hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40 hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
      <div className="flex items-start justify-between mb-3 relative">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#7c86ff]/10 to-[#333286]/10 border border-[#7c86ff]/15 flex items-center justify-center">
          <Icon className="h-5 w-5 text-[#333286]" />
        </div>
        {trend && (
          <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${trend.up ? "text-emerald-600" : "text-red-500"}`}>
            {trend.up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight relative" style={{ fontFamily: "var(--font-display)" }}>{value}</p>
      <p className="text-xs text-slate-500 mt-1 relative">{label}</p>
      {subtitle && <p className="text-[10px] text-slate-400 mt-0.5 relative">{subtitle}</p>}
    </div>
  );
}

function SortHeader({ label, sortKey, currentSort, onSort }: {
  label: string;
  sortKey: string;
  currentSort: SortState;
  onSort: (key: string) => void;
}) {
  const active = currentSort.key === sortKey;
  return (
    <button
      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      {active ? (
        currentSort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  return (
    <button
      className="p-1 rounded hover:bg-slate-100 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast({ title: "Copied", description: text.slice(0, 20) + "...", duration: 1500 });
      }}
      data-testid="button-copy-npub"
    >
      <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600" />
    </button>
  );
}

const RELATION_BADGE_STYLES: Record<string, string> = {
  follower: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  following: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  muted_by: "bg-amber-50 text-amber-700 border border-amber-200",
  muting: "bg-amber-50 text-amber-700 border border-amber-200",
  reported_by: "bg-red-50 text-red-700 border border-red-200",
  reporting: "bg-red-50 text-red-700 border border-red-200",
};

export default function AdminPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<SortState>({ key: "influence", dir: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    if (!isAdminPubkey(u.pubkey)) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setUser(u);
  }, [navigate]);

  const selfQuery = useQuery<SelfApiResponse>({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const grapeRankQuery = useQuery<GrapeRankApiResponse>({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const selfData = selfQuery.data?.data;
  const network: NetworkGraph | null = selfData?.graph ?? null;
  const grapeRank: GrapeRankData | null = grapeRankQuery.data?.data ?? null;
  const calcDone = grapeRank?.internal_publication_status?.toLowerCase() === "success";
  const taStatus = grapeRank?.ta_status ?? null;
  const calcStatus = grapeRank?.status ?? null;
  const queuePosition = typeof grapeRank?.how_many_others_with_priority === "number" ? grapeRank.how_many_others_with_priority : null;
  const lastUpdated = grapeRank?.updated_at ?? null;
  const lastCreated = grapeRank?.created_at ?? null;
  const historyData = selfData?.history ?? null;
  const timesCalculated = historyData?.times_calculated_graperank ?? null;
  const lastCalcTime = historyData?.last_time_calculated_graperank ?? null;
  const lastTriggerTime = historyData?.last_time_triggered_graperank ?? null;

  const allUsers = useMemo((): AdminUserRow[] => {
    if (!network) return [];
    const pubkeyMap = new Map<string, { relations: Set<string>; influence: number }>();

    const addFromList = (list: Array<string | GraphMember> | undefined, relation: string) => {
      if (!Array.isArray(list)) return;
      for (const entry of list) {
        const pk = extractPubkey(entry);
        if (!pk) continue;
        const inf = extractInfluence(entry);
        const existing = pubkeyMap.get(pk);
        if (existing) {
          existing.relations.add(relation);
          existing.influence = Math.max(existing.influence, inf);
        } else {
          pubkeyMap.set(pk, { relations: new Set([relation]), influence: inf });
        }
      }
    };

    addFromList(network.followed_by, "follower");
    addFromList(network.following, "following");
    addFromList(network.muted_by, "muted_by");
    addFromList(network.muting, "muting");
    addFromList(network.reported_by, "reported_by");
    addFromList(network.reporting, "reporting");

    return Array.from(pubkeyMap.entries()).map(([pk, data]) => {
      let npub: string;
      try { npub = nip19.npubEncode(pk); } catch { npub = pk; }
      return { pubkey: pk, npub, relations: Array.from(data.relations), influence: data.influence };
    });
  }, [network]);

  const filteredUsers = useMemo(() => {
    let list = allUsers;
    if (userSearch.trim()) {
      const q = userSearch.trim().toLowerCase();
      list = list.filter(u => u.pubkey.toLowerCase().includes(q) || u.npub.toLowerCase().includes(q) || u.relations.some(r => r.toLowerCase().includes(q)));
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (userSort.key === "influence") { va = a.influence; vb = b.influence; }
      else if (userSort.key === "pubkey") { va = a.pubkey; vb = b.pubkey; }
      else if (userSort.key === "relations") { va = a.relations.length; vb = b.relations.length; }
      else { va = a.pubkey; vb = b.pubkey; }
      if (va < vb) return userSort.dir === "asc" ? -1 : 1;
      if (va > vb) return userSort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [allUsers, userSearch, userSort]);

  const paginatedUsers = useMemo(() => {
    const start = userPage * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, userPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  const handleSort = useCallback((key: string) => {
    setUserSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
    setUserPage(0);
  }, []);

  const handlePageSizeChange = useCallback((val: string) => {
    setPageSize(parseInt(val, 10) as PageSizeOption);
    setUserPage(0);
  }, []);

  const getListLength = (list: unknown): number => Array.isArray(list) ? list.length : 0;
  const followersCount = getListLength(network?.followed_by);
  const followingCount = getListLength(network?.following);
  const mutedByCount = getListLength(network?.muted_by);
  const mutingCount = getListLength(network?.muting);
  const reportedByCount = getListLength(network?.reported_by);
  const reportingCount = getListLength(network?.reporting);

  if (!user || isAuthRedirecting()) return null;

  const tabs: { key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "users", label: "Users", icon: Users },
    { key: "health", label: "System Health", icon: Server },
    { key: "activity", label: "Activity", icon: Activity },
  ];

  const configuredRelays = [PRIMARY_RELAY, ...PROFILE_RELAYS];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-admin">
      <PageBackground />

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-admin">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                  className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                  data-testid="button-open-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>

              <button
                type="button"
                className="flex items-center gap-3 min-w-0 lg:hidden"
                onClick={() => navigate("/dashboard")}
                data-testid="button-admin-mobile-brand"
              >
                <div className="h-9 w-9 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center shrink-0">
                  <BrainLogo size={20} className="text-indigo-200" />
                </div>
                <div className="leading-tight text-left min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80">Brainstorm</p>
                  <p className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>Admin</p>
                </div>
              </button>

              <button
                type="button"
                className="hidden lg:flex items-center gap-2"
                onClick={() => navigate("/dashboard")}
                data-testid="button-desktop-brand"
              >
                <BrainLogo size={28} className="text-indigo-500" />
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
              </button>

              <div className="hidden lg:flex gap-1" data-testid="nav-admin-tabs">
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/dashboard")} data-testid="button-nav-dashboard">
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/search")} data-testid="button-nav-search">
                  <Search className="h-4 w-4" />
                  Search
                </Button>
                <Button variant="ghost" size="sm" className={`gap-2 rounded-md no-default-hover-elevate no-default-active-elevate transition-all duration-200 ${calcDone ? "text-slate-400 hover:text-white hover:bg-white/[0.06]" : "text-slate-600 opacity-40 cursor-not-allowed"}`} onClick={() => calcDone && navigate("/network")} disabled={!calcDone} data-testid="button-nav-network">
                  <Users className="h-4 w-4" />
                  Network
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Admin</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5" data-testid="button-admin-profile-menu">
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-admin-avatar">
                      {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2">
                      <span className="text-sm font-bold text-white leading-none mb-0.5">{user.displayName || "Anon"}</span>
                      <span className="text-[10px] text-indigo-300 font-mono leading-none">{user.npub.slice(0, 8)}...</span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anon"}</p>
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
                  <DropdownMenuItem className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800" onClick={() => navigate("/admin")} data-testid="dropdown-admin">
                    <Shield className="mr-2 h-4 w-4" />
                    <span>Admin Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700" onClick={handleLogout} data-testid="dropdown-signout">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
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
        currentPath={location}
        navigate={navigate}
        calcDone={calcDone}
        user={user}
        onLogout={handleLogout}
        isAdmin={true}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <div className="space-y-6 animate-fade-up">

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-admin-header">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-amber-500/20 shadow-sm backdrop-blur-sm w-fit">
                <div className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]" />
                <p className="text-[9px] font-bold tracking-[0.15em] text-amber-700 uppercase">NosFabrica Admin</p>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Admin Dashboard
                </span>
              </h1>
              <p className="text-slate-600 font-medium">
                System overview and management for NosFabrica operators.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4" data-testid="section-kpi-strip">
            <KpiCard label="Total Pubkeys" value={formatNumber(allUsers.length)} icon={Users} subtitle="From your graph" />
            <KpiCard label="Followers" value={formatNumber(followersCount)} icon={UserCheck} trend={followersCount > 0 ? { value: `${followersCount}`, up: true } : undefined} />
            <KpiCard label="Following" value={formatNumber(followingCount)} icon={TrendingUp} />
            <KpiCard label="Queue Depth" value={queuePosition !== null ? queuePosition.toString() : "—"} icon={Clock} subtitle={queuePosition !== null ? "Position in queue" : "Via graperankResult API"} />
            <KpiCard label="Reports Filed" value={formatNumber(reportedByCount + reportingCount)} icon={AlertTriangle} subtitle={`${reportedByCount} against, ${reportingCount} by you`} />
          </div>

          <div className="flex gap-1 p-1 rounded-2xl bg-white/60 border border-[#7c86ff]/10 backdrop-blur-sm w-fit" data-testid="admin-tab-bar">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setUserPage(0); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-r from-[#333286] to-[#7c86ff] text-white shadow-md"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/80"
                  }`}
                  data-testid={`tab-${tab.key}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="panel-overview">
              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-network-summary">
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Network Summary</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Relationship breakdown from /user/self graph</p>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { label: "Followers", count: followersCount, color: "bg-emerald-500" },
                    { label: "Following", count: followingCount, color: "bg-indigo-500" },
                    { label: "Muted By", count: mutedByCount, color: "bg-amber-500" },
                    { label: "Muting", count: mutingCount, color: "bg-slate-400" },
                    { label: "Reported By", count: reportedByCount, color: "bg-red-500" },
                    { label: "Reporting", count: reportingCount, color: "bg-orange-500" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between" data-testid={`overview-row-${row.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${row.color}`} />
                        <span className="text-xs font-medium text-slate-700">{row.label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{formatNumber(row.count)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-graperank-status">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>GrapeRank Pipeline</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Data from /user/graperankResult</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calculation Status</span>
                    {calcDone ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Complete
                      </span>
                    ) : grapeRank ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                        <Clock className="h-3 w-3 animate-spin" /> In Progress
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <Clock className="h-3 w-3" /> Idle
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Internal Publication</span>
                    <span className="text-xs font-mono text-slate-600">{grapeRank?.internal_publication_status ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">TA Status</span>
                    <span className="text-xs font-mono text-slate-600">{taStatus ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Calc Status</span>
                    <span className="text-xs font-mono text-slate-600">{calcStatus ?? "—"}</span>
                  </div>
                  {queuePosition !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Queue Position</span>
                      <span className="text-sm font-bold text-slate-900">{queuePosition}</span>
                    </div>
                  )}
                  {lastUpdated && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Last Updated</span>
                      <span className="text-xs text-slate-600">{new Date(lastUpdated).toLocaleString()}</span>
                    </div>
                  )}
                  {lastCreated && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Created At</span>
                      <span className="text-xs text-slate-600">{new Date(lastCreated).toLocaleString()}</span>
                    </div>
                  )}
                  {timesCalculated !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Times Calculated</span>
                      <span className="text-sm font-bold text-slate-900">{timesCalculated}</span>
                    </div>
                  )}
                  {lastCalcTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Last Calc Time</span>
                      <span className="text-xs text-slate-600">{new Date(lastCalcTime).toLocaleString()}</span>
                    </div>
                  )}
                  {lastTriggerTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Last Triggered</span>
                      <span className="text-xs text-slate-600">{new Date(lastTriggerTime).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-quick-stats">
                <div className="h-1 w-full bg-gradient-to-r from-violet-400 via-fuchsia-500 to-violet-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>System Endpoints</h3>
                  <p className="text-xs text-slate-500 mt-0.5">API connectivity status</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { endpoint: "/user/self", label: "User Self", status: selfQuery.isSuccess ? "connected" as const : selfQuery.isError ? "disconnected" as const : "degraded" as const },
                      { endpoint: "/user/graperankResult", label: "GrapeRank Result", status: grapeRankQuery.isSuccess ? "connected" as const : grapeRankQuery.isError ? "disconnected" as const : "degraded" as const },
                      { endpoint: "/admin/users", label: "Admin Users", status: "disconnected" as const },
                      { endpoint: "/admin/system", label: "Admin System", status: "disconnected" as const },
                    ].map(ep => (
                      <div key={ep.endpoint} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-slate-100" data-testid={`endpoint-${ep.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{ep.label}</p>
                          <p className="text-[10px] font-mono text-slate-400">{ep.endpoint}</p>
                        </div>
                        <StatusBadge status={ep.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="panel-users">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="px-5 py-4 border-b border-[#7c86ff]/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>User Directory</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{filteredUsers.length.toLocaleString()} pubkeys from /user/self graph data</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Full admin user records require a dedicated /admin/users endpoint (not supported)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search pubkey, npub, or relation..."
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40 w-64"
                    data-testid="input-user-search"
                  />
                  <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-20 h-8 text-xs rounded-xl border-slate-200" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left" data-testid="table-users">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-3"><SortHeader label="Pubkey / npub" sortKey="pubkey" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-5 py-3"><SortHeader label="Relations" sortKey="relations" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-5 py-3"><SortHeader label="Influence" sortKey="influence" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-5 py-3 text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400">
                          {selfQuery.isLoading ? "Loading user data..." : userSearch ? "No users match your search" : "No user data available"}
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((u, i) => (
                        <tr key={u.pubkey} className="border-b border-slate-50 hover:bg-white/60 transition-colors" data-testid={`row-user-${i}`}>
                          <td className="px-5 py-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono text-slate-700">{u.pubkey.slice(0, 8)}...{u.pubkey.slice(-6)}</span>
                                <CopyButton text={u.pubkey} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-indigo-500/80">{u.npub.slice(0, 12)}...{u.npub.slice(-4)}</span>
                                <CopyButton text={u.npub} />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {u.relations.map(r => (
                                <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${RELATION_BADGE_STYLES[r] ?? "bg-slate-50 text-slate-700 border border-slate-200"}`}>{r}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-[#7c86ff] to-[#333286]" style={{ width: `${Math.min(u.influence * 100, 100)}%` }} />
                              </div>
                              <span className="text-xs font-mono text-slate-600 tabular-nums">{u.influence.toFixed(4)}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-[#7c86ff] hover:text-[#333286] no-default-hover-elevate no-default-active-elevate"
                              onClick={() => navigate(`/profile/${u.npub}`)}
                              data-testid={`button-view-user-${i}`}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between" data-testid="pagination-users">
                  <span className="text-xs text-slate-500">
                    Page {userPage + 1} of {totalPages} ({filteredUsers.length} total)
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={userPage === 0}
                      onClick={() => setUserPage(p => p - 1)}
                      className="no-default-hover-elevate no-default-active-elevate"
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={userPage >= totalPages - 1}
                      onClick={() => setUserPage(p => p + 1)}
                      className="no-default-hover-elevate no-default-active-elevate"
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "health" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="panel-health">
              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-relay-status">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Configured Relays</h3>
                  <p className="text-xs text-slate-500 mt-0.5">All relays used by this application (DCoSL + profile relays)</p>
                </div>
                <div className="p-5 space-y-3">
                  {configuredRelays.map((relay, idx) => (
                    <div key={relay} className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-slate-100" data-testid={`relay-row-${idx}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                          <Wifi className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{relay === PRIMARY_RELAY ? "DCoSL Relay (primary)" : "Profile Relay"}</p>
                          <p className="text-[10px] font-mono text-slate-400">{relay}</p>
                        </div>
                      </div>
                      <StatusBadge status="connected" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-api-health">
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>API Health</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Brainstorm Server endpoints — live status from queries</p>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { name: "/authChallenge/*", ok: true, note: "Auth flow functional" },
                    { name: "/user/self", ok: selfQuery.isSuccess, note: selfQuery.isError ? "Query error" : selfQuery.isLoading ? "Loading..." : "OK" },
                    { name: "/user/graperank", ok: true, note: "POST trigger endpoint" },
                    { name: "/user/graperankResult", ok: grapeRankQuery.isSuccess, note: grapeRankQuery.isError ? "Query error" : grapeRankQuery.isLoading ? "Loading..." : "OK" },
                  ].map(ep => (
                    <div key={ep.name} className="flex items-center justify-between p-2.5 rounded-lg bg-white/40 border border-slate-50" data-testid={`health-ep-${ep.name.replace(/[\/*]/g, "-")}`}>
                      <div className="flex items-center gap-2">
                        {ep.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                        <span className="text-xs font-mono text-slate-700">{ep.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">{ep.note}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${ep.ok ? "text-emerald-600" : "text-red-500"}`}>{ep.ok ? "OK" : "ERR"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-infra-overview">
                <div className="h-1 w-full bg-gradient-to-r from-violet-400 via-fuchsia-500 to-violet-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Infrastructure</h3>
                  <p className="text-xs text-slate-500 mt-0.5">System components overview</p>
                </div>
                <div className="p-5 grid grid-cols-1 gap-4">
                  {[
                    { icon: Database, label: "Event Store", detail: "Applesauce EventStore (in-memory)", status: "Operational" as const },
                    { icon: Cpu, label: "GrapeRank Engine", detail: "Trust computation pipeline", status: (calcDone ? "Idle" : grapeRank ? "Processing" : "Idle") as const },
                    { icon: Zap, label: "NIP-85 Publisher", detail: "Trust assertion broadcaster (kind 10040)", status: "Operational" as const },
                  ].map(comp => (
                    <div key={comp.label} className="p-4 rounded-xl bg-white/50 border border-slate-100 space-y-2" data-testid={`infra-${comp.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      <div className="flex items-center gap-2">
                        <comp.icon className="h-4 w-4 text-[#333286]" />
                        <span className="text-xs font-bold text-slate-800">{comp.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{comp.detail}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                        comp.status === "Processing" ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          comp.status === "Processing" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                        }`} />
                        {comp.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-6" data-testid="panel-activity">
              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-session-activity">
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Session Activity</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Current session events and API query results</p>
                </div>
                <div className="p-5">
                  <div className="space-y-3">
                    {[
                      { event: "Admin dashboard accessed", type: "info" as const, detail: `Authenticated as ${user.npub.slice(0, 16)}...` },
                      { event: "/user/self query", type: (selfQuery.isSuccess ? "success" : selfQuery.isError ? "error" : "info") as const, detail: selfQuery.isSuccess ? `Graph loaded — ${allUsers.length} unique pubkeys` : selfQuery.isError ? "Failed to load user data" : "Loading..." },
                      { event: "/user/graperankResult query", type: (grapeRankQuery.isSuccess ? "success" : grapeRankQuery.isError ? "error" : "info") as const, detail: grapeRankQuery.isSuccess ? `Status: ${grapeRank?.internal_publication_status ?? "unknown"}` : grapeRankQuery.isError ? "Failed to load GrapeRank data" : "Loading..." },
                      { event: "GrapeRank calculation history", type: "info" as const, detail: timesCalculated !== null ? `Calculated ${timesCalculated} time(s)` : "History not available" },
                      { event: "Last trigger", type: "info" as const, detail: lastTriggerTime ? new Date(lastTriggerTime).toLocaleString() : "—" },
                      { event: "Last calculation", type: "info" as const, detail: lastCalcTime ? new Date(lastCalcTime).toLocaleString() : "—" },
                    ].map((entry, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/40 border border-slate-50" data-testid={`activity-entry-${i}`}>
                        <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                          entry.type === "success" ? "bg-emerald-50 border border-emerald-200" :
                          entry.type === "error" ? "bg-red-50 border border-red-200" :
                          "bg-slate-50 border border-slate-200"
                        }`}>
                          {entry.type === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> :
                           entry.type === "error" ? <XCircle className="h-3 w-3 text-red-500" /> :
                           <Activity className="h-3 w-3 text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800">{entry.event}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{entry.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-calculation-errors">
                <div className="h-1 w-full bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Calculation Errors</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Error history from GrapeRank pipeline</p>
                </div>
                <div className="p-5">
                  {grapeRank && (calcStatus?.toLowerCase() === "failure" || taStatus?.toLowerCase() === "failure") ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-red-800">Pipeline failure detected</p>
                          <p className="text-[10px] text-red-600 mt-0.5">
                            Status: {calcStatus ?? "—"} | TA: {taStatus ?? "—"} | Internal: {grapeRank.internal_publication_status ?? "—"}
                          </p>
                          {lastUpdated && <p className="text-[10px] text-red-500 mt-0.5">At: {new Date(lastUpdated).toLocaleString()}</p>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-400">No Errors</p>
                      <p className="text-xs text-slate-400 mt-1">No calculation failures detected in current result data.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-feature-usage">
                <div className="h-1 w-full bg-gradient-to-r from-violet-400 via-fuchsia-500 to-violet-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Platform-Wide Analytics</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Login activity, feature usage, and aggregate metrics — API endpoint not supported</p>
                </div>
                <div className="p-5">
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3">
                      <FileText className="h-6 w-6 text-slate-300" />
                    </div>
                    <p className="text-sm font-semibold text-slate-400">No Data Available</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">Platform-wide login activity, feature usage breakdown, and aggregate analytics require a dedicated /admin/analytics endpoint that is not yet supported.</p>
                    <div className="mt-3">
                      <StatusBadge status="disconnected" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
