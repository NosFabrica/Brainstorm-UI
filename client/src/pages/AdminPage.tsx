import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Copy,
  Globe,
  RefreshCw,
  Hash,
  Eye,
  Play,
  Loader2,
  ShieldCheck,
  KeyRound,
  UserPlus,
  Calendar,
  ArrowRight,
  User,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { getCurrentUser, logout, fetchProfile, searchNostrProfiles, PROFILE_RELAYS, type NostrUser, type NostrSearchResult } from "@/services/nostr";
import { apiClient, isAuthRedirecting, getApiEnvironment, setApiEnvironment, getApiBaseUrl, type ApiEnvironment } from "@/services/api";
import { isAdminPubkey } from "@/config/adminAccess";
import { useToast } from "@/hooks/use-toast";

type AdminTab = "overview" | "users" | "health" | "activity";
type SortDir = "asc" | "desc";
type PageSizeOption = 25 | 50 | 100;
type ActivityTimeRange = "24h" | "week" | "month" | "quarter" | "all";

function formatTimestamp(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

const POLL_OVERVIEW_MS = 15_000;
const POLL_USERS_MS = 10_000;
const POLL_ACTIVITY_MS = 10_000;
const POLL_STATS_MS = 30_000;
const BOOST_INTERVAL_MS = 4_000;
const BOOST_DURATION_MS = 60_000;

function formatRelativeAge(timestamp: number, now: number): string {
  if (!timestamp) return "—";
  const diff = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function LiveBadge({ updatedAt, boosting, isFetching }: { updatedAt: number; boosting: boolean; isFetching?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const label = formatRelativeAge(updatedAt, now);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border ${
        boosting
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
      title={boosting ? "Refreshing more frequently after a recent trigger" : "Auto-refresh enabled"}
      data-testid="badge-live-updated"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${(isFetching || boosting) ? "animate-ping" : ""} ${boosting ? "bg-amber-400" : "bg-emerald-400"}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${boosting ? "bg-amber-500" : "bg-emerald-500"}`} />
      </span>
      <span className="normal-case font-medium tracking-normal text-[10px]">{boosting ? "Boosted • " : "Live • "}{label}</span>
    </span>
  );
}

interface SortState {
  key: AdminSortKey;
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

interface AdminUserListItem {
  pubkey: string;
  ta_pubkey: string | null;
  times_calculated: number;
  last_triggered: string;
  last_updated: string;
  latest_status: string | null;
  latest_ta_status: string | null;
  latest_algorithm: string | null;
}

interface AdminUsersPage {
  items: AdminUserListItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

interface BrainstormRequestInstance {
  created_at: string;
  updated_at: string;
  private_id: number;
  status: string;
  ta_status: string | null;
  internal_publication_status: string | null;
  result: string | null;
  count_values: string | null;
  password: string;
  algorithm: string;
  parameters: string;
  how_many_others_with_priority: number;
  pubkey: string | null;
}

interface AdminUserHistoryPage {
  items: BrainstormRequestInstance[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

type AdminSortKey = "pubkey" | "times_calculated" | "last_triggered" | "last_updated";

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

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
    if (isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    if (diff < 0) return "just now";
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } catch { return ""; }
}

function getUserHealth(status: string | null, taStatus: string | null, timesCalc: number): "green" | "amber" | "red" | "gray" {
  if (timesCalc === 0) return "gray";
  const s = status?.toLowerCase();
  const t = taStatus?.toLowerCase();
  const sFail = s === "failed" || s === "failure";
  const tFail = t === "failed" || t === "failure";
  if (sFail && tFail) return "red";
  if (sFail || tFail) return "amber";
  if (s === "success") return "green";
  return "gray";
}


function StatusBadge({ status }: { status: "connected" | "degraded" | "disconnected" }) {
  const config = {
    connected: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", ping: "bg-emerald-400", label: "Connected" },
    degraded: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500", ping: "bg-amber-400", label: "Degraded" },
    disconnected: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", ping: "", label: "Not Connected" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${config.bg} border ${config.border}`} data-testid={`badge-status-${status}`}>
      <span className="relative flex h-1 w-1">
        {config.ping && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.ping} opacity-75`} />}
        <span className={`relative inline-flex rounded-full h-1 w-1 ${config.dot}`} />
      </span>
      <span className={`text-[8px] font-semibold uppercase tracking-wider ${config.text} whitespace-nowrap`}>{config.label}</span>
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, trend, subtitle, unsupported, tooltip, scope, onClick }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; up: boolean };
  subtitle?: string;
  unsupported?: boolean;
  tooltip?: string;
  scope?: "system" | "graph";
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] px-3 py-3 group hover:shadow-[0_12px_24px_-8px_rgba(124,134,255,0.2)] hover:border-[#7c86ff]/40 hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden flex flex-col min-h-[120px] ${onClick ? "cursor-pointer" : ""}`}
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
      title={tooltip}
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-[#7c86ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl" />
      <div className="flex items-start justify-between mb-2 relative">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#7c86ff]/10 to-[#333286]/10 border border-[#7c86ff]/15 flex items-center justify-center">
          <Icon className="h-4 w-4 text-[#333286]" />
        </div>
        {scope && (
          <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${scope === "system" ? "bg-indigo-50 text-indigo-600 border border-indigo-200" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
            {scope === "system" ? "System" : "Your graph"}
          </span>
        )}
        {trend && !scope && (
          <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${trend.up ? "text-emerald-600" : "text-red-500"}`}>
            {trend.up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className={`text-xl font-bold tracking-tight relative ${unsupported ? "text-slate-300" : "text-slate-900"}`} style={{ fontFamily: "var(--font-display)" }}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 relative leading-tight">{label}</p>
      {subtitle && <p className="text-[9px] text-slate-400 mt-0.5 relative">{subtitle}</p>}
      <div className="mt-auto pt-1.5 relative">
        {unsupported ? <StatusBadge status="disconnected" /> : <StatusBadge status="connected" />}
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, currentSort, onSort }: {
  label: string;
  sortKey: AdminSortKey;
  currentSort: SortState;
  onSort: (key: AdminSortKey) => void;
}) {
  const active = currentSort.key === sortKey;
  return (
    <button
      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
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

function UserHistoryRow({ pubkey, npub, taPubkey }: { pubkey: string; npub: string; taPubkey: string | null }) {
  const historyQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/users", pubkey, "history"],
    queryFn: () => apiClient.getAdminUserHistory(pubkey, { page: 1, size: 10 }),
    staleTime: 30_000,
  });

  return (
    <tr className="bg-gradient-to-r from-slate-50/80 to-indigo-50/30" data-testid={`row-user-detail-${pubkey.slice(0, 8)}`}>
      <td colSpan={11} className="px-5 py-4">
        <div className="space-y-4 text-[10px]">
          <div>
            <p className="font-bold uppercase tracking-wider text-slate-500 text-[9px] mb-2">Identity</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm min-w-0">
                <p className="text-[8px] text-slate-400 uppercase mb-0.5">Full Pubkey</p>
                <div className="flex items-center gap-1 min-w-0">
                  <p className="font-mono text-slate-700 text-[9px] truncate">{pubkey}</p>
                  <CopyButton text={pubkey} />
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm min-w-0">
                <p className="text-[8px] text-slate-400 uppercase mb-0.5">Nostr npub</p>
                <div className="flex items-center gap-1 min-w-0">
                  <p className="font-mono text-indigo-600 text-[9px] truncate">{npub}</p>
                  <CopyButton text={npub} />
                </div>
              </div>
              {taPubkey && (
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm min-w-0">
                  <p className="text-[8px] text-slate-400 uppercase mb-0.5">TA Pubkey</p>
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="font-mono text-emerald-600 text-[9px] truncate">{taPubkey}</p>
                    <CopyButton text={taPubkey} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 p-4 rounded-xl bg-white border border-indigo-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#333286]" />
                <p className="font-bold text-xs text-slate-800" style={{ fontFamily: "var(--font-display)" }}>Calculation History</p>
              </div>
              {historyQuery.data && historyQuery.data.total > 0 && (
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{historyQuery.data.total} records</span>
              )}
            </div>
            {historyQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-5 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-5 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-5 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ) : historyQuery.isError ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-600">Failed to load calculation history</p>
              </div>
            ) : historyQuery.data && historyQuery.data.items.length > 0 ? (
              <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-slate-200 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-100 border-b-2 border-slate-200">
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Date</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Status</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Algorithm</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">TA Status</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Publication</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Queue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyQuery.data.items.map((item, idx) => {
                      const hasFail = item.status.toLowerCase() === "failure" || item.ta_status?.toLowerCase() === "failure" || item.internal_publication_status?.toLowerCase() === "failure" || item.internal_publication_status?.toLowerCase() === "failed";
                      const errorDetail = hasFail ? (item.result || null) : null;
                      return (
                        <Fragment key={item.private_id ?? idx}>
                          <tr className={`border-b ${errorDetail ? "border-red-200 bg-red-50/20" : idx % 2 === 0 ? "border-slate-100 bg-white" : "border-slate-100 bg-slate-50/40"} hover:bg-indigo-50/30 transition-colors`}>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="text-[11px] font-medium text-slate-700">{formatTimestamp(item.created_at)}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                item.status.toLowerCase() === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                item.status.toLowerCase() === "failure" ? "bg-red-50 text-red-700 border border-red-200" :
                                "bg-slate-50 text-slate-600 border border-slate-200"
                              }`}>{item.status}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[11px] font-mono font-semibold text-[#333286]">{item.algorithm}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {item.ta_status ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  item.ta_status.toLowerCase() === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                  item.ta_status.toLowerCase() === "failure" ? "bg-red-50 text-red-700 border border-red-200" :
                                  "bg-slate-50 text-slate-600 border border-slate-200"
                                }`}>{item.ta_status}</span>
                              ) : (
                                <span className="text-[11px] text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {item.internal_publication_status ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  item.internal_publication_status.toLowerCase() === "success" || item.internal_publication_status.toLowerCase() === "published" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                  item.internal_publication_status.toLowerCase() === "failure" || item.internal_publication_status.toLowerCase() === "failed" ? "bg-red-50 text-red-700 border border-red-200" :
                                  item.internal_publication_status.toLowerCase() === "pending" || item.internal_publication_status.toLowerCase() === "in_progress" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                  "bg-slate-50 text-slate-600 border border-slate-200"
                                }`}>{item.internal_publication_status}</span>
                              ) : (
                                <span className="text-[11px] text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[11px] font-medium text-slate-600 tabular-nums">{item.how_many_others_with_priority > 0 ? item.how_many_others_with_priority : "—"}</span>
                            </td>
                          </tr>
                          {errorDetail && (
                            <tr className="border-b border-red-200 bg-red-50/60">
                              <td colSpan={6} className="px-4 py-2">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                  <span className="text-[11px] text-red-700 font-mono break-all">{errorDetail}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <Clock className="h-4 w-4 text-slate-300" />
                <p className="text-xs text-slate-400">No calculation history available</p>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}


function ActivityStatusBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const lower = value.toLowerCase();
  const colors = lower === "success" || lower === "done" || lower === "published"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : lower === "failure" || lower === "failed" || lower === "error"
    ? "bg-red-50 text-red-700 border-red-200"
    : lower === "pending" || lower === "queued" || lower === "in_progress"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-50 text-slate-600 border-slate-200";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors}`} data-testid="badge-activity-status">{value}</span>;
}

function getActivityPipelineState(item: BrainstormRequestInstance) {
  const s = item.status?.toLowerCase() ?? "";
  if (s === "ongoing" || s === "in_progress" || s === "processing") return "active" as const;
  if (s === "waiting" || s === "queued" || s === "pending") return "waiting" as const;
  if (s === "failure" || s === "failed" || s === "error") return "failed" as const;
  return "complete" as const;
}

function isFailedStatus(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v === "failure" || v === "failed" || v === "error";
}

function isItemFailed(item: BrainstormRequestInstance): boolean {
  return isFailedStatus(item.status) || isFailedStatus(item.ta_status) || isFailedStatus(item.internal_publication_status);
}

function getFailureStage(item: BrainstormRequestInstance): "Calculation" | "Trust Attestation" | "Publication" | null {
  if (isFailedStatus(item.status)) return "Calculation";
  if (isFailedStatus(item.ta_status)) return "Trust Attestation";
  if (isFailedStatus(item.internal_publication_status)) return "Publication";
  return null;
}

function extractErrorMessage(item: BrainstormRequestInstance): string {
  const raw = item.result?.trim();
  if (raw) return raw;
  const stage = getFailureStage(item);
  if (stage) return `${stage} failed (no error message reported by server).`;
  return "Failed (no details available).";
}

function truncateError(text: string, maxLen = 140): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "…";
}

function normalizeErrorKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/0x[0-9a-f]{6,}/g, "<hex>")
    .replace(/\b[0-9a-f]{16,}\b/g, "<hex>")
    .replace(/\b\d{4,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function ConfirmRetriggerButton({
  pubkey,
  onConfirm,
  className = "",
  testId,
}: {
  pubkey: string;
  onConfirm: (pubkey: string) => Promise<void>;
  className?: string;
  testId?: string;
}) {
  const [state, setState] = useState<"idle" | "confirming" | "running" | "done" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === "running") return;
    if (state === "idle" || state === "done" || state === "error") {
      setState("confirming");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState("idle"), 3000);
      return;
    }
    if (state === "confirming") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState("running");
      try {
        await onConfirm(pubkey);
        setState("done");
        setTimeout(() => setState("idle"), 2000);
      } catch {
        setState("error");
        setTimeout(() => setState("idle"), 2500);
      }
    }
  };
  return (
    <button
      onClick={handleClick}
      disabled={state === "running"}
      className={`text-[10px] font-semibold inline-flex items-center gap-1 transition-colors ${
        state === "confirming" ? "text-amber-700 animate-pulse" :
        state === "done" ? "text-emerald-700" :
        state === "error" ? "text-red-700" :
        state === "running" ? "text-slate-400" :
        "text-red-700 hover:text-red-900"
      } ${className}`}
      data-testid={testId}
    >
      {state === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> :
       state === "confirming" ? <><RefreshCw className="h-3 w-3" /><span>Confirm re-trigger?</span></> :
       state === "done" ? <><CheckCircle2 className="h-3 w-3" /><span>Re-triggered</span></> :
       state === "error" ? <><XCircle className="h-3 w-3" /><span>Failed</span></> :
       <><RefreshCw className="h-3 w-3" /><span>Re-trigger</span></>}
    </button>
  );
}

function FailureDetailCard({
  item,
  onRetrigger,
  retriggerState,
  isInPipeline,
  onViewDetail,
}: {
  item: BrainstormRequestInstance;
  onRetrigger?: (e: React.MouseEvent) => void;
  retriggerState?: "idle" | "confirming" | "running" | "done" | "error";
  isInPipeline?: boolean;
  onViewDetail?: (e: React.MouseEvent) => void;
}) {
  const stage = getFailureStage(item) ?? "Pipeline";
  const errorText = extractErrorMessage(item);
  const fmtFull = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d.endsWith("Z") ? d : d + "Z").toLocaleString(); } catch { return d; }
  };
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/70 p-3" data-testid={`failure-detail-${item.private_id ?? "x"}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-red-800 uppercase tracking-wider">Failed at {stage}</span>
            <span className="text-[10px] text-red-600/80">Request #{item.private_id}</span>
          </div>
          <p className="mt-1.5 text-[11px] text-red-900 font-mono break-words whitespace-pre-wrap leading-relaxed" data-testid={`failure-message-${item.private_id ?? "x"}`}>
            {errorText}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-red-700/80">
            <span>Algorithm: <span className="font-mono">{item.algorithm || "—"}</span></span>
            <span>Created: {fmtFull(item.created_at)}</span>
            <span>Updated: {fmtFull(item.updated_at)}</span>
            {item.how_many_others_with_priority > 0 && <span>Queue depth: {item.how_many_others_with_priority}</span>}
          </div>
          {(onRetrigger || onViewDetail) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {onRetrigger && item.pubkey && (
                <button
                  onClick={onRetrigger}
                  disabled={retriggerState === "running" || isInPipeline}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border ${
                    isInPipeline ? "text-slate-400 bg-white border-slate-200 cursor-not-allowed" :
                    retriggerState === "confirming" ? "text-amber-800 bg-amber-50 border-amber-300 animate-pulse" :
                    retriggerState === "done" ? "text-emerald-700 bg-emerald-50 border-emerald-300" :
                    retriggerState === "error" ? "text-red-700 bg-red-100 border-red-300" :
                    retriggerState === "running" ? "text-slate-500 bg-white border-slate-200" :
                    "text-red-700 bg-white border-red-300 hover:bg-red-100"
                  }`}
                  data-testid={`failure-retrigger-${item.private_id}`}
                >
                  {retriggerState === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> :
                   retriggerState === "confirming" ? <><RefreshCw className="h-3 w-3" /><span>Confirm re-trigger?</span></> :
                   retriggerState === "done" ? <><CheckCircle2 className="h-3 w-3" /><span>Re-triggered</span></> :
                   retriggerState === "error" ? <><XCircle className="h-3 w-3" /><span>Re-trigger failed</span></> :
                   <><RefreshCw className="h-3 w-3" /><span>Re-trigger GrapeRank</span></>}
                </button>
              )}
              {onViewDetail && (
                <button
                  onClick={onViewDetail}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 transition-colors"
                  data-testid={`failure-view-detail-${item.private_id}`}
                >
                  <Eye className="h-3 w-3" /> View Full Request
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pipelineRowStyles = {
  active: {
    row: "bg-blue-50/50 border-l-[3px] border-l-blue-500 border-b border-b-blue-100/60",
    hover: "hover:bg-blue-100/40",
    expanded: "bg-blue-50/30",
    expandedBorder: "border-blue-200/40",
    label: "PROCESSING",
    labelClass: "bg-blue-500/10 text-blue-700 border-blue-300/50",
    dot: "bg-blue-500",
    dotPulse: "bg-blue-400",
  },
  waiting: {
    row: "bg-amber-50/40 border-l-[3px] border-l-amber-400 border-b border-b-amber-100/50",
    hover: "hover:bg-amber-100/30",
    expanded: "bg-amber-50/20",
    expandedBorder: "border-amber-200/40",
    label: "IN QUEUE",
    labelClass: "bg-amber-500/10 text-amber-700 border-amber-300/50",
    dot: "bg-amber-500",
    dotPulse: "bg-amber-400",
  },
  failed: {
    row: "bg-red-50/30 border-l-[3px] border-l-red-300 border-b border-b-red-100/40",
    hover: "hover:bg-red-50/50",
    expanded: "bg-red-50/20",
    expandedBorder: "border-red-200/40",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
  complete: {
    row: "border-l-[3px] border-l-transparent border-b border-b-slate-100/60",
    hover: "hover:bg-indigo-50/30",
    expanded: "bg-indigo-50/20",
    expandedBorder: "border-indigo-100/60",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
};

function ActivityRow({ item, idx, onViewDetail, onNavigateToUser, onRetrigger }: { item: BrainstormRequestInstance; idx: number; onViewDetail: (item: BrainstormRequestInstance) => void; onNavigateToUser?: (pubkey: string) => void; onRetrigger?: (pubkey: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [retriggerState, setRetriggerState] = useState<"idle" | "confirming" | "running" | "done" | "error">("idle");
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      if (isNaN(date.getTime())) return d;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  };
  const pipeline = getActivityPipelineState(item);
  const style = pipelineRowStyles[pipeline];
  const isInPipeline = pipeline === "active" || pipeline === "waiting";
  const isFailed = isItemFailed(item);
  const failureStage = getFailureStage(item);
  const baseRowBg = pipeline === "complete" ? (idx % 2 === 0 ? "bg-white/40" : "bg-slate-50/30") : "";

  const handleRetrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retriggerState === "running" || isInPipeline || !item.pubkey || !onRetrigger) return;
    if (retriggerState === "idle" || retriggerState === "done" || retriggerState === "error") {
      setRetriggerState("confirming");
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => setRetriggerState("idle"), 3000);
      return;
    }
    if (retriggerState === "confirming") {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      setRetriggerState("running");
      try {
        await onRetrigger(item.pubkey);
        setRetriggerState("done");
        setTimeout(() => setRetriggerState("idle"), 2000);
      } catch {
        setRetriggerState("error");
        setTimeout(() => setRetriggerState("idle"), 2000);
      }
    }
  };

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${style.row} ${style.hover} ${baseRowBg}`}
        onClick={() => setExpanded(prev => !prev)}
        data-testid={`row-activity-${item.private_id ?? idx}`}
      >
        <td className="px-2 py-2 text-slate-500 whitespace-nowrap text-[10px]">
          <div className="flex items-center gap-1.5">
            {isInPipeline && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${style.dotPulse}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${style.dot}`} />
              </span>
            )}
            {fmtDate(item.created_at)}
          </div>
        </td>
        <td className="px-2 py-2 text-slate-500 whitespace-nowrap text-[10px]">{fmtDate(item.updated_at)}</td>
        <td className="px-2 py-2 font-mono text-[10px]">
          {item.pubkey ? (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateToUser?.(item.pubkey); }}
              className="text-[#333286] hover:text-[#7c86ff] hover:underline transition-colors cursor-pointer"
              data-testid={`link-user-${item.pubkey?.slice(0, 8)}`}
            >
              {item.pubkey.slice(0, 8)}...{item.pubkey.slice(-4)}
            </button>
          ) : "—"}
        </td>
        <td className="px-2 py-2"><ActivityStatusBadge value={item.status} /></td>
        <td className="px-2 py-2"><ActivityStatusBadge value={item.ta_status} /></td>
        <td className="px-2 py-2"><ActivityStatusBadge value={item.internal_publication_status} /></td>
        <td className="px-2 py-2 font-mono text-slate-600 text-[10px]">{item.algorithm || "—"}</td>
        <td className="px-2 py-2 text-center text-slate-600 text-[10px]">{item.how_many_others_with_priority}</td>
        <td className="px-2 py-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-slate-400">{item.private_id}</span>
            {isInPipeline && style.label && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${style.labelClass}`}>
                {style.label}
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          {item.pubkey && onRetrigger && (
            <button
              onClick={handleRetrigger}
              disabled={retriggerState === "running" || isInPipeline}
              className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                isInPipeline ? "text-slate-300 cursor-not-allowed" :
                retriggerState === "confirming" ? "text-amber-700 bg-amber-50 border border-amber-300 animate-pulse" :
                retriggerState === "done" ? "text-emerald-600 bg-emerald-50 border border-emerald-200" :
                retriggerState === "error" ? "text-red-500 bg-red-50 border border-red-200" :
                retriggerState === "running" ? "text-slate-400" :
                "text-[#333286] hover:bg-[#333286]/5 hover:text-[#7c86ff] border border-transparent hover:border-[#7c86ff]/20"
              }`}
              title={isInPipeline ? "Currently processing" : retriggerState === "confirming" ? "Click again to confirm" : "Re-trigger GrapeRank"}
              data-testid={`button-retrigger-${item.private_id}`}
            >
              {retriggerState === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> :
               retriggerState === "confirming" ? <><RefreshCw className="h-3 w-3" /><span>Confirm?</span></> :
               retriggerState === "done" ? <><CheckCircle2 className="h-3 w-3" /><span className="hidden sm:inline">Done</span></> :
               retriggerState === "error" ? <><XCircle className="h-3 w-3" /><span className="hidden sm:inline">Failed</span></> :
               isInPipeline ? <><Loader2 className="h-3 w-3 animate-spin opacity-40" /><span className="hidden sm:inline">Active</span></> :
               <><RefreshCw className="h-3 w-3" /><span className="hidden sm:inline">Re-trigger</span></>}
            </button>
          )}
        </td>
      </tr>
      {isFailed && !expanded && (
        <tr
          className={`cursor-pointer ${style.row} ${style.hover}`}
          onClick={() => setExpanded(true)}
          data-testid={`row-activity-failure-preview-${item.private_id ?? idx}`}
        >
          <td colSpan={10} className="px-4 py-1.5 border-t border-red-100/50">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider mr-1.5">Failed at {failureStage ?? "Pipeline"}:</span>
                <span className="text-[10px] text-red-800 font-mono break-words">{truncateError(extractErrorMessage(item), 160)}</span>
                <span className="ml-2 text-[9px] text-red-500/70 italic">Click for details</span>
              </div>
            </div>
          </td>
        </tr>
      )}
      {expanded && (
        <tr className={style.expanded}>
          <td colSpan={10} className="px-4 py-3">
            {isFailed && (
              <div className="mb-3">
                <FailureDetailCard
                  item={item}
                  onRetrigger={item.pubkey && onRetrigger ? handleRetrigger : undefined}
                  retriggerState={retriggerState}
                  isInPipeline={isInPipeline}
                  onViewDetail={(e) => { e.stopPropagation(); onViewDetail(item); }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
              {item.pubkey && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Full Pubkey</span>
                  <p className="text-slate-700 font-mono mt-0.5 break-all text-[9px]">{item.pubkey}</p>
                </div>
              )}
              {item.result && !isFailed && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Result</span>
                  <p className="text-slate-700 font-mono mt-0.5 break-all">{item.result}</p>
                </div>
              )}
              {item.count_values && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Count Values</span>
                  <p className="text-slate-700 font-mono mt-0.5 break-all">{item.count_values}</p>
                </div>
              )}
              {item.parameters && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Parameters</span>
                  <p className="text-slate-700 font-mono mt-0.5 break-all">{item.parameters}</p>
                </div>
              )}
            </div>
            {!isFailed && (
              <div className={`mt-3 pt-2 border-t ${style.expandedBorder} flex flex-wrap items-center gap-3`}>
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetail(item); }}
                  className="text-[10px] font-semibold text-[#333286] hover:text-[#7c86ff] transition-colors flex items-center gap-1 min-h-[28px]"
                  data-testid={`button-view-detail-${item.private_id}`}
                >
                  <Eye className="h-3 w-3" />
                  View Full Request
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileTabDropdownOpen, setMobileTabDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "users" || tab === "activity" || tab === "system") return tab;
    return "overview";
  });
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [daysFilter, setDaysFilter] = useState(30);
  const [userSort, setUserSort] = useState<SortState>({ key: "last_triggered", dir: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [activityPage, setActivityPage] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState<PageSizeOption>(25);
  const [activityTimeRange, setActivityTimeRange] = useState<ActivityTimeRange>("24h");
  const [kpiFilter, setKpiFilter] = useState<"scored" | "sp_adopters" | "queue" | null>(null);
  const [relayLatencies, setRelayLatencies] = useState<RelayLatency[]>([]);
  const [relayCheckRunning, setRelayCheckRunning] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    const params = new URLSearchParams(window.location.search);
    const hl = params.get("highlight");
    return hl ? new Set([hl]) : new Set();
  });
  const [triggeringPubkeys, setTriggeringPubkeys] = useState<Set<string>>(new Set());
  const [isBoostActive, setIsBoostActive] = useState(false);
  const boostTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRefreshBoost = useCallback(() => {
    setIsBoostActive(true);
    if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
    boostTimeoutRef.current = setTimeout(() => setIsBoostActive(false), BOOST_DURATION_MS);
  }, []);
  useEffect(() => () => { if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current); }, []);
  const [triggerConfirmPubkey, setTriggerConfirmPubkey] = useState<string | null>(null);
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rotateRunning, setRotateRunning] = useState(false);
  const [rotateResult, setRotateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotateAcknowledged, setRotateAcknowledged] = useState(false);
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupMode, setLookupMode] = useState<"lookup" | "onboard">("lookup");
  const [lookupInput, setLookupInput] = useState("");
  const [lookupRunning, setLookupRunning] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ success: boolean; message: string; data?: Record<string, unknown> } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNameResults, setLookupNameResults] = useState<{ pubkey: string; name?: string; picture?: string }[]>([]);
  const [highlightedPubkey, setHighlightedPubkey] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight") || null;
  });
  const [onboardSearch, setOnboardSearch] = useState("");
  const [onboardSearching, setOnboardSearching] = useState(false);
  const [onboardResults, setOnboardResults] = useState<NostrSearchResult[]>([]);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardQueue, setOnboardQueue] = useState<NostrSearchResult[]>([]);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteInput, setBulkPasteInput] = useState("");
  const [onboardingAll, setOnboardingAll] = useState(false);
  const [onboardProgress, setOnboardProgress] = useState<{ done: number; total: number; results: { pubkey: string; name: string; success: boolean; message: string }[] } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<number | null>(null);
  const [apiEnv, setApiEnv] = useState<ApiEnvironment>(getApiEnvironment);
  const [envSwitchTarget, setEnvSwitchTarget] = useState<ApiEnvironment | null>(null);
  const queryClient = useQueryClient();

  const isNameSearch = useCallback((q: string) => {
    const t = q.trim();
    if (!t) return false;
    if (t.startsWith("npub")) return false;
    if (/^[0-9a-fA-F]{8,64}$/.test(t)) return false;
    return true;
  }, []);

  useEffect(() => {
    const trimmed = userSearch.trim();
    const timer = setTimeout(() => {
      setDebouncedSearch(isNameSearch(trimmed) ? "" : trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, isNameSearch]);

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
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab") || params.has("highlight")) {
      window.history.replaceState({}, "", window.location.pathname);
      if (params.get("highlight")) {
        setTimeout(() => setHighlightedPubkey(null), 2500);
      }
    }
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

  const adminStatsQuery = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => apiClient.getAdminStats(),
    enabled: !!user,
    staleTime: 120_000,
    retry: false,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_STATS_MS,
    refetchOnWindowFocus: "always",
  });
  const adminStats = adminStatsQuery.data ?? null;
  const hasSystemData = adminStats !== null;

  const activeNameSearch = isNameSearch(userSearch.trim());

  const adminUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users", debouncedSearch, userSort.key, userSort.dir, daysFilter, userPage, pageSize],
    queryFn: () => apiClient.getAdminUsers({
      search: debouncedSearch || undefined,
      sort: userSort.key,
      order: userSort.dir,
      days: daysFilter,
      page: userPage + 1,
      size: pageSize,
    }),
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: activeTab === "users" ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_USERS_MS) : false,
    refetchOnWindowFocus: "always",
  });

  const adminUsersData = adminUsersQuery.data;
  const adminUsersList = adminUsersData?.items ?? [];
  const adminUsersTotal = adminUsersData?.total ?? 0;
  const adminUsersTotalPages = adminUsersData?.pages ?? 1;

  const overviewUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users/overview", daysFilter],
    queryFn: () => apiClient.getAdminUsers({ days: daysFilter, page: 1, size: 100 }),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_OVERVIEW_MS,
    refetchOnWindowFocus: "always",
  });

  const overviewActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity/overview"],
    queryFn: () => apiClient.getAdminActivity({ page: 1, size: 100 }),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_OVERVIEW_MS,
    refetchOnWindowFocus: "always",
  });

  const adminActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity", activityPage, activityPageSize],
    queryFn: () => apiClient.getAdminActivity({
      page: activityPage + 1,
      size: activityPageSize,
    }),
    enabled: !!user && activeTab === "activity",
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: activeTab === "activity" ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_ACTIVITY_MS) : false,
    refetchOnWindowFocus: "always",
  });
  const activityData = adminActivityQuery.data;
  const activityItems = activityData?.items ?? [];
  const activityTotal = activityData?.total ?? 0;
  const activityTotalPages = activityData?.pages ?? 1;

  const [userProfiles, setUserProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());

  useEffect(() => {
    if (adminUsersList.length === 0) return;
    let cancelled = false;
    const allUsers = [...adminUsersList, ...(overviewUsersQuery.data?.items ?? [])];
    const seen = new Set<string>();
    const toFetch = allUsers.filter(u => {
      if (seen.has(u.pubkey) || userProfiles.has(u.pubkey)) return false;
      seen.add(u.pubkey);
      return true;
    });
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
  }, [adminUsersList, overviewUsersQuery.data]);

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

  const confirmEnvSwitch = useCallback(() => {
    if (!envSwitchTarget) return;
    setApiEnvironment(envSwitchTarget);
    setApiEnv(envSwitchTarget);
    setEnvSwitchTarget(null);
    queryClient.invalidateQueries();
    toast({
      title: `Switched to ${envSwitchTarget === "production" ? "Production" : "Staging"}`,
      description: `All data now loading from ${envSwitchTarget === "production" ? "brainstormserver.nosfabrica.com" : "brainstormserver-staging.nosfabrica.com"}`,
    });
  }, [envSwitchTarget, queryClient, toast]);

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

  const overviewAllUsers = overviewUsersQuery.data?.items ?? [];
  const overviewAllActivity = overviewActivityQuery.data?.items ?? [];
  const overviewTotalUsers = overviewUsersQuery.data?.total ?? 0;
  const overviewLoading = overviewUsersQuery.isLoading || overviewActivityQuery.isLoading;

  const filteredUsersList = useMemo(() => {
    const trimmed = userSearch.trim();
    const nameSearch = trimmed && isNameSearch(trimmed);
    let list = nameSearch ? overviewAllUsers : adminUsersList;
    if (nameSearch) {
      const query = trimmed.toLowerCase();
      list = list.filter(u => {
        const prof = userProfiles.get(u.pubkey);
        const name = prof?.name?.toLowerCase() ?? "";
        return name.includes(query);
      });
    }
    if (kpiFilter) {
      list = list.filter(u => {
        if (kpiFilter === "scored") return u.latest_status?.toLowerCase() === "success";
        if (kpiFilter === "sp_adopters") return u.latest_ta_status?.toLowerCase() === "success";
        if (kpiFilter === "queue") return u.latest_status?.toLowerCase() !== "success" && u.latest_status?.toLowerCase() !== "failed";
        return true;
      });
    }
    return list;
  }, [adminUsersList, overviewAllUsers, kpiFilter, userSearch, isNameSearch, userProfiles]);

  const pipelineMetrics = useMemo(() => {
    const users = overviewAllUsers;
    const activity = overviewAllActivity;
    const total = users.length;
    if (total === 0) return null;

    const successCount = users.filter(u => u.latest_status?.toLowerCase() === "success").length;
    const failedCount = users.filter(u => u.latest_status?.toLowerCase() === "failed").length;
    const pendingCount = total - successCount - failedCount;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

    const taSuccessCount = users.filter(u => u.latest_ta_status?.toLowerCase() === "success").length;
    const taFailedCount = users.filter(u => u.latest_ta_status?.toLowerCase() === "failed").length;
    const taAdoptionRate = total > 0 ? Math.round((taSuccessCount / total) * 100) : 0;

    const withTaPubkey = users.filter(u => u.ta_pubkey).length;

    const totalCalcs = users.reduce((sum, u) => sum + (u.times_calculated || 0), 0);
    const avgCalcs = total > 0 ? (totalCalcs / total).toFixed(1) : "0";

    const algoCounts: Record<string, number> = {};
    users.forEach(u => {
      const algo = u.latest_algorithm || "unknown";
      algoCounts[algo] = (algoCounts[algo] || 0) + 1;
    });

    const now = Date.now();
    const last24h = activity.filter(a => {
      try {
        const t = new Date(a.updated_at.endsWith("Z") ? a.updated_at : a.updated_at + "Z").getTime();
        return now - t < 86400000;
      } catch { return false; }
    });
    const recentSuccess = last24h.filter(a => a.status?.toLowerCase() === "success").length;
    const recentFailed = last24h.filter(a => a.status?.toLowerCase() === "failed").length;

    const sortedByUpdate = [...users].sort((a, b) => {
      const ta = new Date(a.last_updated || "").getTime() || 0;
      const tb = new Date(b.last_updated || "").getTime() || 0;
      return tb - ta;
    });
    const lastPlatformActivity = sortedByUpdate[0]?.last_updated ?? null;

    const neverCalc = users.filter(u => !u.times_calculated || u.times_calculated === 0).length;

    return {
      total: overviewTotalUsers,
      successCount, failedCount, pendingCount, successRate,
      taSuccessCount, taFailedCount, taAdoptionRate, withTaPubkey,
      totalCalcs, avgCalcs,
      algoCounts,
      recentSuccess, recentFailed,
      lastPlatformActivity,
      neverCalc,
    };
  }, [overviewAllUsers, overviewAllActivity, overviewTotalUsers]);

  const computedQueueDepth = useMemo(() => {
    if (overviewAllUsers.length === 0) return null;
    return overviewAllUsers.filter(u => {
      const s = u.latest_status?.toLowerCase();
      return s === "waiting" || s === "ongoing" || s === "queued" || s === "pending";
    }).length;
  }, [overviewAllUsers]);

  const handleTriggerGraperank = useCallback(async (pubkey: string) => {
    setTriggeringPubkeys(prev => new Set(prev).add(pubkey));
    try {
      await apiClient.triggerUserGraperank(pubkey);
      toast({ title: "GrapeRank triggered", description: `Triggered for ${pubkey.slice(0, 12)}...` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
      triggerRefreshBoost();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Trigger failed", description: message, variant: "destructive" });
    } finally {
      setTriggeringPubkeys(prev => { const next = new Set(prev); next.delete(pubkey); return next; });
    }
  }, [toast, queryClient, triggerRefreshBoost]);

  const totalPages = activeNameSearch ? Math.max(1, Math.ceil(filteredUsersList.length / pageSize)) : adminUsersTotalPages;

  const handleSort = useCallback((key: AdminSortKey) => {
    setUserSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
    setUserPage(0);
  }, []);

  const handlePageSizeChange = useCallback((val: string) => {
    setPageSize(parseInt(val, 10) as PageSizeOption);
    setUserPage(0);
  }, []);

  const extractSafeMessage = (result: unknown, fallback: string): string => {
    if (typeof result === "string") return result;
    if (typeof result === "object" && result !== null) {
      const r = result as Record<string, unknown>;
      if (typeof r.message === "string") return r.message;
      if (typeof r.detail === "string") return r.detail;
      if (typeof r.status === "string") return r.status;
    }
    return fallback;
  };

  const handleVerifyEncryption = useCallback(async () => {
    setVerifyConfirmOpen(false);
    setVerifyRunning(true);
    setVerifyResult(null);
    try {
      const result = await apiClient.verifyNsecEncryption();
      const msg = extractSafeMessage(result, "Verification complete");
      setVerifyResult({ success: true, message: msg });
      toast({ title: "Encryption Verified", description: msg });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setVerifyResult({ success: false, message: msg });
      toast({ title: "Verification Failed", description: msg, variant: "destructive" });
    } finally {
      setVerifyRunning(false);
    }
  }, [toast]);

  const handleRotateEncryption = useCallback(async () => {
    setRotateConfirmOpen(false);
    setRotateRunning(true);
    setRotateResult(null);
    try {
      const result = await apiClient.rotateNsecEncryption();
      const msg = extractSafeMessage(result, "Key rotation complete");
      setRotateResult({ success: true, message: msg });
      setVerifyResult(null);
      toast({ title: "Key Rotated", description: msg });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setRotateResult({ success: false, message: msg });
      toast({ title: "Rotation Failed", description: msg, variant: "destructive" });
    } finally {
      setRotateRunning(false);
    }
  }, [toast]);

  const jumpToUser = useCallback((pubkey: string, displayName?: string) => {
    setUserSearch(pubkey);
    setDebouncedSearch(pubkey);
    setUserPage(0);
    setKpiFilter(null);
    setLookupOpen(false);
    setHighlightedPubkey(pubkey);
    setExpandedRows(new Set([pubkey]));
    setTimeout(() => setHighlightedPubkey(null), 2500);
    const name = displayName || userProfiles.get(pubkey)?.name;
    toast({ title: "Jumped to user", description: name ? `Showing ${name}` : `Showing ${pubkey.slice(0, 16)}...` });
  }, [toast, userProfiles]);

  const handleLookupPubkey = useCallback(async () => {
    const raw = lookupInput.trim();
    if (!raw) {
      setLookupError("Please enter a name, pubkey, or npub");
      return;
    }
    setLookupNameResults([]);
    setLookupResult(null);
    setLookupError(null);

    let hexPubkey: string | null = null;
    if (raw.startsWith("npub")) {
      try {
        const decoded = nip19.decode(raw);
        if (decoded.type === "npub") hexPubkey = decoded.data;
      } catch {}
    } else if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      hexPubkey = raw.toLowerCase();
    }

    if (!hexPubkey) {
      const query = raw.toLowerCase();
      const matches: { pubkey: string; name?: string; picture?: string }[] = [];
      for (const u of adminUsersList) {
        const prof = userProfiles.get(u.pubkey);
        const name = prof?.name?.toLowerCase() ?? "";
        const pk = u.pubkey.toLowerCase();
        if (name.includes(query) || pk.includes(query)) {
          matches.push({ pubkey: u.pubkey, name: prof?.name, picture: prof?.picture });
        }
      }
      if (matches.length === 1) {
        jumpToUser(matches[0].pubkey, matches[0].name);
      } else if (matches.length > 1) {
        setLookupNameResults(matches);
      } else {
        setLookupError(`No users found matching "${raw}" in your database`);
      }
      return;
    }

    setLookupRunning(true);
    try {
      const result = await apiClient.getBrainstormPubkey(hexPubkey);
      const data = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
      const isNew = data.created === true || data.is_new === true;
      const canonicalPubkey = typeof data.pubkey === "string" ? data.pubkey
        : typeof data.brainstorm_pubkey === "string" ? data.brainstorm_pubkey
        : hexPubkey;
      if (isNew) {
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        toast({ title: "User Onboarded", description: "New user created — jumping to their row" });
      }
      jumpToUser(canonicalPubkey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLookupError(msg);
      toast({ title: "Lookup Failed", description: msg, variant: "destructive" });
    } finally {
      setLookupRunning(false);
    }
  }, [lookupInput, adminUsersList, userProfiles, jumpToUser, toast, queryClient]);

  const handleOnboardSearch = useCallback(async () => {
    const q = onboardSearch.trim();
    if (!q || q.length < 2) {
      setOnboardError("Enter at least 2 characters to search");
      return;
    }
    setOnboardSearching(true);
    setOnboardError(null);
    setOnboardResults([]);
    try {
      const results = await searchNostrProfiles(q, { limit: 10, timeoutMs: 5000 });
      if (results.length === 0) {
        setOnboardError("No profiles found — try a different name");
      } else {
        setOnboardResults(results);
      }
    } catch {
      setOnboardError("Search failed — relay may be unavailable");
    } finally {
      setOnboardSearching(false);
    }
  }, [onboardSearch]);

  const addToOnboardQueue = useCallback((profile: NostrSearchResult) => {
    setOnboardQueue(prev => {
      if (prev.some(p => p.pubkey === profile.pubkey)) return prev;
      return [...prev, profile];
    });
  }, []);

  const removeFromOnboardQueue = useCallback((pubkey: string) => {
    setOnboardQueue(prev => prev.filter(p => p.pubkey !== pubkey));
  }, []);

  const handleBulkPasteAdd = useCallback(() => {
    const lines = bulkPasteInput.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
    const added: NostrSearchResult[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      let hex = line;
      if (line.startsWith("npub")) {
        try {
          const decoded = nip19.decode(line);
          if (decoded.type === "npub") hex = decoded.data;
          else { errors.push(line.slice(0, 20) + "..."); continue; }
        } catch { errors.push(line.slice(0, 20) + "..."); continue; }
      } else if (!/^[0-9a-fA-F]{64}$/.test(line)) {
        errors.push(line.slice(0, 20) + "..."); continue;
      }
      hex = hex.toLowerCase();
      if (!added.some(p => p.pubkey === hex) && !onboardQueue.some(p => p.pubkey === hex)) {
        added.push({ pubkey: hex, npub: nip19.npubEncode(hex) });
      }
    }
    if (added.length > 0) {
      setOnboardQueue(prev => [...prev, ...added]);
      setBulkPasteInput("");
      toast({ title: `${added.length} added to queue`, description: errors.length > 0 ? `${errors.length} invalid entries skipped` : undefined });
    } else if (errors.length > 0) {
      setOnboardError(`Could not parse: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`);
    }
  }, [bulkPasteInput, onboardQueue, toast]);

  const handleOnboardAll = useCallback(async () => {
    if (onboardQueue.length === 0) return;
    setOnboardingAll(true);
    setLookupResult(null);
    setLookupError(null);
    const total = onboardQueue.length;
    const results: { pubkey: string; name: string; success: boolean; message: string }[] = [];
    setOnboardProgress({ done: 0, total, results });

    for (let i = 0; i < onboardQueue.length; i++) {
      const profile = onboardQueue[i];
      const displayName = profile.displayName || profile.name || profile.pubkey.slice(0, 12) + "...";
      try {
        const result = await apiClient.getBrainstormPubkey(profile.pubkey);
        const data = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
        const isNew = data.created === true || data.is_new === true;
        results.push({ pubkey: profile.pubkey, name: displayName, success: true, message: isNew ? "Onboarded" : "Already exists" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed";
        results.push({ pubkey: profile.pubkey, name: displayName, success: false, message: msg });
      }
      setOnboardProgress({ done: i + 1, total, results: [...results] });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    toast({
      title: `Onboarding complete`,
      description: `${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ""}`,
    });
    setOnboardQueue([]);
    setOnboardingAll(false);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  }, [onboardQueue, toast, queryClient]);

  const handleViewRequestDetail = useCallback((item: BrainstormRequestInstance) => {
    setDetailRequestId(item.private_id);
    setDetailOpen(true);
    setDetailLoading(false);
    setDetailError(null);
    const sensitiveKeys = new Set(["password"]);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (!sensitiveKeys.has(key)) {
        data[key] = value;
      }
    }
    setDetailData(data);
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
    { key: "activity", label: "Activity", icon: Activity },
    { key: "users", label: "Users", icon: Users },
    { key: "health", label: "System Health", icon: Server },
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
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/network")} data-testid="button-nav-network">
                  <Users className="h-4 w-4" />
                  Network
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06] transition-all duration-200" onClick={() => navigate("/agentsuite")} data-testid="button-nav-agentsuite">
                  <AgentIcon className="h-4 w-4" />
                  <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">Agent Suite</span>
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
        calcDone={true}
        user={user}
        onLogout={handleLogout}
        isAdmin={true}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <div className="space-y-6 animate-fade-up">

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-admin-header">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-amber-500/20 shadow-sm backdrop-blur-sm w-fit">
                  <div className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]" />
                  <p className="text-[9px] font-bold tracking-[0.15em] text-amber-700 uppercase">NosFabrica Admin</p>
                </div>
                <button
                  onClick={() => setEnvSwitchTarget(apiEnv === "staging" ? "production" : "staging")}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border shadow-sm backdrop-blur-sm cursor-pointer transition-all hover:shadow-md ${
                    apiEnv === "production"
                      ? "bg-emerald-50/80 border-emerald-300/40 hover:border-emerald-400/60"
                      : "bg-amber-50/80 border-amber-300/40 hover:border-amber-400/60"
                  }`}
                  data-testid="button-env-selector"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    apiEnv === "production"
                      ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]"
                      : "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.6)]"
                  }`} />
                  <span className={`text-[9px] font-bold tracking-[0.1em] uppercase ${
                    apiEnv === "production" ? "text-emerald-700" : "text-amber-700"
                  }`}>
                    {apiEnv === "production" ? "Production" : "Staging"}
                  </span>
                  <ChevronsUpDown className={`h-2.5 w-2.5 ${apiEnv === "production" ? "text-emerald-400" : "text-amber-400"}`} />
                </button>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                  Admin Dashboard
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-600 font-medium">
                System overview and management for NosFabrica operators.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-2.5" data-testid="section-kpi-strip">
            <KpiCard
              label="Scored Users"
              value={pipelineMetrics ? `${formatNumber(pipelineMetrics.successCount)} / ${formatNumber(pipelineMetrics.total)}` : (hasSystemData ? formatNumber(adminStats!.scoredUsers) : "0")}
              icon={UserCheck}
              subtitle={pipelineMetrics ? `${pipelineMetrics.successRate}% of all users scored` : "Completed GrapeRank"}
              tooltip="Click to view scored users"
              scope={pipelineMetrics || hasSystemData ? "system" : "graph"}
              onClick={() => { setKpiFilter("scored"); setActiveTab("users"); setUserPage(0); }}
            />
            <KpiCard
              label="SP Adopters"
              value={pipelineMetrics ? `${formatNumber(pipelineMetrics.taSuccessCount)} / ${formatNumber(pipelineMetrics.total)}` : (hasSystemData ? formatNumber(adminStats!.spAdopters) : "0")}
              icon={Shield}
              subtitle={pipelineMetrics ? `${pipelineMetrics.taAdoptionRate}% TA adoption` : "Published NIP-85 TA"}
              tooltip="Click to view SP adopters"
              scope={pipelineMetrics || hasSystemData ? "system" : "graph"}
              onClick={() => { setKpiFilter("sp_adopters"); setActiveTab("users"); setUserPage(0); }}
            />
            <KpiCard
              label="Queue Depth"
              value={computedQueueDepth !== null ? formatNumber(computedQueueDepth) : (hasSystemData ? formatNumber(adminStats!.queueDepth) : (queuePosition !== null ? queuePosition.toString() : "—"))}
              icon={Clock}
              subtitle={computedQueueDepth !== null ? "Users awaiting calculation" : (hasSystemData ? "Users awaiting calculation" : (queuePosition !== null ? "Position in queue" : "Via graperankResult"))}
              tooltip="Click to view queued users"
              scope={computedQueueDepth !== null || hasSystemData ? "system" : "graph"}
              onClick={() => { setKpiFilter("queue"); setActiveTab("users"); setUserPage(0); }}
            />
          </div>

          <div className="hidden sm:block overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <div className="flex gap-1 p-1 rounded-2xl bg-white/60 border border-[#7c86ff]/10 backdrop-blur-sm w-fit" data-testid="admin-tab-bar">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setUserPage(0); if (tab.key === "users") setKpiFilter(null); }}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                      active
                        ? "bg-gradient-to-r from-[#333286] to-[#7c86ff] text-white shadow-md"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/80"
                    }`}
                    data-testid={`tab-${tab.key}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:hidden" data-testid="admin-tab-bar-mobile">
            {(() => {
              const [mobileTabOpen, setMobileTabOpen] = [mobileTabDropdownOpen, setMobileTabDropdownOpen];
              const activeTabData = tabs.find(t => t.key === activeTab);
              const ActiveIcon = activeTabData?.icon ?? BarChart3;
              return (
                <div className="relative">
                  <button
                    onClick={() => setMobileTabOpen(!mobileTabOpen)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white/60 border border-[#7c86ff]/10 backdrop-blur-sm shadow-sm text-sm font-semibold text-slate-800"
                    data-testid="button-tab-mobile-trigger"
                  >
                    <span className="flex items-center gap-2">
                      <ActiveIcon className="h-4 w-4 text-[#333286]" />
                      {activeTabData?.label}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${mobileTabOpen ? "rotate-180" : ""}`} />
                  </button>
                  {mobileTabOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMobileTabOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 z-40 rounded-xl bg-white border border-[#7c86ff]/15 shadow-lg overflow-hidden" data-testid="dropdown-tab-mobile">
                        {tabs.map(tab => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.key;
                          return (
                            <button
                              key={tab.key}
                              onClick={() => { setActiveTab(tab.key); setUserPage(0); if (tab.key === "users") setKpiFilter(null); setMobileTabOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors ${
                                isActive
                                  ? "bg-gradient-to-r from-[#333286]/10 to-[#7c86ff]/10 text-[#333286]"
                                  : "text-slate-600 hover:bg-slate-50"
                              }`}
                              data-testid={`tab-mobile-${tab.key}`}
                            >
                              <Icon className={`h-4 w-4 ${isActive ? "text-[#333286]" : "text-slate-400"}`} />
                              {tab.label}
                              {isActive && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-[#333286]" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="panel-overview">
              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-pipeline-health">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Pipeline Health</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Platform-wide GrapeRank calculation health from /admin/users</p>
                    </div>
                    <LiveBadge updatedAt={overviewUsersQuery.dataUpdatedAt} boosting={isBoostActive} isFetching={overviewUsersQuery.isFetching || overviewActivityQuery.isFetching} />
                  </div>
                </div>
                {overviewLoading && !pipelineMetrics ? (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                ) : pipelineMetrics ? (
                  <div className="p-5 space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Success Rate</span>
                        <span className={`text-lg font-bold tabular-nums ${pipelineMetrics.successRate >= 80 ? "text-emerald-600" : pipelineMetrics.successRate >= 50 ? "text-amber-600" : "text-red-600"}`}>{pipelineMetrics.successRate}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.successCount / pipelineMetrics.total) * 100 : 0}%` }} />
                        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.failedCount / pipelineMetrics.total) * 100 : 0}%` }} />
                        <div className="h-full bg-slate-300 transition-all duration-500" style={{ width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.pendingCount / pipelineMetrics.total) * 100 : 0}%` }} />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />{pipelineMetrics.successCount} success</span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />{pipelineMetrics.failedCount} failed</span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-300 inline-block" />{pipelineMetrics.pendingCount} pending</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-xl bg-white/60 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Users</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{formatNumber(pipelineMetrics.total)}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/60 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Calculations</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{formatNumber(pipelineMetrics.totalCalcs)}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/60 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Calcs / User</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{pipelineMetrics.avgCalcs}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/60 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Never Calculated</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{formatNumber(pipelineMetrics.neverCalc)}</p>
                      </div>
                    </div>

                    {pipelineMetrics.lastPlatformActivity && (
                      <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Last platform activity</span>
                        <span className="text-xs text-slate-600">{new Date(pipelineMetrics.lastPlatformActivity.endsWith("Z") ? pipelineMetrics.lastPlatformActivity : pipelineMetrics.lastPlatformActivity + "Z").toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : overviewUsersQuery.isError ? (
                  <div className="p-8 text-center text-xs text-red-400">Failed to load pipeline data</div>
                ) : (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-ta-adoption">
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Trust Attestation & Throughput</h3>
                  <p className="text-xs text-slate-500 mt-0.5">TA adoption and recent calculation activity</p>
                </div>
                {overviewLoading && !pipelineMetrics ? (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                ) : pipelineMetrics ? (
                  <div className="p-5 space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TA Success Rate</span>
                        <span className={`text-lg font-bold tabular-nums ${pipelineMetrics.taAdoptionRate >= 80 ? "text-emerald-600" : pipelineMetrics.taAdoptionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>{pipelineMetrics.taAdoptionRate}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.taSuccessCount / pipelineMetrics.total) * 100 : 0}%` }} />
                        <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.taFailedCount / pipelineMetrics.total) * 100 : 0}%` }} />
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500 inline-block" />{pipelineMetrics.taSuccessCount} published</span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />{pipelineMetrics.taFailedCount} failed</span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-200 inline-block" />{pipelineMetrics.withTaPubkey} with TA key</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Last 24h Throughput</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                          <p className="text-[10px] font-semibold text-emerald-600">Successful</p>
                          <p className="text-lg font-bold text-emerald-700 tabular-nums mt-0.5">{pipelineMetrics.recentSuccess}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-100">
                          <p className="text-[10px] font-semibold text-red-600">Failed</p>
                          <p className="text-lg font-bold text-red-700 tabular-nums mt-0.5">{pipelineMetrics.recentFailed}</p>
                        </div>
                      </div>
                    </div>

                    {Object.keys(pipelineMetrics.algoCounts).length > 0 && (
                      <div className="border-t border-slate-100 pt-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Algorithm Distribution</p>
                        <div className="space-y-1.5">
                          {Object.entries(pipelineMetrics.algoCounts).sort((a, b) => b[1] - a[1]).map(([algo, count]) => (
                            <div key={algo} className="flex items-center justify-between">
                              <span className="text-xs font-mono text-slate-600 truncate max-w-[180px]">{algo}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(count / pipelineMetrics.total) * 100}%` }} />
                                </div>
                                <span className="text-[10px] font-semibold text-slate-500 tabular-nums w-8 text-right">{count}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  </div>
                )}
              </div>

              {(() => {
                const failedItems = overviewAllActivity.filter(isItemFailed);
                const groups = new Map<string, { count: number; latest: BrainstormRequestInstance; pubkeys: Set<string> }>();
                for (const item of failedItems) {
                  const key = normalizeErrorKey(extractErrorMessage(item)) + "|" + (getFailureStage(item) ?? "");
                  const existing = groups.get(key);
                  if (existing) {
                    existing.count += 1;
                    if (item.pubkey) existing.pubkeys.add(item.pubkey);
                    const latestT = new Date(existing.latest.updated_at.endsWith("Z") ? existing.latest.updated_at : existing.latest.updated_at + "Z").getTime();
                    const itemT = new Date(item.updated_at.endsWith("Z") ? item.updated_at : item.updated_at + "Z").getTime();
                    if (itemT > latestT) existing.latest = item;
                  } else {
                    groups.set(key, { count: 1, latest: item, pubkeys: new Set(item.pubkey ? [item.pubkey] : []) });
                  }
                }
                const sortedGroups = Array.from(groups.values()).sort((a, b) => {
                  if (b.count !== a.count) return b.count - a.count;
                  const at = new Date(a.latest.updated_at.endsWith("Z") ? a.latest.updated_at : a.latest.updated_at + "Z").getTime();
                  const bt = new Date(b.latest.updated_at.endsWith("Z") ? b.latest.updated_at : b.latest.updated_at + "Z").getTime();
                  return bt - at;
                }).slice(0, 8);
                const totalFailures = failedItems.length;
                const dataUnavailable = overviewActivityQuery.isError || (!overviewActivityQuery.isSuccess && !overviewActivityQuery.isLoading);
                return (
                  <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-red-50/30 backdrop-blur-xl border border-red-200/50 shadow-[0_0_15px_rgba(239,68,68,0.07)] overflow-hidden" data-testid="card-recent-failures">
                    <div className="h-1 w-full bg-gradient-to-r from-red-400 via-rose-500 to-red-400" />
                    <div className="px-5 py-4 border-b border-red-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Recent Failures
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {totalFailures === 0
                              ? "No failures detected in recent activity."
                              : `${totalFailures} failed request${totalFailures === 1 ? "" : "s"} grouped into ${sortedGroups.length} pattern${sortedGroups.length === 1 ? "" : "s"}.`}
                          </p>
                        </div>
                        <span className={`text-xs font-bold tabular-nums px-2 py-1 rounded-full ${totalFailures === 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`} data-testid="badge-failure-count">
                          {totalFailures}
                        </span>
                      </div>
                    </div>
                    <div className="p-5">
                      {overviewActivityQuery.isError ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="failures-error-state">
                          <XCircle className="h-8 w-8 text-red-400 mb-2" />
                          <p className="text-sm font-semibold text-slate-700">Couldn't load failure data</p>
                          <p className="text-[10px] text-slate-500 mt-1 max-w-md">
                            {overviewActivityQuery.error instanceof Error ? overviewActivityQuery.error.message : "The /admin/activity endpoint did not respond. Failure status is unknown."}
                          </p>
                        </div>
                      ) : overviewLoading && totalFailures === 0 ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                        </div>
                      ) : dataUnavailable ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="failures-unknown-state">
                          <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
                          <p className="text-sm font-semibold text-slate-700">Failure status unavailable</p>
                          <p className="text-[10px] text-slate-400 mt-1">Activity data has not loaded yet.</p>
                        </div>
                      ) : totalFailures === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="failures-empty-state">
                          <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
                          <p className="text-sm font-semibold text-slate-700">All recent requests succeeded</p>
                          <p className="text-[10px] text-slate-400 mt-1">No errors found in the latest activity feed.</p>
                        </div>
                      ) : (
                        <ul className="space-y-2.5" data-testid="list-recent-failures">
                          {sortedGroups.map((g, idx) => {
                            const stage = getFailureStage(g.latest) ?? "Pipeline";
                            const errMsg = extractErrorMessage(g.latest);
                            const userCount = g.pubkeys.size;
                            return (
                              <li key={idx} className="rounded-lg border border-red-200 bg-white/70 p-3" data-testid={`failure-group-${idx}`}>
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">{stage}</span>
                                      {g.count > 1 && (
                                        <span className="text-[9px] font-semibold text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded-full tabular-nums">
                                          {g.count}× occurrences
                                        </span>
                                      )}
                                      {userCount > 0 && (
                                        <span className="text-[9px] text-slate-500">
                                          {userCount} user{userCount === 1 ? "" : "s"} affected
                                        </span>
                                      )}
                                      <span className="text-[9px] text-slate-400 ml-auto">{timeAgo(g.latest.updated_at) || formatTimestamp(g.latest.updated_at)}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-800 font-mono break-words leading-relaxed">{truncateError(errMsg, 220)}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      {g.latest.pubkey && (
                                        <button
                                          onClick={() => {
                                            const pk = g.latest.pubkey!;
                                            setUserSearch(pk);
                                            setDebouncedSearch(pk);
                                            setActiveTab("users");
                                            setKpiFilter(null);
                                            setUserPage(0);
                                            setExpandedRows(new Set([pk]));
                                            setHighlightedPubkey(pk);
                                            setTimeout(() => setHighlightedPubkey(null), 2500);
                                          }}
                                          className="text-[10px] font-semibold text-[#333286] hover:text-[#7c86ff] inline-flex items-center gap-1"
                                          data-testid={`failure-group-view-user-${idx}`}
                                        >
                                          <Eye className="h-3 w-3" /> View latest affected user
                                        </button>
                                      )}
                                      {g.latest.pubkey && (
                                        <ConfirmRetriggerButton
                                          pubkey={g.latest.pubkey}
                                          testId={`failure-group-retrigger-${idx}`}
                                          onConfirm={async (pk) => {
                                            try {
                                              await apiClient.triggerUserGraperank(pk);
                                              toast({ title: "Request Queued", description: `Re-triggered GrapeRank for ${pk.slice(0, 12)}...` });
                                              queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                                              queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                              triggerRefreshBoost();
                                            } catch (err: unknown) {
                                              const msg = err instanceof Error ? err.message : "Unknown error";
                                              toast({ title: "Re-trigger Failed", description: msg, variant: "destructive" });
                                              throw err;
                                            }
                                          }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-quick-stats">
                <div className="h-1 w-full bg-gradient-to-r from-violet-400 via-fuchsia-500 to-violet-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>System Endpoints</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    API connectivity — <span className={`font-mono font-semibold ${apiEnv === "production" ? "text-emerald-600" : "text-amber-600"}`}>{apiEnv === "production" ? "production" : "staging"}</span>
                  </p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(() => {
                      const baseUrl = getApiBaseUrl().replace(/^https?:\/\//, "");
                      return [
                        { endpoint: "/user/self", label: "User Self", status: selfQuery.isSuccess ? "connected" as const : selfQuery.isError ? "disconnected" as const : "degraded" as const },
                        { endpoint: "/user/graperankResult", label: "GrapeRank Result", status: grapeRankQuery.isSuccess ? "connected" as const : grapeRankQuery.isError ? "disconnected" as const : "degraded" as const },
                        { endpoint: "/admin/users", label: "Admin Users", status: adminUsersQuery.isSuccess ? "connected" as const : adminUsersQuery.isError ? "disconnected" as const : "degraded" as const },
                        { endpoint: "/admin/activity", label: "Admin Activity", status: adminActivityQuery.isSuccess ? "connected" as const : adminActivityQuery.isError ? "disconnected" as const : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError ? "connected" as const : "degraded" as const },
                      ].map(ep => (
                        <div key={ep.endpoint} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/50 border border-slate-100 min-w-0" data-testid={`endpoint-${ep.label.toLowerCase().replace(/\s+/g, "-")}`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800">{ep.label}</p>
                            <p className="text-[10px] font-mono text-slate-400 truncate" title={`${baseUrl}${ep.endpoint}`}>{baseUrl}{ep.endpoint}</p>
                          </div>
                          <StatusBadge status={ep.status} />
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <>
            <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="panel-users">
              <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
              <div className="px-3 sm:px-5 py-4 border-b border-[#7c86ff]/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>User Database</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500">{(activeNameSearch ? filteredUsersList.length : adminUsersTotal).toLocaleString()} users{activeNameSearch && userSearch.trim() ? " (filtered)" : ""}</span>
                    <span className="text-[10px] text-slate-400">|</span>
                    <span className="text-[10px] text-slate-400">Page {(userPage + 1)} of {totalPages}</span>
                    <span className="text-[10px] text-slate-400">|</span>
                    <span className="text-[10px] text-emerald-600 font-medium">Source: /admin/users</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-56">
                    <input
                      type="text"
                      placeholder="Search name, pubkey, npub..."
                      value={userSearch}
                      onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                      className="w-full px-3 py-1.5 pr-7 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                      data-testid="input-user-search"
                    />
                    {userSearch && (
                      <button
                        onClick={() => { setUserSearch(""); setDebouncedSearch(""); setUserPage(0); setHighlightedPubkey(null); setExpandedRows(new Set()); }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        data-testid="button-clear-search"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Select value={daysFilter.toString()} onValueChange={(val) => { setDaysFilter(parseInt(val, 10)); setUserPage(0); }}>
                    <SelectTrigger className="w-28 h-8 text-xs rounded-xl border-slate-200" data-testid="select-days-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Last 24 Hours</SelectItem>
                      <SelectItem value="7">This Week</SelectItem>
                      <SelectItem value="30">This Month</SelectItem>
                      <SelectItem value="90">This Quarter</SelectItem>
                      <SelectItem value="365">This Year</SelectItem>
                      <SelectItem value="9999">All Time</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setLookupOpen(true); setLookupMode("lookup"); setLookupInput(""); setLookupResult(null); setLookupError(null); setLookupNameResults([]); setOnboardSearch(""); setOnboardResults([]); setOnboardError(null); setOnboardQueue([]); setBulkPasteOpen(false); setBulkPasteInput(""); setOnboardProgress(null); }}
                    className="text-xs gap-1.5 h-8 no-default-hover-elevate no-default-active-elevate"
                    data-testid="button-lookup-pubkey"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Lookup / Onboard
                  </Button>
                </div>

                <Dialog open={lookupOpen} onOpenChange={(open) => { if (onboardingAll) return; setLookupOpen(open); if (!open) { setLookupResult(null); setLookupError(null); setOnboardResults([]); setOnboardError(null); setOnboardProgress(null); } }}>
                  <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md overflow-hidden">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        {lookupMode === "lookup" ? <Search className="h-5 w-5 text-[#333286]" /> : <UserPlus className="h-5 w-5 text-[#333286]" />}
                        {lookupMode === "lookup" ? "Lookup User" : "Onboard User"}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-600 pt-1">
                        {lookupMode === "lookup"
                          ? "Find a user by name, pubkey, or npub and jump to their row in the table."
                          : "Search Nostr by name to find and onboard a user into Brainstorm."}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" data-testid="toggle-lookup-mode">
                      <button
                        onClick={() => { setLookupMode("lookup"); setLookupResult(null); setLookupError(null); setLookupNameResults([]); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${lookupMode === "lookup" ? "bg-white text-[#333286] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                        data-testid="button-mode-lookup"
                      >
                        <Search className="h-3 w-3" />
                        Lookup
                      </button>
                      <button
                        onClick={() => { setLookupMode("onboard"); setLookupResult(null); setLookupError(null); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${lookupMode === "onboard" ? "bg-white text-[#333286] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                        data-testid="button-mode-onboard"
                      >
                        <UserPlus className="h-3 w-3" />
                        Onboard
                      </button>
                    </div>

                    {lookupMode === "lookup" ? (
                      <div className="space-y-3 pt-1 overflow-hidden">
                        <div className="flex gap-2 min-w-0">
                          <input
                            type="text"
                            placeholder="Name, npub, or hex pubkey"
                            value={lookupInput}
                            onChange={e => { setLookupInput(e.target.value); setLookupError(null); setLookupNameResults([]); }}
                            onKeyDown={e => { if (e.key === "Enter" && !lookupRunning) handleLookupPubkey(); }}
                            className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                            data-testid="input-lookup-pubkey"
                          />
                          <Button
                            size="sm"
                            onClick={handleLookupPubkey}
                            disabled={lookupRunning || !lookupInput.trim()}
                            className="text-xs gap-1.5 shrink-0 no-default-hover-elevate no-default-active-elevate"
                            data-testid="button-submit-lookup"
                          >
                            {lookupRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            {lookupRunning ? "..." : "Lookup"}
                          </Button>
                        </div>

                        {lookupNameResults.length > 0 && (
                          <div className="space-y-1" data-testid="lookup-name-results">
                            <p className="text-[10px] text-slate-500 font-medium">{lookupNameResults.length} user{lookupNameResults.length !== 1 ? "s" : ""} found</p>
                            <div className="max-h-[200px] overflow-y-auto space-y-1 -mx-1 px-1">
                              {lookupNameResults.map(u => {
                                const npub = nip19.npubEncode(u.pubkey);
                                return (
                                  <div
                                    key={u.pubkey}
                                    className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 bg-white/80 hover:border-[#7c86ff]/30 hover:bg-indigo-50/10 transition-all cursor-pointer"
                                    onClick={() => jumpToUser(u.pubkey, u.name)}
                                    data-testid={`lookup-name-result-${u.pubkey.slice(0, 8)}`}
                                  >
                                    {u.picture ? (
                                      <img src={u.picture} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 border border-slate-200" />
                                    ) : (
                                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#7c86ff]/20 to-[#333286]/20 flex items-center justify-center shrink-0">
                                        <User className="h-3.5 w-3.5 text-[#333286]/60" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-slate-800 truncate">{u.name || "Unknown"}</p>
                                      <p className="text-[10px] text-slate-400 font-mono truncate">{npub.slice(0, 20)}...{npub.slice(-6)}</p>
                                    </div>
                                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1 overflow-hidden">
                        <div className="flex gap-2 min-w-0">
                          <input
                            type="text"
                            placeholder="Search by name..."
                            value={onboardSearch}
                            onChange={e => { setOnboardSearch(e.target.value); setOnboardError(null); }}
                            onKeyDown={e => { if (e.key === "Enter" && !onboardSearching) handleOnboardSearch(); }}
                            className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                            data-testid="input-onboard-search"
                            disabled={onboardingAll}
                          />
                          <Button
                            size="sm"
                            onClick={handleOnboardSearch}
                            disabled={onboardSearching || !onboardSearch.trim() || onboardingAll}
                            className="text-xs gap-1.5 shrink-0 no-default-hover-elevate no-default-active-elevate"
                            data-testid="button-submit-onboard-search"
                          >
                            {onboardSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            {onboardSearching ? "..." : "Search"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-slate-400 -mt-1 flex items-center gap-1">
                          <Globe className="h-2.5 w-2.5 shrink-0" />
                          Powered by NIP-50 WoT search relay
                        </p>

                        {onboardResults.length > 0 && !onboardingAll && (
                          <div className="space-y-1 max-h-[180px] overflow-y-auto overflow-x-hidden -mx-1 px-1" data-testid="onboard-results">
                            {onboardResults.map(profile => {
                              const displayName = profile.displayName || profile.name || profile.npub.slice(0, 16) + "...";
                              const isQueued = onboardQueue.some(p => p.pubkey === profile.pubkey);
                              return (
                                <div
                                  key={profile.pubkey}
                                  className={`flex items-center gap-2 p-2 rounded-lg border transition-all overflow-hidden cursor-pointer ${isQueued ? "border-[#7c86ff]/40 bg-indigo-50/40" : "border-slate-200 bg-white/80 hover:border-[#7c86ff]/20 hover:bg-indigo-50/10"}`}
                                  onClick={() => isQueued ? removeFromOnboardQueue(profile.pubkey) : addToOnboardQueue(profile)}
                                  data-testid={`onboard-result-${profile.pubkey.slice(0, 8)}`}
                                >
                                  <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isQueued ? "bg-[#333286] border-[#333286]" : "border-slate-300"}`}>
                                    {isQueued && <CheckCircle2 className="h-3 w-3 text-white" />}
                                  </div>
                                  {profile.picture ? (
                                    <img src={profile.picture} alt="" className="h-7 w-7 rounded-full object-cover border border-slate-200 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                  ) : (
                                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#7c86ff]/20 to-[#333286]/20 flex items-center justify-center shrink-0">
                                      <Users className="h-3 w-3 text-[#333286]/50" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <p className="text-[11px] font-semibold text-slate-900 truncate">{displayName}</p>
                                    <p className="text-[9px] font-mono text-slate-400 truncate">{profile.npub.slice(0, 16)}...{profile.npub.slice(-4)}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {!onboardingAll && (
                          <div className="border-t border-slate-200 pt-2">
                            <button
                              onClick={() => setBulkPasteOpen(prev => !prev)}
                              className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 hover:text-[#333286] transition-colors w-full"
                              data-testid="button-toggle-bulk-paste"
                            >
                              <FileText className="h-3 w-3" />
                              Import by npub list
                              <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${bulkPasteOpen ? "rotate-180" : ""}`} />
                            </button>
                            {bulkPasteOpen && (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  placeholder={"Paste npubs or hex pubkeys\nOne per line or comma-separated"}
                                  value={bulkPasteInput}
                                  onChange={e => setBulkPasteInput(e.target.value)}
                                  className="w-full px-3 py-2 text-[10px] font-mono rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40 resize-none h-16"
                                  data-testid="textarea-bulk-paste"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleBulkPasteAdd}
                                  disabled={!bulkPasteInput.trim()}
                                  className="text-[10px] gap-1 h-7 w-full no-default-hover-elevate no-default-active-elevate"
                                  data-testid="button-bulk-paste-add"
                                >
                                  <UserPlus className="h-3 w-3" />
                                  Add to queue
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {onboardError && (
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200" data-testid="onboard-error">
                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-red-700">{onboardError}</p>
                          </div>
                        )}

                        {onboardQueue.length > 0 && (
                          <div className="border-t border-slate-200 pt-3 space-y-2" data-testid="onboard-queue">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Onboard Queue ({onboardQueue.length})
                              </span>
                              {!onboardingAll && (
                                <button
                                  onClick={() => setOnboardQueue([])}
                                  className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                                  data-testid="button-clear-queue"
                                >
                                  Clear all
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto overflow-x-hidden">
                              {onboardQueue.map(profile => {
                                const displayName = profile.displayName || profile.name || profile.npub.slice(0, 10) + "...";
                                const progressItem = onboardProgress?.results.find(r => r.pubkey === profile.pubkey);
                                return (
                                  <div
                                    key={profile.pubkey}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] border transition-all ${
                                      progressItem
                                        ? progressItem.success
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                          : "bg-red-50 border-red-200 text-red-700"
                                        : "bg-indigo-50 border-[#7c86ff]/20 text-slate-700"
                                    }`}
                                    data-testid={`queue-item-${profile.pubkey.slice(0, 8)}`}
                                  >
                                    {profile.picture ? (
                                      <img src={profile.picture} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    ) : null}
                                    <span className="font-medium truncate max-w-[80px]">{displayName}</span>
                                    {progressItem ? (
                                      progressItem.success ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                                    ) : !onboardingAll ? (
                                      <button onClick={(e) => { e.stopPropagation(); removeFromOnboardQueue(profile.pubkey); }} className="hover:text-red-500 transition-colors shrink-0" data-testid={`button-remove-${profile.pubkey.slice(0, 8)}`}>
                                        <XCircle className="h-3 w-3" />
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>

                            {onboardingAll && onboardProgress && (
                              <div className="space-y-1.5">
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-[#7c86ff] to-[#333286] rounded-full transition-all duration-300" style={{ width: `${(onboardProgress.done / onboardProgress.total) * 100}%` }} />
                                </div>
                                <p className="text-[10px] text-slate-500 text-center">{onboardProgress.done} of {onboardProgress.total} processed</p>
                              </div>
                            )}

                            {!onboardingAll && !onboardProgress && (
                              <Button
                                size="sm"
                                onClick={handleOnboardAll}
                                className="w-full text-xs gap-1.5 h-8 no-default-hover-elevate no-default-active-elevate"
                                data-testid="button-onboard-all"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Onboard All ({onboardQueue.length})
                              </Button>
                            )}

                            {onboardProgress && !onboardingAll && (
                              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                  <p className="text-[11px] font-semibold text-emerald-800">
                                    {onboardProgress.results.filter(r => r.success).length} onboarded
                                    {onboardProgress.results.filter(r => !r.success).length > 0 && `, ${onboardProgress.results.filter(r => !r.success).length} failed`}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {lookupError && lookupMode === "lookup" && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200" data-testid="lookup-error">
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">{lookupError}</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>

              {kpiFilter && (
                <div className="px-3 sm:px-5 py-2 border-b border-[#7c86ff]/10 bg-indigo-50/30 flex items-center gap-2" data-testid="kpi-filter-badge">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Filtered:</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    kpiFilter === "scored" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" :
                    kpiFilter === "sp_adopters" ? "bg-indigo-50 border border-indigo-200 text-indigo-700" :
                    "bg-amber-50 border border-amber-200 text-amber-700"
                  }`}>
                    {kpiFilter === "scored" && <><UserCheck className="h-3 w-3" /> Scored Users</>}
                    {kpiFilter === "sp_adopters" && <><Shield className="h-3 w-3" /> SP Adopters</>}
                    {kpiFilter === "queue" && <><Clock className="h-3 w-3" /> In Queue</>}
                  </span>
                  <button
                    onClick={() => setKpiFilter(null)}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors"
                    data-testid="button-clear-kpi-filter"
                  >
                    <XCircle className="h-3 w-3" />
                    Clear filter
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[900px] border-collapse border border-slate-200" data-testid="table-users">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-2 py-2.5 align-middle w-6 border-r border-slate-200"></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Profile</span></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><SortHeader label="Pubkey" sortKey="pubkey" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TA Pubkey</span></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</span></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TA Status</span></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Algorithm</span></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><SortHeader label="# Calcs" sortKey="times_calculated" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><SortHeader label="Last Triggered" sortKey="last_triggered" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap border-r border-slate-200"><SortHeader label="Last Updated" sortKey="last_updated" currentSort={userSort} onSort={handleSort} /></th>
                      <th className="px-2 py-2.5 align-middle whitespace-nowrap text-center"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-300" />
                          Loading users...
                        </td>
                      </tr>
                    ) : adminUsersQuery.isError ? (
                      <tr>
                        <td colSpan={11} className="px-5 py-10 text-center text-sm text-red-400">
                          Failed to load users. Check your admin access.
                        </td>
                      </tr>
                    ) : adminUsersList.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">
                          {userSearch ? "No users match your search" : "No user data available"}
                        </td>
                      </tr>
                    ) : filteredUsersList.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-5 py-10 text-center text-sm text-slate-400">
                          No users match the current filter
                        </td>
                      </tr>
                    ) : (
                      (activeNameSearch ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize) : filteredUsersList).map((u, i) => {
                        const isExpanded = expandedRows.has(u.pubkey);
                        const prof = userProfiles.get(u.pubkey);
                        let npub: string;
                        try { npub = nip19.npubEncode(u.pubkey); } catch { npub = u.pubkey; }
                        const isTriggering = triggeringPubkeys.has(u.pubkey);
                        return (
                          <Fragment key={u.pubkey}>
                            <tr className={`border-b border-slate-200 hover:bg-slate-50/60 transition-colors cursor-pointer ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : ""}`} onClick={() => {
                              setExpandedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(u.pubkey)) next.delete(u.pubkey); else next.add(u.pubkey);
                                return next;
                              });
                            }} data-testid={`row-user-${i}`}>
                              <td className="px-2 py-2.5 border-r border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  {(() => {
                                    const health = getUserHealth(u.latest_status, u.latest_ta_status, u.times_calculated);
                                    const colors = { green: "bg-emerald-400", amber: "bg-amber-400", red: "bg-red-400", gray: "bg-slate-300" };
                                    const titles = { green: "Healthy", amber: "Partial failure", red: "Failing", gray: "No calculations" };
                                    return <span className={`h-2 w-2 rounded-full shrink-0 ${colors[health]}`} title={titles[health]} data-testid={`health-dot-${i}`} />;
                                  })()}
                                  <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </div>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-profile-${i}`}>
                                <div className="flex items-center gap-1.5">
                                  <Avatar className="h-6 w-6 shrink-0">
                                    {prof?.picture ? (
                                      <AvatarImage src={prof.picture} alt={prof.name || "User"} className="object-cover" />
                                    ) : null}
                                    <AvatarFallback className="bg-slate-100 border border-slate-200 text-[9px] text-slate-400">
                                      {prof?.name?.charAt(0)?.toUpperCase() || <Users className="h-3 w-3 text-slate-300" />}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-[9px] text-slate-700 truncate block max-w-[90px] font-medium">
                                    {prof?.name || npub.slice(0, 12) + "..."}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[8px] font-mono text-indigo-500/80">{npub.slice(0, 12)}...{npub.slice(-4)}</span>
                                    <CopyButton text={npub} />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-mono text-slate-400">{u.pubkey.slice(0, 8)}...{u.pubkey.slice(-4)}</span>
                                    <CopyButton text={u.pubkey} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-ta-pubkey-${i}`}>
                                {u.ta_pubkey ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[8px] font-mono text-emerald-600">{u.ta_pubkey.slice(0, 10)}...{u.ta_pubkey.slice(-4)}</span>
                                    <CopyButton text={u.ta_pubkey} />
                                  </div>
                                ) : (
                                  <span className="text-[8px] text-slate-300 italic">none</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-status-${i}`}>
                                {u.latest_status ? (
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                      u.latest_status.toLowerCase() === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                      isFailedStatus(u.latest_status) ? "bg-red-50 text-red-700 border border-red-200" :
                                      "bg-slate-50 text-slate-600 border border-slate-200"
                                    }`}>{u.latest_status}</span>
                                    {isFailedStatus(u.latest_status) && (
                                      <span title="Calculation failed — click row to view error" data-testid={`icon-status-failed-${i}`}>
                                        <AlertTriangle className="h-3 w-3 text-red-500" />
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[8px] text-slate-400 italic">Pending</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-ta-status-${i}`}>
                                {u.latest_ta_status ? (
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                      u.latest_ta_status.toLowerCase() === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                      isFailedStatus(u.latest_ta_status) ? "bg-red-50 text-red-700 border border-red-200" :
                                      "bg-slate-50 text-slate-600 border border-slate-200"
                                    }`}>{u.latest_ta_status}</span>
                                    {isFailedStatus(u.latest_ta_status) && (
                                      <span title="Trust Attestation failed — click row to view error" data-testid={`icon-ta-status-failed-${i}`}>
                                        <AlertTriangle className="h-3 w-3 text-red-500" />
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[8px] text-slate-400 italic">Pending</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-algorithm-${i}`}>
                                {u.latest_algorithm ? (
                                  <span className="text-[9px] font-mono text-slate-600">{u.latest_algorithm}</span>
                                ) : (
                                  <span className="text-[8px] text-slate-400 italic">N/A</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-times-calc-${i}`}>
                                <span className="text-[10px] font-mono text-slate-600 tabular-nums">{u.times_calculated}</span>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-last-triggered-${i}`}>
                                <div>
                                  <span className="text-[9px] text-slate-600 block">{formatTimestamp(u.last_triggered)}</span>
                                  {timeAgo(u.last_triggered) && <span className="text-[8px] text-slate-400">{timeAgo(u.last_triggered)}</span>}
                                </div>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-last-updated-${i}`}>
                                <div>
                                  <span className="text-[9px] text-slate-600 block">{formatTimestamp(u.last_updated)}</span>
                                  {timeAgo(u.last_updated) && <span className="text-[8px] text-slate-400">{timeAgo(u.last_updated)}</span>}
                                </div>
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <div className="flex items-center gap-1 justify-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] text-emerald-600 hover:text-emerald-800 no-default-hover-elevate no-default-active-elevate px-2 h-6"
                                    disabled={isTriggering}
                                    onClick={(e) => { e.stopPropagation(); setTriggerConfirmPubkey(u.pubkey); }}
                                    data-testid={`button-trigger-graperank-${i}`}
                                  >
                                    {isTriggering ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                                    {isTriggering ? "..." : "Trigger"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] text-[#7c86ff] hover:text-[#333286] no-default-hover-elevate no-default-active-elevate px-2 h-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                                      navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                                    }}
                                    data-testid={`button-view-user-${i}`}
                                  >
                                    <Eye className="h-3 w-3 mr-1" /> View
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <UserHistoryRow pubkey={u.pubkey} npub={npub} taPubkey={u.ta_pubkey} />
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-3 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[9px] text-slate-500">Data from /admin/users</span>
                </div>
                {adminUsersQuery.isFetching && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                    <span className="text-[9px] text-slate-400">Refreshing...</span>
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <div className="px-3 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2" data-testid="pagination-users">
                  <span className="text-xs text-slate-500">
                    Page {userPage + 1} of {totalPages} ({(activeNameSearch ? filteredUsersList.length : adminUsersTotal).toLocaleString()} total)
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

            <Dialog open={triggerConfirmPubkey !== null} onOpenChange={(open) => { if (!open) setTriggerConfirmPubkey(null); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-emerald-600" />
                    Confirm GrapeRank Trigger
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 pt-1">
                    You are about to manually trigger a GrapeRank calculation. Please review the details below before confirming.
                  </DialogDescription>
                </DialogHeader>
                {triggerConfirmPubkey && (
                  <div className="pt-2 space-y-4">
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">What happens when you confirm</p>
                      <ul className="text-xs text-amber-900 space-y-1.5 list-disc list-inside">
                        <li>A GrapeRank calculation request is sent to the Brainstorm staging server for this user's pubkey</li>
                        <li>The server crawls the user's Nostr social graph — follows, mutes, and interactions — to compute personalized trust scores</li>
                        <li>This is <span className="font-semibold">resource-intensive</span> and may take several minutes depending on graph size</li>
                        <li>Progress and results will appear in the <span className="font-semibold">Activity tab</span> once processing begins</li>
                        <li>If a calculation is already running for this user, a duplicate request may be queued</li>
                      </ul>
                    </div>
                    <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1.5">Good to know</p>
                      <p className="text-xs text-blue-800">GrapeRank scores are calculated relative to the user's own social graph. Each user's Web of Trust is unique. Triggering this does not affect other users' scores.</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Pubkey</p>
                      <p className="text-xs font-mono text-slate-800 break-all" data-testid="text-trigger-confirm-pubkey">{triggerConfirmPubkey}</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTriggerConfirmPubkey(null)}
                        className="text-xs no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-cancel-trigger"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const pk = triggerConfirmPubkey;
                          setTriggerConfirmPubkey(null);
                          handleTriggerGraperank(pk);
                        }}
                        className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-confirm-trigger"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Confirm Trigger
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            </>
          )}

          {activeTab === "health" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="panel-health">

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-api-health">
                <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>API Health</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Live endpoint status from active queries</p>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { name: "/user/self", ok: selfQuery.isSuccess, loading: selfQuery.isLoading, error: selfQuery.isError, description: "User profile & social graph" },
                    { name: "/user/graperankResult", ok: grapeRankQuery.isSuccess, loading: grapeRankQuery.isLoading, error: grapeRankQuery.isError, description: "GrapeRank calculation result" },
                    { name: "/admin/users", ok: adminUsersQuery.isSuccess, loading: adminUsersQuery.isLoading, error: adminUsersQuery.isError, description: "Platform user database" },
                    { name: "/admin/activity", ok: adminActivityQuery.isSuccess || !adminActivityQuery.isError, loading: adminActivityQuery.isLoading, error: adminActivityQuery.isError, description: "Platform calculation activity" },
                  ].map(ep => (
                    <div key={ep.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 p-3 rounded-xl bg-white/50 border border-slate-100" data-testid={`health-ep-${ep.name.replace(/[\/*]/g, "-")}`}>
                      <div className="flex items-center gap-3">
                        {ep.loading ? (
                          <Loader2 className="h-4 w-4 text-slate-400 animate-spin shrink-0" />
                        ) : ep.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        )}
                        <div>
                          <span className="text-xs font-mono font-semibold text-slate-800">{ep.name}</span>
                          <p className="text-[10px] text-slate-400">{ep.description}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        ep.loading ? "bg-slate-50 text-slate-500 border border-slate-200" :
                        ep.ok ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                        "bg-red-50 text-red-600 border border-red-200"
                      }`}>
                        {ep.loading ? "Loading" : ep.ok ? "Healthy" : "Error"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-relay-status">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />
                <div className="px-4 sm:px-5 py-4 border-b border-[#7c86ff]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Relay Connectivity</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Live WebSocket latency probes</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={runRelayCheck}
                    disabled={relayCheckRunning}
                    className="text-xs gap-1.5 w-full sm:w-auto no-default-hover-elevate no-default-active-elevate"
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
                      <div key={relay} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-3 rounded-xl bg-white/60 border border-slate-100" data-testid={`relay-row-${idx}`}>
                        <div className="flex items-center gap-3 min-w-0">
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
                            <p className="text-[10px] font-mono text-slate-400 truncate max-w-[200px] sm:max-w-none">{relay}</p>
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

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-encryption-security">
                <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-sky-500 to-cyan-400" />
                <div className="px-5 py-4 border-b border-[#7c86ff]/10">
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Encryption Security</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Nsec-at-rest encryption key management</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-xl bg-white/50 border border-slate-100" data-testid="encryption-verify-row">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Verify Encryption</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Check all encrypted nsec rows decrypt with the current key</p>
                        {verifyResult && (
                          <p className={`text-[10px] font-medium mt-1.5 ${verifyResult.success ? "text-emerald-600" : "text-red-600"}`} data-testid="verify-result">
                            {verifyResult.message}
                          </p>
                        )}
                        {!verifyResult && !verifyRunning && (
                          <p className="text-[10px] text-slate-400 mt-1.5 italic">Not checked yet</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVerifyConfirmOpen(true)}
                      disabled={verifyRunning || rotateRunning}
                      className="text-xs gap-1.5 shrink-0 w-full sm:w-auto no-default-hover-elevate no-default-active-elevate"
                      data-testid="button-verify-encryption"
                    >
                      {verifyRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {verifyRunning ? "Verifying..." : "Run Verify"}
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 rounded-xl bg-white/50 border border-slate-100" data-testid="encryption-rotate-row">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                        <KeyRound className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Rotate Encryption Key</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Re-encrypt all nsec values with a new key</p>
                        {rotateResult && (
                          <p className={`text-[10px] font-medium mt-1.5 ${rotateResult.success ? "text-emerald-600" : "text-red-600"}`} data-testid="rotate-result">
                            {rotateResult.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setRotateAcknowledged(false); setRotateConfirmOpen(true); }}
                      disabled={rotateRunning || verifyRunning}
                      className="text-xs gap-1.5 shrink-0 w-full sm:w-auto border-amber-200 text-amber-700 hover:bg-amber-50 no-default-hover-elevate no-default-active-elevate"
                      data-testid="button-rotate-encryption"
                    >
                      {rotateRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      {rotateRunning ? "Rotating..." : "Rotate Key"}
                    </Button>
                  </div>

                  <Dialog open={verifyConfirmOpen} onOpenChange={setVerifyConfirmOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <ShieldCheck className="h-5 w-5 text-emerald-600" />
                          Confirm Encryption Verify
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-600 pt-1">
                          You are about to run a verification check on nsec encryption. Please review the details below before confirming.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="pt-2 space-y-4">
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">What happens when you confirm</p>
                          <ul className="text-xs text-amber-900 space-y-1.5 list-disc list-inside">
                            <li>The server checks that all stored nsec private keys can be successfully decrypted with the current encryption key</li>
                            <li>Each nsec is decrypted and re-validated to confirm data integrity</li>
                            <li>This is a <span className="font-semibold">read-only operation</span> — no data is modified or overwritten</li>
                            <li>Results will be displayed inline on the Encryption Security card</li>
                          </ul>
                        </div>
                        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1.5">Good to know</p>
                          <p className="text-xs text-blue-800">Verification is safe to run at any time. It does not change any keys or data. It is recommended to run a verify before performing a key rotation to ensure all nsec values are in a healthy state.</p>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVerifyConfirmOpen(false)}
                            className="text-xs no-default-hover-elevate no-default-active-elevate"
                            data-testid="button-cancel-verify"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleVerifyEncryption}
                            disabled={verifyRunning}
                            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white no-default-hover-elevate no-default-active-elevate"
                            data-testid="button-confirm-verify"
                          >
                            {verifyRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            {verifyRunning ? "Verifying..." : "Confirm Verify"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={rotateConfirmOpen} onOpenChange={(open) => { setRotateConfirmOpen(open); if (open) setRotateAcknowledged(false); }}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-700">
                          <KeyRound className="h-5 w-5" />
                          Confirm Key Rotation
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-600 pt-1">
                          You are about to rotate the nsec encryption key. Please review the details below carefully before confirming.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="pt-2 space-y-4">
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">What happens when you confirm</p>
                          <ul className="text-xs text-amber-900 space-y-1.5 list-disc list-inside">
                            <li>A new encryption key is generated on the server</li>
                            <li>All stored nsec private keys are decrypted with the old key and <span className="font-semibold">re-encrypted with the new key</span></li>
                            <li>This operation is <span className="font-semibold">irreversible</span> — the old key is discarded after rotation</li>
                            <li>This is resource-intensive and may take several seconds depending on the number of stored nsec values</li>
                            <li>Any previous verify result will be cleared — run verify again after rotation to confirm success</li>
                          </ul>
                        </div>
                        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1.5">Good to know</p>
                          <p className="text-xs text-blue-800">Key rotation is typically done as a security precaution — for example, if you suspect the current key has been compromised or as part of a regular rotation schedule. Always run "Run Verify" first to ensure all nsec values are decryptable before rotating.</p>
                        </div>
                        <label className="flex items-start gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200 cursor-pointer select-none" data-testid="checkbox-rotate-acknowledge">
                          <input
                            type="checkbox"
                            checked={rotateAcknowledged}
                            onChange={(e) => setRotateAcknowledged(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-red-300 text-red-600 accent-red-600 shrink-0"
                          />
                          <span className="text-xs font-medium text-red-800 leading-relaxed">
                            I understand this action is <span className="font-bold">irreversible</span>, the old encryption key will be permanently discarded, and I want to proceed with key rotation.
                          </span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRotateConfirmOpen(false)}
                            className="text-xs no-default-hover-elevate no-default-active-elevate"
                            data-testid="button-cancel-rotate"
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleRotateEncryption}
                            disabled={rotateRunning || !rotateAcknowledged}
                            className="text-xs gap-1.5 no-default-hover-elevate no-default-active-elevate"
                            data-testid="button-confirm-rotate"
                          >
                            {rotateRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                            {rotateRunning ? "Rotating..." : "Confirm Rotation"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-6" data-testid="panel-activity">

              {(() => {
                const actSummaryActivity = overviewAllActivity;
                const actSummaryUsers = overviewAllUsers;
                const actSummaryLoading = overviewLoading;
                const now = Date.now();

                const rangeLabels: Record<ActivityTimeRange, string> = {
                  "24h": "Last 24 Hours",
                  "week": "This Week",
                  "month": "This Month",
                  "quarter": "This Quarter",
                  "all": "All Time",
                };
                const rangeShort: Record<ActivityTimeRange, string> = {
                  "24h": "24h",
                  "week": "Week",
                  "month": "Month",
                  "quarter": "Quarter",
                  "all": "All",
                };

                const getStartMs = (range: ActivityTimeRange): number => {
                  if (range === "all") return 0;
                  const d = new Date();
                  switch (range) {
                    case "24h": return now - 86400000;
                    case "week": { d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d.getTime(); }
                    case "month": { d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); }
                    case "quarter": {
                      const qMonth = Math.floor(d.getMonth() / 3) * 3;
                      d.setMonth(qMonth, 1); d.setHours(0,0,0,0);
                      return d.getTime();
                    }
                    default: return 0;
                  }
                };
                const getEndMs = (_range: ActivityTimeRange): number => now;

                const startMs = getStartMs(activityTimeRange);
                const endMs = getEndMs(activityTimeRange);

                const parseTs = (ts: string): number => {
                  try {
                    return new Date(ts.endsWith("Z") ? ts : ts + "Z").getTime();
                  } catch { return 0; }
                };

                const filteredItems = actSummaryActivity.filter(a => {
                  const t = parseTs(a.updated_at);
                  return t >= startMs && t <= endMs;
                });
                const filteredSuccess = filteredItems.filter(a => a.status?.toLowerCase() === "success").length;
                const filteredFailed = filteredItems.filter(a => a.status?.toLowerCase() === "failed").length;
                const filteredTotal = filteredItems.length;
                const totalCalcsAll = actSummaryUsers.reduce((s, u) => s + (u.times_calculated || 0), 0);
                const failedUsers = actSummaryUsers.filter(u => u.latest_status?.toLowerCase() === "failed" || u.latest_ta_status?.toLowerCase() === "failed").length;
                const sortedByUpdate = [...actSummaryUsers].sort((a, b) => {
                  const ta = new Date(a.last_updated || "").getTime() || 0;
                  const tb = new Date(b.last_updated || "").getTime() || 0;
                  return tb - ta;
                });
                const lastActivityTs = sortedByUpdate[0]?.last_updated ?? null;
                const uniquePubkeys = new Set(filteredItems.map(a => a.pubkey).filter(Boolean)).size;

                const presets: ActivityTimeRange[] = ["24h", "week", "month", "quarter", "all"];

                return (
                  <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-activity-summary">
                    <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                    <div className="px-4 sm:px-5 py-4 border-b border-[#7c86ff]/10">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Activity Summary</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Platform-wide throughput — <span className="font-semibold text-[#333286]">{rangeLabels[activityTimeRange]}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={overviewActivityQuery.isSuccess && overviewUsersQuery.isSuccess ? "connected" : overviewActivityQuery.isError || overviewUsersQuery.isError ? "disconnected" : "degraded"} />
                        </div>
                      </div>
                      <div className="mt-3 hidden sm:flex flex-wrap items-center gap-1.5" data-testid="time-range-selector">
                        {presets.map(p => (
                          <button
                            key={p}
                            onClick={() => setActivityTimeRange(p)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                              activityTimeRange === p
                                ? "bg-[#333286] text-white shadow-md shadow-indigo-200"
                                : "bg-white/70 text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-[#333286]"
                            }`}
                            data-testid={`time-range-${p}`}
                          >
                            {rangeShort[p]}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 sm:hidden" data-testid="time-range-selector-mobile">
                        <div className="relative">
                          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#333286] pointer-events-none" />
                          <select
                            value={activityTimeRange}
                            onChange={e => setActivityTimeRange(e.target.value as ActivityTimeRange)}
                            className="w-full appearance-none pl-8 pr-8 py-2 rounded-lg text-xs font-semibold bg-white border border-[#7c86ff]/30 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40 shadow-sm"
                            data-testid="select-time-range-mobile"
                          >
                            {presets.map(p => (
                              <option key={p} value={p}>{rangeLabels[p]}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                      {activityTimeRange !== "24h" && (
                        <p className="mt-2 text-[9px] text-slate-400 italic">Based on latest 100 activity records. Broader ranges may not reflect full history.</p>
                      )}
                    </div>
                    <div className="p-4 sm:p-5">
                      {actSummaryLoading ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
                          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl" />)}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid="summary-total">
                            <Activity className="h-4 w-4 text-[#333286] mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-900">{filteredTotal.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">{rangeShort[activityTimeRange]} Requests</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid="summary-success">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-emerald-600">{filteredSuccess.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">{rangeShort[activityTimeRange]} Succeeded</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid="summary-failed">
                            <XCircle className="h-4 w-4 text-red-400 mx-auto mb-1" />
                            <p className="text-lg font-bold text-red-500">{filteredFailed.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">{rangeShort[activityTimeRange]} Failed</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid="summary-unique-users">
                            <Users className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-900">{uniquePubkeys.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">{rangeShort[activityTimeRange]} Active Users</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid="summary-total-calcs">
                            <Hash className="h-4 w-4 text-[#333286] mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-900">{totalCalcsAll.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">Total Calculations</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white/50 border border-slate-100 text-center" data-testid="summary-failed-users">
                            <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-slate-900">{failedUsers.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">Users w/ Failures</p>
                          </div>
                        </div>
                      )}
                      {lastActivityTs && !actSummaryLoading && (
                        <p className="text-[10px] text-slate-400 mt-3">
                          Last platform activity: {(() => {
                            try {
                              const d = new Date(lastActivityTs.endsWith("Z") ? lastActivityTs : lastActivityTs + "Z");
                              return d.toLocaleString();
                            } catch { return lastActivityTs; }
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="card-platform-activity">
                <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-blue-500 to-indigo-400" />
                <div className="px-4 sm:px-5 py-4 border-b border-[#7c86ff]/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Platform Activity</h3>
                      <p className="text-xs text-slate-500 mt-0.5">All GrapeRank calculation records from /admin/activity</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-slate-400">{activityTotal.toLocaleString()} total</span>
                      <LiveBadge updatedAt={adminActivityQuery.dataUpdatedAt} boosting={isBoostActive} isFetching={adminActivityQuery.isFetching} />
                      <StatusBadge status={adminActivityQuery.isSuccess ? "connected" : adminActivityQuery.isError ? "disconnected" : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError ? "connected" : "degraded"} />
                    </div>
                  </div>
                </div>
                <div className="p-3 sm:p-5">
                  {adminActivityQuery.isLoading && !activityItems.length ? (
                    <div className="space-y-2 animate-pulse">
                      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg" />)}
                    </div>
                  ) : adminActivityQuery.isError ? (
                    <div className="text-center py-8">
                      <XCircle className="h-8 w-8 text-red-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-500">Failed to load activity</p>
                      <p className="text-[10px] text-slate-400 mt-1">{adminActivityQuery.error instanceof Error ? adminActivityQuery.error.message : "Unknown error"}</p>
                    </div>
                  ) : activityItems.length === 0 ? (
                    <div className="text-center py-8">
                      <Activity className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-400">No activity records</p>
                      <p className="text-[10px] text-slate-400 mt-1">No GrapeRank calculations have been recorded yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[780px]" data-testid="table-platform-activity">
                          <thead>
                            <tr className="border-b border-slate-200/60">
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Created</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Updated</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Pubkey</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">TA Status</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Pub Status</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Algorithm</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Queue</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Req #</th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activityItems.map((item, idx) => (
                              <ActivityRow key={item.private_id ?? idx} item={item} idx={idx} onViewDetail={handleViewRequestDetail} onNavigateToUser={(pubkey) => { setUserSearch(pubkey); setDebouncedSearch(pubkey); setActiveTab("users"); setKpiFilter(null); setUserPage(0); setExpandedRows(new Set([pubkey])); setHighlightedPubkey(pubkey); setTimeout(() => setHighlightedPubkey(null), 2500); }} onRetrigger={async (pubkey) => { try { await apiClient.triggerUserGraperank(pubkey); toast({ title: "Request Queued", description: `Re-triggered GrapeRank for ${pubkey.slice(0, 12)}...` }); queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); triggerRefreshBoost(); } catch (err: unknown) { const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null ? JSON.stringify(err) : "Unknown error"; toast({ title: "Re-trigger Failed", description: msg, variant: "destructive" }); throw err; } }} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">Rows per page:</span>
                          <select
                            className="text-[10px] border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-700"
                            value={activityPageSize}
                            onChange={(e) => { setActivityPageSize(Number(e.target.value) as PageSizeOption); setActivityPage(0); }}
                            data-testid="select-activity-page-size"
                          >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            Page {activityPage + 1} of {activityTotalPages}
                          </span>
                          <div className="flex gap-1">
                            <button
                              className="px-2 py-1 rounded text-[10px] border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                              disabled={activityPage === 0}
                              onClick={() => setActivityPage(p => Math.max(0, p - 1))}
                              data-testid="button-activity-prev"
                            >
                              Prev
                            </button>
                            <button
                              className="px-2 py-1 rounded text-[10px] border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                              disabled={activityPage + 1 >= activityTotalPages}
                              onClick={() => setActivityPage(p => p + 1)}
                              data-testid="button-activity-next"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">Click any row to expand details. Use the re-trigger button to re-run GrapeRank for that user.</p>
                    </>
                  )}
                </div>
              </div>

              <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) { setDetailData(null); setDetailError(null); } }}>
                <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-[#333286]" />
                      Brainstorm Request #{detailRequestId}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 pt-1">
                      Full request details for request #{detailRequestId}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="pt-2">
                    {detailLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-[#333286]" />
                        <span className="ml-2 text-sm text-slate-500">Loading request detail...</span>
                      </div>
                    )}
                    {detailError && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200" data-testid="detail-error">
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">{detailError}</p>
                      </div>
                    )}
                    {detailData && (
                      <div className="space-y-2" data-testid="detail-fields">
                        {Object.entries(detailData).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([key, value]) => (
                          <div key={key} className="flex items-start justify-between p-2.5 rounded-lg bg-white/60 border border-slate-100">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0 mr-4">{key}</span>
                            <span className="text-[10px] font-mono text-slate-800 text-right break-all max-w-[60%] sm:max-w-[350px]">
                              {typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

            </div>
          )}

        </div>
      </main>

      <Footer />

      <Dialog open={!!envSwitchTarget} onOpenChange={(open) => { if (!open) setEnvSwitchTarget(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Switch to {envSwitchTarget === "production" ? "Production" : "Staging"}?
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1 break-words">
              {envSwitchTarget === "production"
                ? "You are about to connect to the live production server. All dashboard data will reload from the production API. Actions taken here affect real users and data."
                : "You are about to connect to the staging server. All dashboard data will reload from the staging API."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border p-3 mt-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${apiEnv === "production" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="text-slate-500 font-medium">{apiEnv === "production" ? "Production" : "Staging"}</span>
              </div>
              <span className="text-slate-300">→</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${envSwitchTarget === "production" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="font-semibold text-slate-800">{envSwitchTarget === "production" ? "Production" : "Staging"}</span>
              </div>
            </div>
          </div>
          {envSwitchTarget === "production" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 mt-1">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Production data is live. Triggering calculations or modifying users will affect the real platform.
              </p>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEnvSwitchTarget(null)}
              className="text-xs w-full sm:w-auto"
              data-testid="button-env-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmEnvSwitch}
              className={`text-xs gap-1.5 w-full sm:w-auto ${
                envSwitchTarget === "production"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              }`}
              data-testid="button-env-confirm"
            >
              <Server className="h-3.5 w-3.5" />
              Switch to {envSwitchTarget === "production" ? "Production" : "Staging"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
