import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
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
  WifiOff,
  Database,
  Cpu,
  Zap,
  FileText,
  UserCheck,
  TrendingUp,
  Copy,
  Timer,
  Globe,
  RefreshCw,
  CalendarDays,
  Hash,
  Eye,
  LogIn,
} from "lucide-react";
import { getCurrentUser, logout, fetchProfile, PROFILE_RELAYS, type NostrUser } from "@/services/nostr";
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
  followerCount: number;
  followingCount: number;
}

interface BrainstormUserData {
  status: "loading" | "loaded" | "error";
  taPubkey?: string;
  followerTotal: number;
  followingTotal: number;
  mutedByTotal: number;
  reportedByTotal: number;
  influence: number;
  lastCalculated?: string;
  lastTriggered?: string;
  timesCalculated?: number;
  followerList: string[];
  followingList: string[];
}

interface RelayLatency {
  url: string;
  latencyMs: number | null;
  status: "connected" | "degraded" | "disconnected";
  checkedAt: Date;
}

const PRIMARY_RELAY = "wss://dcosl.brainstorm.world";
const SESSION_START = new Date();

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatUptime(since: Date): string {
  const diff = Date.now() - since.getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
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

function KpiCard({ label, value, icon: Icon, trend, subtitle, unsupported }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; up: boolean };
  subtitle?: string;
  unsupported?: boolean;
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
      <p className={`text-2xl font-bold tracking-tight relative ${unsupported ? "text-slate-300" : "text-slate-900"}`} style={{ fontFamily: "var(--font-display)" }}>{value}</p>
      <p className="text-xs text-slate-500 mt-1 relative">{label}</p>
      {subtitle && <p className="text-[10px] text-slate-400 mt-0.5 relative">{subtitle}</p>}
      {unsupported && <div className="mt-1.5 relative"><StatusBadge status="disconnected" /></div>}
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
  const [relayLatencies, setRelayLatencies] = useState<RelayLatency[]>([]);
  const [relayCheckRunning, setRelayCheckRunning] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const probeRelayLatency = useCallback(async (url: string): Promise<RelayLatency> => {
    const start = performance.now();
    return new Promise<RelayLatency>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ url, latencyMs: null, status: "disconnected", checkedAt: new Date() });
      }, 5000);
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          const latency = Math.round(performance.now() - start);
          clearTimeout(timeout);
          ws.close();
          resolve({ url, latencyMs: latency, status: latency < 2000 ? "connected" : "degraded", checkedAt: new Date() });
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          resolve({ url, latencyMs: null, status: "disconnected", checkedAt: new Date() });
        };
      } catch {
        clearTimeout(timeout);
        resolve({ url, latencyMs: null, status: "disconnected", checkedAt: new Date() });
      }
    });
  }, []);

  const runRelayCheck = useCallback(async () => {
    if (relayCheckRunning) return;
    setRelayCheckRunning(true);
    const relays = [PRIMARY_RELAY, ...PROFILE_RELAYS];
    const results = await Promise.all(relays.map(r => probeRelayLatency(r)));
    setRelayLatencies(results);
    setRelayCheckRunning(false);
  }, [relayCheckRunning, probeRelayLatency]);

  useEffect(() => {
    if (user && activeTab === "health" && relayLatencies.length === 0) {
      runRelayCheck();
    }
  }, [user, activeTab, relayLatencies.length, runRelayCheck]);

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
      const rels = Array.from(data.relations);
      return {
        pubkey: pk,
        npub,
        relations: rels,
        influence: data.influence,
        followerCount: rels.includes("follower") ? 1 : 0,
        followingCount: rels.includes("following") ? 1 : 0,
      };
    });
  }, [network]);

  const [userProfiles, setUserProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());

  const [brainstormData, setBrainstormData] = useState<Map<string, BrainstormUserData>>(new Map());
  const brainstormInFlight = useMemo(() => new Set<string>(), []);

  const filteredUsers = useMemo(() => {
    let list = allUsers;
    if (userSearch.trim()) {
      const q = userSearch.trim().toLowerCase();
      list = list.filter(u => {
        const prof = userProfiles.get(u.pubkey);
        const bd = brainstormData.get(u.pubkey);
        return u.pubkey.toLowerCase().includes(q) || u.npub.toLowerCase().includes(q) || u.relations.some(r => r.toLowerCase().includes(q)) || (prof?.name && prof.name.toLowerCase().includes(q)) || (bd?.taPubkey && bd.taPubkey.toLowerCase().includes(q));
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      const bdA = brainstormData.get(a.pubkey);
      const bdB = brainstormData.get(b.pubkey);
      let va: string | number, vb: string | number;
      if (userSort.key === "influence") { va = bdA?.influence ?? a.influence; vb = bdB?.influence ?? b.influence; }
      else if (userSort.key === "pubkey") { va = a.pubkey; vb = b.pubkey; }
      else if (userSort.key === "relations") { va = a.relations.length; vb = b.relations.length; }
      else if (userSort.key === "followers") { va = bdA?.followerTotal ?? 0; vb = bdB?.followerTotal ?? 0; }
      else if (userSort.key === "following") { va = bdA?.followingTotal ?? 0; vb = bdB?.followingTotal ?? 0; }
      else if (userSort.key === "timesCalc") { va = bdA?.timesCalculated ?? 0; vb = bdB?.timesCalculated ?? 0; }
      else if (userSort.key === "lastCalc") { va = bdA?.lastCalculated ?? ""; vb = bdB?.lastCalculated ?? ""; }
      else { va = a.pubkey; vb = b.pubkey; }
      if (va < vb) return userSort.dir === "asc" ? -1 : 1;
      if (va > vb) return userSort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [allUsers, userSearch, userSort, userProfiles, brainstormData]);

  const paginatedUsers = useMemo(() => {
    const start = userPage * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, userPage, pageSize]);

  useEffect(() => {
    if (paginatedUsers.length === 0) return;
    let cancelled = false;
    const toFetch = paginatedUsers.filter(u => !userProfiles.has(u.pubkey));
    if (toFetch.length === 0) return;
    (async () => {
      const results = await Promise.allSettled(toFetch.map(u => fetchProfile(u.pubkey, 8000)));
      if (cancelled) return;
      setUserProfiles(prev => {
        const next = new Map(prev);
        for (let i = 0; i < toFetch.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            next.set(toFetch[i].pubkey, { name: r.value.display_name || r.value.name, picture: r.value.picture });
          } else {
            next.set(toFetch[i].pubkey, {});
          }
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [paginatedUsers]);

  useEffect(() => {
    if (paginatedUsers.length === 0) return;
    const toFetch = paginatedUsers.filter(u => !brainstormData.has(u.pubkey) && !brainstormInFlight.has(u.pubkey));
    if (toFetch.length === 0) return;
    for (const u of toFetch) brainstormInFlight.add(u.pubkey);
    const countArr = (arr: unknown): number => Array.isArray(arr) ? arr.length : 0;
    const toPkList = (arr: unknown): string[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map((e: any) => typeof e === "string" ? e : e?.pubkey).filter(Boolean).slice(0, 10);
    };
    (async () => {
      const BATCH_SIZE = 5;
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(u => apiClient.getUserByPubkey(u.pubkey)));
        setBrainstormData(prev => {
          const next = new Map(prev);
          for (let j = 0; j < batch.length; j++) {
            brainstormInFlight.delete(batch[j].pubkey);
            const r = results[j];
            if (r.status === "fulfilled" && r.value?.data) {
              const d = r.value.data;
              const hist = d.history || {};
              next.set(batch[j].pubkey, {
                status: "loaded",
                taPubkey: hist.ta_pubkey,
                followerTotal: countArr(d.followed_by ?? d.graph?.followed_by),
                followingTotal: countArr(d.following ?? d.graph?.following),
                mutedByTotal: countArr(d.muted_by ?? d.graph?.muted_by),
                reportedByTotal: countArr(d.reported_by ?? d.graph?.reported_by),
                influence: typeof d.influence === "number" ? d.influence : 0,
                lastCalculated: hist.last_time_calculated_graperank,
                lastTriggered: hist.last_time_triggered_graperank,
                timesCalculated: hist.times_calculated_graperank,
                followerList: toPkList(d.followed_by ?? d.graph?.followed_by),
                followingList: toPkList(d.following ?? d.graph?.following),
              });
            } else {
              next.set(batch[j].pubkey, { status: "error", followerTotal: 0, followingTotal: 0, mutedByTotal: 0, reportedByTotal: 0, influence: 0, followerList: [], followingList: [] });
            }
          }
          return next;
        });
      }
    })();
  }, [paginatedUsers]);

  const brainstormFetchedCount = useMemo(() => {
    let count = 0;
    brainstormData.forEach(v => { if (v.status === "loaded") count++; });
    return count;
  }, [brainstormData]);

  const formatCrmDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return dateStr; }
  };

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
                      <button className="flex items-center gap-1 text-xs leading-none text-slate-500 hover:text-indigo-600 transition-colors" onClick={() => { navigator.clipboard.writeText(user.npub); toast({ title: "Copied!", description: "npub copied to clipboard" }); }} data-testid="button-copy-npub">
                        <span>{user.npub.slice(0, 16)}...</span>
                        <Copy className="h-3 w-3" />
                      </button>
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

          {/* KPI cards: system-wide metrics require /admin/system endpoint (not supported) */}
          {/* Graph-derived metrics (from /user/self) are labeled as "Your Graph" */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4" data-testid="section-kpi-strip">
            {/* API endpoint not supported: /admin/system — system-wide user count */}
            <KpiCard label="Total Users (System)" value="—" icon={Users} subtitle="Requires /admin/system" unsupported />
            {/* API endpoint not supported: /admin/system — users who have completed GrapeRank */}
            <KpiCard label="Users with Scores" value="—" icon={UserCheck} subtitle="Requires /admin/system" unsupported />
            <KpiCard label="Your Graph Pubkeys" value={formatNumber(allUsers.length)} icon={TrendingUp} subtitle="From /user/self graph" />
            <KpiCard label="Queue Depth" value={queuePosition !== null ? queuePosition.toString() : "—"} icon={Clock} subtitle={queuePosition !== null ? "Position in queue" : "Via graperankResult"} />
            <KpiCard label="Reports Filed" value={formatNumber(reportedByCount + reportingCount)} icon={AlertTriangle} subtitle="Your graph only" />
            {/* API endpoint not supported: /admin/sessions — active session count */}
            <KpiCard label="Active Sessions" value="—" icon={Eye} subtitle="Requires /admin/sessions" unsupported />
            <KpiCard label="Uptime / Last Restart" value={formatUptime(SESSION_START)} icon={Timer} subtitle="Admin session uptime" />
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
                      { endpoint: "/admin/users", label: "Admin Users", status: "disconnected" as const }, // API endpoint not supported
                      { endpoint: "/admin/system", label: "Admin System", status: "disconnected" as const }, // API endpoint not supported
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
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>User CRM</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500">{filteredUsers.length.toLocaleString()} users</span>
                    <span className="text-[10px] text-slate-400">|</span>
                    <span className="text-[10px] text-slate-400">{brainstormFetchedCount} enriched via /user/&#123;pubkey&#125;</span>
                    <span className="text-[10px] text-slate-400">|</span>
                    <span className="text-[10px] text-amber-500 font-medium">Source: /user/self network graph</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Full user listing requires <span className="font-mono text-amber-600/80">/admin/users</span> endpoint (pending backend)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search name, npub, pubkey, relation..."
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40 w-72"
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
                <table className="w-full text-left min-w-[1200px]" data-testid="table-users">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-2 py-3 w-6"></th>
                      <th className="px-2 py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Profile</span></th>
                      <th className="px-2 py-3"><SortHeader label="Nostr Identity" sortKey="pubkey" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Brainstorm ID</span></th>
                      <th className="px-2 py-3"><SortHeader label="Followers" sortKey="followers" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-3"><SortHeader label="Following" sortKey="following" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-3"><SortHeader label="Influence" sortKey="influence" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-3"><SortHeader label="Last Calculated" sortKey="lastCalc" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-3"><SortHeader label="# Calcs" sortKey="timesCalc" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TA Count <span className="text-amber-500">*</span></span></th>
                      <th className="px-2 py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Calc Status <span className="text-amber-500">*</span></span></th>
                      <th className="px-2 py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Runtime <span className="text-amber-500">*</span></span></th>
                      <th className="px-2 py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Error <span className="text-amber-500">*</span></span></th>
                      <th className="px-2 py-3 text-right"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="px-5 py-10 text-center text-sm text-slate-400">
                          {selfQuery.isLoading ? "Loading user data..." : userSearch ? "No users match your search" : "No user data available"}
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map((u, i) => {
                        const isExpanded = expandedRows.has(u.pubkey);
                        const prof = userProfiles.get(u.pubkey);
                        const bd = brainstormData.get(u.pubkey);
                        const isLoading = !bd || bd.status === "loading";
                        const isError = bd?.status === "error";
                        const isLoaded = bd?.status === "loaded";
                        const SkeletonCell = () => <div className="h-3 w-12 bg-slate-100 rounded animate-pulse" />;
                        const AwaitingApiBadge = () => (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                            <Clock className="h-2.5 w-2.5" /> Awaiting API
                          </span>
                        );
                        return (
                          <Fragment key={u.pubkey}>
                            <tr className={`border-b border-slate-50 hover:bg-white/60 transition-colors cursor-pointer ${isError ? "bg-red-50/30" : ""}`} onClick={() => {
                              setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(u.pubkey)) next.delete(u.pubkey); else next.add(u.pubkey);
                                return next;
                              });
                            }} data-testid={`row-user-${i}`}>
                              <td className="px-2 py-2.5">
                                <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-profile-${i}`}>
                                <div className="flex items-center gap-1.5">
                                  <Avatar className="h-6 w-6 shrink-0">
                                    {prof?.picture ? (
                                      <AvatarImage src={prof.picture} alt={prof.name || "User"} className="object-cover" />
                                    ) : null}
                                    <AvatarFallback className="bg-slate-100 border border-slate-200 text-[9px] text-slate-400">
                                      {prof?.name?.charAt(0)?.toUpperCase() || <Users className="h-3 w-3 text-slate-300" />}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <span className="text-[9px] text-slate-700 truncate block max-w-[90px] font-medium">
                                      {prof?.name || u.npub.slice(0, 12) + "..."}
                                    </span>
                                    <div className="flex gap-1 mt-0.5 flex-wrap">
                                      {u.relations.slice(0, 2).map(r => (
                                        <span key={r} className={`text-[7px] px-1 py-0 rounded ${RELATION_BADGE_STYLES[r] || "bg-slate-100 text-slate-500"}`}>{r}</span>
                                      ))}
                                      {u.relations.length > 2 && <span className="text-[7px] text-slate-400">+{u.relations.length - 2}</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[8px] font-mono text-indigo-500/80">{u.npub.slice(0, 12)}...{u.npub.slice(-4)}</span>
                                    <CopyButton text={u.npub} />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-mono text-slate-400">{u.pubkey.slice(0, 8)}...{u.pubkey.slice(-4)}</span>
                                    <CopyButton text={u.pubkey} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-brainstorm-npub-${i}`}>
                                {isLoading ? <SkeletonCell /> : isLoaded && bd?.taPubkey ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[8px] font-mono text-emerald-600">{bd.taPubkey.slice(0, 10)}...{bd.taPubkey.slice(-4)}</span>
                                    <CopyButton text={bd.taPubkey} />
                                  </div>
                                ) : isError ? (
                                  <span className="text-[8px] text-red-400">fetch error</span>
                                ) : (
                                  <span className="text-[8px] text-slate-300 italic">none</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5">
                                {isLoading ? <SkeletonCell /> : (
                                  <span className="text-[10px] font-mono text-slate-600 tabular-nums">{isLoaded ? bd!.followerTotal.toLocaleString() : "—"}</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5">
                                {isLoading ? <SkeletonCell /> : (
                                  <span className="text-[10px] font-mono text-slate-600 tabular-nums">{isLoaded ? bd!.followingTotal.toLocaleString() : "—"}</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5">
                                {isLoading ? <SkeletonCell /> : (
                                  <div className="flex items-center gap-1">
                                    <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                      <div className="h-full rounded-full bg-gradient-to-r from-[#7c86ff] to-[#333286]" style={{ width: `${Math.min((isLoaded ? bd!.influence : u.influence) * 100, 100)}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-600 tabular-nums">{(isLoaded ? bd!.influence : u.influence).toFixed(3)}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-last-calc-${i}`}>
                                {isLoading ? <SkeletonCell /> : isLoaded && bd?.lastCalculated ? (
                                  <span className="text-[9px] text-slate-600">{formatCrmDate(bd.lastCalculated)}</span>
                                ) : isLoaded ? (
                                  <span className="text-[8px] text-slate-300 italic">never</span>
                                ) : (
                                  <span className="text-[8px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-times-calc-${i}`}>
                                {isLoading ? <SkeletonCell /> : isLoaded ? (
                                  <span className="text-[10px] font-mono text-slate-600 tabular-nums">{bd?.timesCalculated ?? 0}</span>
                                ) : (
                                  <span className="text-[8px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-ta-count-${i}`}>
                                <AwaitingApiBadge />
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-calc-status-${i}`}>
                                <AwaitingApiBadge />
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-runtime-${i}`}>
                                <AwaitingApiBadge />
                              </td>
                              <td className="px-2 py-2.5" data-testid={`cell-last-error-${i}`}>
                                <AwaitingApiBadge />
                              </td>
                              <td className="px-2 py-2.5 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[10px] text-[#7c86ff] hover:text-[#333286] no-default-hover-elevate no-default-active-elevate px-2 h-6"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/profile/${u.npub}`); }}
                                  data-testid={`button-view-user-${i}`}
                                >
                                  <Eye className="h-3 w-3 mr-1" /> View
                                </Button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${u.pubkey}-detail`} className="bg-gradient-to-r from-slate-50/80 to-indigo-50/30" data-testid={`row-user-detail-${i}`}>
                                <td colSpan={14} className="px-5 py-4">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[10px]">
                                    <div className="space-y-2">
                                      <p className="font-bold uppercase tracking-wider text-slate-500 text-[9px]">Identity</p>
                                      <div className="space-y-1.5">
                                        <div>
                                          <p className="text-[8px] text-slate-400 uppercase">Full Pubkey</p>
                                          <p className="font-mono text-slate-700 break-all text-[9px]">{u.pubkey}</p>
                                        </div>
                                        <div>
                                          <p className="text-[8px] text-slate-400 uppercase">Full Nostr npub</p>
                                          <p className="font-mono text-indigo-600 break-all text-[9px]">{u.npub}</p>
                                        </div>
                                        {isLoaded && bd?.taPubkey && (
                                          <div>
                                            <p className="text-[8px] text-slate-400 uppercase">Brainstorm Service Key</p>
                                            <div className="flex items-center gap-1">
                                              <p className="font-mono text-emerald-600 break-all text-[9px]">{bd.taPubkey}</p>
                                              <CopyButton text={bd.taPubkey} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <p className="font-bold uppercase tracking-wider text-slate-500 text-[9px]">Network</p>
                                      {isLoading ? (
                                        <div className="space-y-1">
                                          <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                                          <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
                                        </div>
                                      ) : isLoaded ? (
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Followers</span>
                                            <span className="font-mono text-slate-700 font-medium">{bd!.followerTotal.toLocaleString()}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Following</span>
                                            <span className="font-mono text-slate-700 font-medium">{bd!.followingTotal.toLocaleString()}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Muted By</span>
                                            <span className="font-mono text-slate-700">{bd!.mutedByTotal}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Reported By</span>
                                            <span className="font-mono text-slate-700">{bd!.reportedByTotal}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Influence</span>
                                            <span className="font-mono text-indigo-600 font-medium">{bd!.influence.toFixed(4)}</span>
                                          </div>
                                          {bd!.followerList.length > 0 && (
                                            <div className="mt-1">
                                              <p className="text-[8px] text-slate-400 uppercase mb-0.5">Top Followers (up to 10)</p>
                                              <div className="space-y-0.5">
                                                {bd!.followerList.map((pk, fi) => (
                                                  <div key={fi} className="flex items-center gap-1">
                                                    <span className="text-[7px] font-mono text-slate-500">{pk.slice(0, 8)}...{pk.slice(-4)}</span>
                                                    <CopyButton text={pk} />
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <p className="text-slate-400 italic">No data</p>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <p className="font-bold uppercase tracking-wider text-slate-500 text-[9px]">Calculation History</p>
                                      {isLoading ? (
                                        <div className="space-y-1">
                                          <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
                                          <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                                        </div>
                                      ) : isLoaded ? (
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between">
                                            <span className="text-slate-500">Times Calculated</span>
                                            <span className="font-mono text-slate-700 font-medium">{bd?.timesCalculated ?? 0}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-500">Last Calculated</span>
                                            <p className="font-mono text-slate-700 text-[9px] mt-0.5">{bd?.lastCalculated ? formatCrmDate(bd.lastCalculated) : "never"}</p>
                                          </div>
                                          <div>
                                            <span className="text-slate-500">Last Triggered</span>
                                            <p className="font-mono text-slate-700 text-[9px] mt-0.5">{bd?.lastTriggered ? formatCrmDate(bd.lastTriggered) : "never"}</p>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-slate-400 italic">No data</p>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <p className="font-bold uppercase tracking-wider text-slate-500 text-[9px]">Awaiting Backend API</p>
                                      <div className="space-y-1.5 text-[9px]">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-amber-500" />
                                          <span className="text-slate-500">First Seen Date</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-amber-500" />
                                          <span className="text-slate-500">TA Publish Count</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-amber-500" />
                                          <span className="text-slate-500">Calculation Status (live)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-amber-500" />
                                          <span className="text-slate-500">Runtime Duration</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-amber-500" />
                                          <span className="text-slate-500">Error History Timeline</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-amber-500" />
                                          <span className="text-slate-500">Follower/Following History</span>
                                        </div>
                                      </div>
                                      <p className="text-[8px] text-amber-500 italic mt-2">Requires /admin/users and /admin/users/&#123;pubkey&#125;/history endpoints</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 mt-3">
                                    {u.relations.map(r => (
                                      <span key={r} className={`text-[8px] px-1.5 py-0.5 rounded-full ${RELATION_BADGE_STYLES[r] || "bg-slate-100 text-slate-500 border border-slate-200"}`}>{r}</span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[9px] text-slate-500">Live data from /user/&#123;pubkey&#125;</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-[9px] text-slate-500"><span className="text-amber-500">*</span> Awaiting /admin/users endpoint</span>
                </div>
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
                <div className="px-5 py-4 border-b border-[#7c86ff]/10 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Configured Relays</h3>
                    <p className="text-xs text-slate-500 mt-0.5">WebSocket latency probes (DCoSL + profile relays)</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={runRelayCheck}
                    disabled={relayCheckRunning}
                    className="text-xs gap-1.5 no-default-hover-elevate no-default-active-elevate"
                    data-testid="button-recheck-relays"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${relayCheckRunning ? "animate-spin" : ""}`} />
                    {relayCheckRunning ? "Checking..." : "Re-check"}
                  </Button>
                </div>
                <div className="p-5 space-y-3">
                  {configuredRelays.map((relay, idx) => {
                    const latencyInfo = relayLatencies.find(r => r.url === relay);
                    const relayStatus = latencyInfo?.status ?? (relayCheckRunning ? "degraded" as const : "connected" as const);
                    return (
                      <div key={relay} className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-slate-100" data-testid={`relay-row-${idx}`}>
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                            relayStatus === "connected" ? "bg-emerald-50 border border-emerald-200" :
                            relayStatus === "degraded" ? "bg-amber-50 border border-amber-200" :
                            "bg-red-50 border border-red-200"
                          }`}>
                            {relayStatus === "disconnected" ? (
                              <WifiOff className="h-4 w-4 text-red-600" />
                            ) : (
                              <Wifi className={`h-4 w-4 ${relayStatus === "connected" ? "text-emerald-600" : "text-amber-600"}`} />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{relay === PRIMARY_RELAY ? "DCoSL Relay (primary)" : "Profile Relay"}</p>
                            <p className="text-[10px] font-mono text-slate-400">{relay}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {latencyInfo?.latencyMs !== null && latencyInfo?.latencyMs !== undefined && (
                            <span className={`text-[10px] font-mono font-bold tabular-nums ${
                              latencyInfo.latencyMs < 500 ? "text-emerald-600" :
                              latencyInfo.latencyMs < 2000 ? "text-amber-600" : "text-red-600"
                            }`} data-testid={`relay-latency-${idx}`}>
                              {latencyInfo.latencyMs}ms
                            </span>
                          )}
                          {relayCheckRunning && !latencyInfo && (
                            <span className="text-[10px] text-slate-400 animate-pulse">Probing...</span>
                          )}
                          <StatusBadge status={relayStatus} />
                        </div>
                      </div>
                    );
                  })}
                  {relayLatencies.length > 0 && (
                    <p className="text-[10px] text-slate-400 pt-2">
                      Last checked: {relayLatencies[0].checkedAt.toLocaleTimeString()} · Avg latency: {
                        Math.round(relayLatencies.filter(r => r.latencyMs !== null).reduce((s, r) => s + (r.latencyMs ?? 0), 0) / Math.max(1, relayLatencies.filter(r => r.latencyMs !== null).length))
                      }ms
                    </p>
                  )}
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
                    { name: "/authChallenge/*", ok: true, note: "Auth flow functional", responseTime: "—" },
                    { name: "/user/self", ok: selfQuery.isSuccess, note: selfQuery.isError ? "Query error" : selfQuery.isLoading ? "Loading..." : "OK", responseTime: selfQuery.isSuccess ? "< 2s" : "—" },
                    { name: "/user/graperank", ok: true, note: "POST trigger endpoint", responseTime: "—" },
                    { name: "/user/graperankResult", ok: grapeRankQuery.isSuccess, note: grapeRankQuery.isError ? "Query error" : grapeRankQuery.isLoading ? "Loading..." : "OK", responseTime: grapeRankQuery.isSuccess ? "< 2s" : "—" },
                    { name: "/admin/users", ok: false, note: "Endpoint not supported", responseTime: "N/A" }, // API endpoint not supported
                    { name: "/admin/system", ok: false, note: "Endpoint not supported", responseTime: "N/A" }, // API endpoint not supported
                    { name: "/admin/analytics", ok: false, note: "Endpoint not supported", responseTime: "N/A" }, // API endpoint not supported
                  ].map(ep => (
                    <div key={ep.name} className="flex items-center justify-between p-2.5 rounded-lg bg-white/40 border border-slate-50" data-testid={`health-ep-${ep.name.replace(/[\/*]/g, "-")}`}>
                      <div className="flex items-center gap-2">
                        {ep.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                        <span className="text-xs font-mono text-slate-700">{ep.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-400">{ep.responseTime}</span>
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
                    { icon: Cpu, label: "GrapeRank Engine", detail: "Trust computation pipeline", status: (calcDone ? "Idle" as const : grapeRank ? "Processing" as const : "Idle" as const) },
                    { icon: Zap, label: "NIP-85 Publisher", detail: "Trust assertion broadcaster (kind 10040)", status: "Operational" as const },
                    { icon: Globe, label: "Brainstorm Server", detail: "brainstormserver-staging.nosfabrica.com", status: (selfQuery.isSuccess ? "Operational" as const : "Degraded" as const) },
                  ].map(comp => (
                    <div key={comp.label} className="p-4 rounded-xl bg-white/50 border border-slate-100 space-y-2" data-testid={`infra-${comp.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      <div className="flex items-center gap-2">
                        <comp.icon className="h-4 w-4 text-[#333286]" />
                        <span className="text-xs font-bold text-slate-800">{comp.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{comp.detail}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                        comp.status === "Processing" ? "text-amber-600" : comp.status === "Degraded" ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          comp.status === "Processing" ? "bg-amber-500 animate-pulse" : comp.status === "Degraded" ? "bg-amber-500" : "bg-emerald-500"
                        }`} />
                        {comp.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* NIP-85 relay publish health */}
              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-nip85-health">
                <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>NIP-85 Publish Health</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Trust assertion event (kind 10040) publish metrics</p>
                </div>
                <div className="p-5 space-y-3">
                  {/* API endpoint not supported: /admin/system — NIP-85 publish success/failure rate */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/40 border border-slate-50">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-[#333286]" />
                      <span className="text-xs text-slate-700">Events Published</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 italic">Requires /admin/system</span>
                      <StatusBadge status="disconnected" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/40 border border-slate-50">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs text-slate-700">Publish Success Rate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 italic">Requires /admin/system</span>
                      <StatusBadge status="disconnected" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/40 border border-slate-50">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs text-slate-700">Failed Publishes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 italic">Requires /admin/system</span>
                      <StatusBadge status="disconnected" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/40 border border-slate-50">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs text-slate-700">Relay Acceptance Rate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 italic">Requires /admin/system</span>
                      <StatusBadge status="disconnected" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 italic pt-1">
                    NIP-85 trust assertion publish metrics (event counts, success/failure rates, per-relay acceptance) require the /admin/system endpoint.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-pipeline-stats">
                <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>GrapeRank Pipeline Stats</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Calculation success/failure tracking from available data</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center">
                      <Hash className="h-4 w-4 text-[#333286] mx-auto mb-1" />
                      <p className="text-lg font-bold text-slate-900">{timesCalculated ?? "—"}</p>
                      <p className="text-[10px] text-slate-500">Total Calculations</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                      <p className="text-lg font-bold text-slate-900">{calcDone ? "Yes" : "No"}</p>
                      <p className="text-[10px] text-slate-500">Last Success</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center">
                      <XCircle className="h-4 w-4 text-red-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-slate-900">{(calcStatus?.toLowerCase() === "failure" || taStatus?.toLowerCase() === "failure") ? "Yes" : "No"}</p>
                      <p className="text-[10px] text-slate-500">Failures Detected</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center">
                      <Clock className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                      <p className="text-lg font-bold text-slate-900">{queuePosition ?? "—"}</p>
                      <p className="text-[10px] text-slate-500">Stuck / Queued</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3 italic">
                    Detailed per-job success/failure rates and runtime metrics require the /admin/system endpoint (not yet supported).
                  </p>
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
                      { event: "Admin dashboard accessed", type: "info" as const, detail: `Authenticated as ${user.npub.slice(0, 16)}...`, timestamp: SESSION_START.toLocaleTimeString() },
                      { event: "/user/self query", type: (selfQuery.isSuccess ? "success" as const : selfQuery.isError ? "error" as const : "info" as const), detail: selfQuery.isSuccess ? `Graph loaded — ${allUsers.length} unique pubkeys` : selfQuery.isError ? "Failed to load user data" : "Loading...", timestamp: selfQuery.isSuccess ? "Completed" : "—" },
                      { event: "/user/graperankResult query", type: (grapeRankQuery.isSuccess ? "success" as const : grapeRankQuery.isError ? "error" as const : "info" as const), detail: grapeRankQuery.isSuccess ? `Status: ${grapeRank?.internal_publication_status ?? "unknown"}` : grapeRankQuery.isError ? "Failed to load GrapeRank data" : "Loading...", timestamp: grapeRankQuery.isSuccess ? "Completed" : "—" },
                      { event: "GrapeRank calculation history", type: "info" as const, detail: timesCalculated !== null ? `Calculated ${timesCalculated} time(s)` : "History not available", timestamp: lastCalcTime ? new Date(lastCalcTime).toLocaleTimeString() : "—" },
                      { event: "Last trigger", type: "info" as const, detail: lastTriggerTime ? new Date(lastTriggerTime).toLocaleString() : "—", timestamp: lastTriggerTime ? new Date(lastTriggerTime).toLocaleTimeString() : "—" },
                      { event: "Last calculation", type: "info" as const, detail: lastCalcTime ? new Date(lastCalcTime).toLocaleString() : "—", timestamp: lastCalcTime ? new Date(lastCalcTime).toLocaleTimeString() : "—" },
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
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-800">{entry.event}</p>
                            <span className="text-[10px] font-mono text-slate-400">{entry.timestamp}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{entry.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-error-log">
                <div className="h-1 w-full bg-gradient-to-r from-red-400 via-red-500 to-red-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Error Log</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Recent errors from API queries and pipeline status</p>
                </div>
                <div className="p-5">
                  {(() => {
                    const errors: Array<{ user: string; timestamp: string; message: string; source: string }> = [];
                    if (selfQuery.isError) {
                      errors.push({ user: user.npub.slice(0, 12) + "...", timestamp: new Date().toLocaleString(), message: "Failed to fetch /user/self graph data", source: "API Query" });
                    }
                    if (grapeRankQuery.isError) {
                      errors.push({ user: user.npub.slice(0, 12) + "...", timestamp: new Date().toLocaleString(), message: "Failed to fetch /user/graperankResult", source: "API Query" });
                    }
                    if (grapeRank && (calcStatus?.toLowerCase() === "failure" || taStatus?.toLowerCase() === "failure")) {
                      errors.push({
                        user: historyData?.ta_pubkey?.slice(0, 12) ?? user.npub.slice(0, 12) + "...",
                        timestamp: lastUpdated ? new Date(lastUpdated).toLocaleString() : new Date().toLocaleString(),
                        message: `Pipeline failure — Status: ${calcStatus ?? "—"} | TA: ${taStatus ?? "—"} | Internal: ${grapeRank.internal_publication_status ?? "—"}`,
                        source: "GrapeRank Pipeline",
                      });
                    }
                    if (errors.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <CheckCircle2 className="h-8 w-8 text-emerald-300 mb-2" />
                          <p className="text-sm font-semibold text-slate-400">No Errors</p>
                          <p className="text-xs text-slate-400 mt-1">No errors detected in current session.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left" data-testid="table-error-log">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">User</th>
                              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Timestamp</th>
                              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</th>
                              <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {errors.map((err, i) => (
                              <tr key={i} className="border-b border-slate-50" data-testid={`error-row-${i}`}>
                                <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{err.user}</td>
                                <td className="px-3 py-2 text-[10px] text-slate-500">{err.timestamp}</td>
                                <td className="px-3 py-2">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold">{err.source}</span>
                                </td>
                                <td className="px-3 py-2 text-[10px] text-red-700">{err.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-login-timeline">
                <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-blue-500 to-indigo-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Login Timeline</h3>
                  <p className="text-xs text-slate-500 mt-0.5">User authentication events — requires /admin/analytics endpoint</p>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 mb-4">
                    <LogIn className="h-4 w-4 text-indigo-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-indigo-800">Current Session</p>
                      <p className="text-[10px] text-indigo-600">Admin login at {SESSION_START.toLocaleString()} · {user.displayName || "Anonymous"} ({user.npub.slice(0, 16)}...)</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-2">
                      <CalendarDays className="h-5 w-5 text-slate-300" />
                    </div>
                    <p className="text-xs font-semibold text-slate-400">Historical Login Data Unavailable</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-xs">Full login timeline with user/timestamp pairs requires a dedicated /admin/analytics endpoint (not yet supported).</p>
                    <div className="mt-2">
                      <StatusBadge status="disconnected" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-feature-usage">
                <div className="h-1 w-full bg-gradient-to-r from-violet-400 via-fuchsia-500 to-violet-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Feature Usage Breakdown</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Page views, search queries, profile views, and GrapeRank triggers — requires /admin/analytics</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Dashboard Views", icon: Home, value: "—" },
                      { label: "Search Queries", icon: Search, value: "—" },
                      { label: "Profile Views", icon: Eye, value: "—" },
                      { label: "GrapeRank Triggers", icon: Zap, value: "—" },
                    ].map(feat => (
                      <div key={feat.label} className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid={`feature-${feat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        <feat.icon className="h-4 w-4 text-slate-300 mx-auto mb-1" />
                        <p className="text-lg font-bold text-slate-300">{feat.value}</p>
                        <p className="text-[10px] text-slate-400">{feat.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <StatusBadge status="disconnected" />
                    <span className="text-[10px] text-slate-400">Requires /admin/analytics endpoint</span>
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
