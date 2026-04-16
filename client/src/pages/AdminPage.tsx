import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
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
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { getCurrentUser, logout, fetchProfile, PROFILE_RELAYS, type NostrUser } from "@/services/nostr";
import { apiClient, isAuthRedirecting, getApiEnvironment, setApiEnvironment, getApiBaseUrl, type ApiEnvironment } from "@/services/api";
import { isAdminPubkey } from "@/config/adminAccess";
import { useToast } from "@/hooks/use-toast";

type AdminTab = "overview" | "users" | "health" | "activity";
type SortDir = "asc" | "desc";
type PageSizeOption = 25 | 50 | 100;
type ActivityTimeRange = "24h" | "week" | "month" | "quarter" | "all" | "custom";

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

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return dateStr; }
  };

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
                              <span className="text-[11px] font-medium text-slate-700">{formatDate(item.created_at)}</span>
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

function ActivityRow({ item, idx, onViewDetail, onNavigateToUser }: { item: BrainstormRequestInstance; idx: number; onViewDetail: (id: number) => void; onNavigateToUser?: (pubkey: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      if (isNaN(date.getTime())) return d;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  };
  return (
    <>
      <tr
        className={`border-b border-slate-100/60 cursor-pointer hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? "bg-white/40" : "bg-slate-50/30"}`}
        onClick={() => setExpanded(prev => !prev)}
        data-testid={`row-activity-${item.private_id ?? idx}`}
      >
        <td className="px-2 py-2 text-slate-500 whitespace-nowrap text-[10px]">{fmtDate(item.created_at)}</td>
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
        <td className="px-2 py-2 font-mono text-slate-400 text-[10px]">{item.private_id}</td>
      </tr>
      {expanded && (
        <tr className="bg-indigo-50/20">
          <td colSpan={9} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
              {item.pubkey && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Full Pubkey</span>
                  <p className="text-slate-700 font-mono mt-0.5 break-all text-[9px]">{item.pubkey}</p>
                </div>
              )}
              {item.result && (
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
              {item.password && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">Password</span>
                  <p className="text-slate-700 font-mono mt-0.5 break-all">{item.password}</p>
                </div>
              )}
            </div>
            <div className="mt-3 pt-2 border-t border-indigo-100/60">
              <button
                onClick={(e) => { e.stopPropagation(); onViewDetail(item.private_id); }}
                className="text-[10px] font-semibold text-[#333286] hover:text-[#7c86ff] transition-colors flex items-center gap-1"
                data-testid={`button-view-detail-${item.private_id}`}
              >
                <Eye className="h-3 w-3" />
                View Full Request
              </button>
            </div>
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
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [daysFilter, setDaysFilter] = useState(30);
  const [userSort, setUserSort] = useState<SortState>({ key: "last_triggered", dir: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [activityPage, setActivityPage] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState<PageSizeOption>(25);
  const [activityTimeRange, setActivityTimeRange] = useState<ActivityTimeRange>("24h");
  const [customRangeFrom, setCustomRangeFrom] = useState("");
  const [customRangeTo, setCustomRangeTo] = useState("");
  const [kpiFilter, setKpiFilter] = useState<"scored" | "sp_adopters" | "queue" | null>(null);
  const [relayLatencies, setRelayLatencies] = useState<RelayLatency[]>([]);
  const [relayCheckRunning, setRelayCheckRunning] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [triggeringPubkeys, setTriggeringPubkeys] = useState<Set<string>>(new Set());
  const [triggerConfirmPubkey, setTriggerConfirmPubkey] = useState<string | null>(null);
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rotateRunning, setRotateRunning] = useState(false);
  const [rotateResult, setRotateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotateAcknowledged, setRotateAcknowledged] = useState(false);
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupRunning, setLookupRunning] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ success: boolean; message: string; data?: Record<string, unknown> } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPubkey, setCreatePubkey] = useState("");
  const [createRunning, setCreateRunning] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [apiEnv, setApiEnv] = useState<ApiEnvironment>(getApiEnvironment);
  const [envSwitchTarget, setEnvSwitchTarget] = useState<ApiEnvironment | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(userSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

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

  const adminStatsQuery = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => apiClient.getAdminStats(),
    enabled: !!user,
    staleTime: 120_000,
    retry: false,
  });
  const adminStats = adminStatsQuery.data ?? null;
  const hasSystemData = adminStats !== null;

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
  });

  const adminUsersData = adminUsersQuery.data;
  const adminUsersList = adminUsersData?.items ?? [];
  const adminUsersTotal = adminUsersData?.total ?? 0;
  const adminUsersTotalPages = adminUsersData?.pages ?? 1;

  const filteredUsersList = useMemo(() => {
    if (!kpiFilter) return adminUsersList;
    return adminUsersList.filter(u => {
      if (kpiFilter === "scored") return u.latest_status?.toLowerCase() === "success";
      if (kpiFilter === "sp_adopters") return u.latest_ta_status?.toLowerCase() === "success";
      if (kpiFilter === "queue") return u.latest_status?.toLowerCase() !== "success" && u.latest_status?.toLowerCase() !== "failed";
      return true;
    });
  }, [adminUsersList, kpiFilter]);

  const overviewUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users/overview", daysFilter],
    queryFn: () => apiClient.getAdminUsers({ days: daysFilter, page: 1, size: 100 }),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  const overviewActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity/overview"],
    queryFn: () => apiClient.getAdminActivity({ page: 1, size: 100 }),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
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
  });
  const activityData = adminActivityQuery.data;
  const activityItems = activityData?.items ?? [];
  const activityTotal = activityData?.total ?? 0;
  const activityTotalPages = activityData?.pages ?? 1;

  const [userProfiles, setUserProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());

  useEffect(() => {
    if (adminUsersList.length === 0) return;
    let cancelled = false;
    const toFetch = adminUsersList.filter(u => !userProfiles.has(u.pubkey));
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
  }, [adminUsersList]);

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

  const handleTriggerGraperank = useCallback(async (pubkey: string) => {
    setTriggeringPubkeys(prev => new Set(prev).add(pubkey));
    try {
      await apiClient.triggerUserGraperank(pubkey);
      toast({ title: "GrapeRank triggered", description: `Triggered for ${pubkey.slice(0, 12)}...` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Trigger failed", description: message, variant: "destructive" });
    } finally {
      setTriggeringPubkeys(prev => { const next = new Set(prev); next.delete(pubkey); return next; });
    }
  }, [toast, queryClient]);

  const formatCrmDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return dateStr; }
  };

  const totalPages = adminUsersTotalPages;

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

  const handleLookupPubkey = useCallback(async () => {
    const raw = lookupInput.trim();
    if (!raw) {
      setLookupError("Please enter a pubkey or npub");
      return;
    }
    let hexPubkey = raw;
    if (raw.startsWith("npub")) {
      try {
        const decoded = nip19.decode(raw);
        if (decoded.type === "npub") {
          hexPubkey = decoded.data;
        } else {
          setLookupError("Invalid npub format");
          return;
        }
      } catch {
        setLookupError("Invalid npub — could not decode");
        return;
      }
    } else if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      setLookupError("Invalid pubkey — expected 64-char hex or npub");
      return;
    }
    hexPubkey = hexPubkey.toLowerCase();
    setLookupRunning(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const result = await apiClient.getBrainstormPubkey(hexPubkey);
      const data = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
      const brainstormPubkey = typeof data.brainstorm_pubkey === "string" ? data.brainstorm_pubkey
        : typeof data.ta_pubkey === "string" ? data.ta_pubkey
        : typeof data.pubkey === "string" ? data.pubkey : null;
      const isNew = data.created === true || data.is_new === true;
      const safeFields: Record<string, unknown> = {};
      for (const key of ["brainstorm_pubkey", "ta_pubkey", "pubkey", "status", "ta_status", "created", "is_new", "times_calculated"]) {
        if (key in data) safeFields[key] = data[key];
      }
      if (isNew) {
        setLookupResult({ success: true, message: "User onboarded — first GrapeRank calculation triggered", data: safeFields });
        toast({ title: "User Onboarded", description: brainstormPubkey ? `Brainstorm pubkey: ${brainstormPubkey.slice(0, 16)}...` : "New user created" });
      } else {
        setLookupResult({ success: true, message: "User found", data: safeFields });
        toast({ title: "User Found", description: brainstormPubkey ? `Brainstorm pubkey: ${brainstormPubkey.slice(0, 16)}...` : "Existing user" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLookupError(msg);
      toast({ title: "Lookup Failed", description: msg, variant: "destructive" });
    } finally {
      setLookupRunning(false);
    }
  }, [lookupInput, toast, queryClient]);

  const handleViewRequestDetail = useCallback(async (requestId: number) => {
    setDetailRequestId(requestId);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    setDetailError(null);
    try {
      const result = await apiClient.getBrainstormRequest(String(requestId));
      const data = typeof result === "object" && result !== null ? result as Record<string, unknown> : { result };
      setDetailData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setDetailError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCreateRequest = useCallback(async () => {
    const raw = createPubkey.trim();
    if (!raw) {
      setCreateError("Please enter a pubkey or npub");
      return;
    }
    let hexPubkey = raw;
    if (raw.startsWith("npub")) {
      try {
        const decoded = nip19.decode(raw);
        if (decoded.type === "npub") {
          hexPubkey = decoded.data;
        } else {
          setCreateError("Invalid npub format");
          return;
        }
      } catch {
        setCreateError("Invalid npub — could not decode");
        return;
      }
    } else if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      setCreateError("Invalid pubkey — expected 64-char hex or npub");
      return;
    }
    hexPubkey = hexPubkey.toLowerCase();
    setCreateRunning(true);
    setCreateError(null);
    try {
      await apiClient.createBrainstormRequest({ pubkey: hexPubkey });
      toast({ title: "Request Created", description: `Brainstorm request queued for ${hexPubkey.slice(0, 12)}...` });
      setCreateOpen(false);
      setCreatePubkey("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setCreateError(msg);
      toast({ title: "Create Failed", description: msg, variant: "destructive" });
    } finally {
      setCreateRunning(false);
    }
  }, [createPubkey, toast, queryClient]);

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
    { key: "health", label: "System Health", icon: Server },
    { key: "users", label: "Users", icon: Users },
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
        calcDone={calcDone}
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
              value={formatNumber(hasSystemData ? adminStats!.scoredUsers : 0)}
              icon={UserCheck}
              subtitle={hasSystemData ? "Completed GrapeRank" : "From /admin/stats"}
              tooltip="Click to view scored users"
              scope={hasSystemData ? "system" : "graph"}
              onClick={() => { setKpiFilter("scored"); setActiveTab("users"); setUserPage(0); }}
            />
            <KpiCard
              label="SP Adopters"
              value={formatNumber(hasSystemData ? adminStats!.spAdopters : 0)}
              icon={Shield}
              subtitle={hasSystemData ? "Published NIP-85 TA" : "From /admin/stats"}
              tooltip="Click to view SP adopters"
              scope={hasSystemData ? "system" : "graph"}
              onClick={() => { setKpiFilter("sp_adopters"); setActiveTab("users"); setUserPage(0); }}
            />
            <KpiCard
              label="Reports Filed"
              value="—"
              icon={AlertTriangle}
              subtitle="Awaiting endpoint"
              tooltip="Total mute and report actions filed across the entire Brainstorm platform. This metric requires a dedicated reporting endpoint that is not yet available."
              unsupported
            />
            <KpiCard
              label={hasSystemData ? "Queue Depth" : "Queue Position"}
              value={hasSystemData ? formatNumber(adminStats!.queueDepth) : (queuePosition !== null ? queuePosition.toString() : "—")}
              icon={Clock}
              subtitle={hasSystemData ? "Users awaiting calculation" : (queuePosition !== null ? "Position in queue" : "Via graperankResult")}
              tooltip="Click to view queued users"
              scope={hasSystemData ? "system" : "graph"}
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
                  <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Pipeline Health</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Platform-wide GrapeRank calculation health from /admin/users</p>
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
                        <div key={ep.endpoint} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-slate-100" data-testid={`endpoint-${ep.label.toLowerCase().replace(/\s+/g, "-")}`}>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{ep.label}</p>
                            <p className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]" title={`${baseUrl}${ep.endpoint}`}>{baseUrl}{ep.endpoint}</p>
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
                    <span className="text-xs text-slate-500">{adminUsersTotal.toLocaleString()} users</span>
                    <span className="text-[10px] text-slate-400">|</span>
                    <span className="text-[10px] text-slate-400">Page {(userPage + 1)} of {totalPages}</span>
                    <span className="text-[10px] text-slate-400">|</span>
                    <span className="text-[10px] text-emerald-600 font-medium">Source: /admin/users</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search pubkey, npub..."
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40 w-full sm:w-56"
                    data-testid="input-user-search"
                  />
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
                    onClick={() => { setLookupOpen(true); setLookupInput(""); setLookupResult(null); setLookupError(null); }}
                    className="text-xs gap-1.5 h-8 no-default-hover-elevate no-default-active-elevate"
                    data-testid="button-lookup-pubkey"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Lookup Pubkey
                  </Button>
                </div>

                <Dialog open={lookupOpen} onOpenChange={(open) => { setLookupOpen(open); if (!open) { setLookupResult(null); setLookupError(null); } }}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-[#333286]" />
                        Lookup / Onboard Pubkey
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-600 pt-1">
                        Enter a Nostr pubkey (hex) or npub to look up or onboard a user. If the user doesn't exist, their record will be created and a GrapeRank calculation will be triggered.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="npub1... or 64-char hex pubkey"
                          value={lookupInput}
                          onChange={e => { setLookupInput(e.target.value); setLookupError(null); }}
                          onKeyDown={e => { if (e.key === "Enter" && !lookupRunning) handleLookupPubkey(); }}
                          className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                          data-testid="input-lookup-pubkey"
                        />
                        <Button
                          size="sm"
                          onClick={handleLookupPubkey}
                          disabled={lookupRunning || !lookupInput.trim()}
                          className="text-xs gap-1.5 no-default-hover-elevate no-default-active-elevate"
                          data-testid="button-submit-lookup"
                        >
                          {lookupRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                          {lookupRunning ? "Looking up..." : "Lookup"}
                        </Button>
                      </div>
                      {lookupError && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200" data-testid="lookup-error">
                          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700">{lookupError}</p>
                        </div>
                      )}
                      {lookupResult && (
                        <div className={`p-4 rounded-xl border ${lookupResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`} data-testid="lookup-result">
                          <div className="flex items-center gap-2 mb-2">
                            {lookupResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            <p className={`text-xs font-semibold ${lookupResult.success ? "text-emerald-800" : "text-red-800"}`}>{lookupResult.message}</p>
                          </div>
                          {lookupResult.data && Object.keys(lookupResult.data).length > 0 && (
                            <div className="space-y-1.5 mt-3 pt-3 border-t border-emerald-200/60">
                              {Object.entries(lookupResult.data).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between">
                                  <span className="text-[10px] font-medium text-slate-600">{key}</span>
                                  <span className="text-[10px] font-mono text-slate-800 max-w-[280px] truncate">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
                      filteredUsersList.map((u, i) => {
                        const isExpanded = expandedRows.has(u.pubkey);
                        const prof = userProfiles.get(u.pubkey);
                        let npub: string;
                        try { npub = nip19.npubEncode(u.pubkey); } catch { npub = u.pubkey; }
                        const isTriggering = triggeringPubkeys.has(u.pubkey);
                        return (
                          <Fragment key={u.pubkey}>
                            <tr className="border-b border-slate-200 hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => {
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
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                    u.latest_status.toLowerCase() === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                    u.latest_status.toLowerCase() === "failure" ? "bg-red-50 text-red-700 border border-red-200" :
                                    "bg-slate-50 text-slate-600 border border-slate-200"
                                  }`}>{u.latest_status}</span>
                                ) : (
                                  <span className="text-[8px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-ta-status-${i}`}>
                                {u.latest_ta_status ? (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                    u.latest_ta_status.toLowerCase() === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                    u.latest_ta_status.toLowerCase() === "failure" ? "bg-red-50 text-red-700 border border-red-200" :
                                    "bg-slate-50 text-slate-600 border border-slate-200"
                                  }`}>{u.latest_ta_status}</span>
                                ) : (
                                  <span className="text-[8px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-algorithm-${i}`}>
                                {u.latest_algorithm ? (
                                  <span className="text-[9px] font-mono text-slate-600">{u.latest_algorithm}</span>
                                ) : (
                                  <span className="text-[8px] text-slate-300">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-times-calc-${i}`}>
                                <span className="text-[10px] font-mono text-slate-600 tabular-nums">{u.times_calculated}</span>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-last-triggered-${i}`}>
                                <div>
                                  <span className="text-[9px] text-slate-600 block">{formatCrmDate(u.last_triggered)}</span>
                                  {timeAgo(u.last_triggered) && <span className="text-[8px] text-slate-400">{timeAgo(u.last_triggered)}</span>}
                                </div>
                              </td>
                              <td className="px-2 py-2.5 border-r border-slate-100" data-testid={`cell-last-updated-${i}`}>
                                <div>
                                  <span className="text-[9px] text-slate-600 block">{formatCrmDate(u.last_updated)}</span>
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
                                    onClick={(e) => { e.stopPropagation(); navigate(`/profile/${npub}`); }}
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
                    Page {userPage + 1} of {totalPages} ({adminUsersTotal.toLocaleString()} total)
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

              <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-slate-50/80 via-slate-50/60 to-slate-100/40 backdrop-blur-xl border border-slate-200/60 shadow-none overflow-hidden opacity-60" data-testid="card-infra-overview">
                <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
                <div className="px-5 py-4 border-b border-slate-200/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-400" style={{ fontFamily: "var(--font-display)" }}>Infrastructure</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Awaiting dedicated health check endpoints</p>
                  </div>
                  <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">Unavailable</span>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { icon: Database, label: "Event Store", detail: "Applesauce EventStore" },
                    { icon: Cpu, label: "GrapeRank Engine", detail: "Trust computation pipeline" },
                    { icon: Zap, label: "NIP-85 Publisher", detail: "Trust assertion broadcaster" },
                    { icon: Globe, label: "Brainstorm Server", detail: "Server health metrics" },
                  ].map(comp => (
                    <div key={comp.label} className="p-3 rounded-xl bg-white/30 border border-slate-100/60 space-y-1.5" data-testid={`infra-${comp.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      <div className="flex items-center gap-2">
                        <comp.icon className="h-3.5 w-3.5 text-slate-300" />
                        <span className="text-xs font-semibold text-slate-400">{comp.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-300">{comp.detail}</p>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        No data
                      </span>
                    </div>
                  ))}
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
                  "custom": "Custom Range",
                };
                const rangeShort: Record<ActivityTimeRange, string> = {
                  "24h": "24h",
                  "week": "Week",
                  "month": "Month",
                  "quarter": "Quarter",
                  "all": "All",
                  "custom": "Custom",
                };

                const getStartMs = (range: ActivityTimeRange): number => {
                  if (range === "all") return 0;
                  if (range === "custom") {
                    return customRangeFrom ? new Date(customRangeFrom).getTime() : 0;
                  }
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
                const getEndMs = (range: ActivityTimeRange): number => {
                  if (range === "custom" && customRangeTo) {
                    const end = new Date(customRangeTo);
                    end.setHours(23, 59, 59, 999);
                    return end.getTime();
                  }
                  return now;
                };

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

                const presets: ActivityTimeRange[] = ["24h", "week", "month", "quarter", "all", "custom"];

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
                            {p === "custom" && <Calendar className="h-3 w-3 inline mr-1 -mt-0.5" />}
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
                      {activityTimeRange === "custom" && (
                        <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 rounded-xl bg-white/60 border border-indigo-100" data-testid="custom-range-picker">
                          <Calendar className="h-4 w-4 text-[#333286] shrink-0 hidden sm:block" />
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 w-full">
                            <div className="flex items-center gap-1.5 w-full sm:w-auto">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">From</label>
                              <input
                                type="date"
                                value={customRangeFrom}
                                max={customRangeTo || undefined}
                                onChange={e => setCustomRangeFrom(e.target.value)}
                                className="flex-1 sm:w-36 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                                data-testid="input-custom-from"
                              />
                            </div>
                            <span className="text-slate-300 hidden sm:inline">—</span>
                            <div className="flex items-center gap-1.5 w-full sm:w-auto">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">To</label>
                              <input
                                type="date"
                                value={customRangeTo}
                                min={customRangeFrom || undefined}
                                onChange={e => setCustomRangeTo(e.target.value)}
                                className="flex-1 sm:w-36 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                                data-testid="input-custom-to"
                              />
                            </div>
                            {(customRangeFrom || customRangeTo) && (
                              <button
                                onClick={() => { setCustomRangeFrom(""); setCustomRangeTo(""); }}
                                className="text-[10px] text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                data-testid="button-clear-custom-range"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      )}
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
                      <StatusBadge status={adminActivityQuery.isSuccess ? "connected" : adminActivityQuery.isError ? "disconnected" : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError ? "connected" : "degraded"} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCreateOpen(true); setCreatePubkey(""); setCreateError(null); }}
                        className="text-xs gap-1.5 h-7 no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-new-request"
                      >
                        <Play className="h-3 w-3" />
                        New Request
                      </Button>
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
                        <table className="w-full text-left min-w-[700px]" data-testid="table-platform-activity">
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
                            </tr>
                          </thead>
                          <tbody>
                            {activityItems.map((item, idx) => (
                              <ActivityRow key={item.private_id ?? idx} item={item} idx={idx} onViewDetail={handleViewRequestDetail} onNavigateToUser={(pubkey) => { setUserSearch(pubkey); setActiveTab("users"); setKpiFilter(null); setUserPage(0); setExpandedRows(new Set([pubkey])); }} />
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
                      <p className="text-[10px] text-slate-400 mt-2 italic">Click any row to expand and see additional fields, or use "View Full Request" for complete detail.</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl bg-gradient-to-br from-slate-50/80 via-slate-50/60 to-slate-100/40 backdrop-blur-xl border border-slate-200/60 shadow-none overflow-hidden opacity-60" data-testid="card-session-activity">
                  <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
                  <div className="px-5 py-4 border-b border-slate-200/40 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-400" style={{ fontFamily: "var(--font-display)" }}>Session Activity Log</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Awaiting /admin/analytics endpoint</p>
                    </div>
                    <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">Unavailable</span>
                  </div>
                  <div className="p-5">
                    <div className="space-y-2">
                      {["Login events", "Admin session timeline", "User-triggered events"].map(label => (
                        <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg bg-white/30 border border-slate-100/60">
                          <Activity className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                          <span className="text-xs text-slate-400">{label}</span>
                          <span className="ml-auto text-[10px] text-slate-300">No data</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-slate-50/80 via-slate-50/60 to-slate-100/40 backdrop-blur-xl border border-slate-200/60 shadow-none overflow-hidden opacity-60" data-testid="card-error-log">
                  <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
                  <div className="px-5 py-4 border-b border-slate-200/40 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-400" style={{ fontFamily: "var(--font-display)" }}>Platform Error Log</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Awaiting platform-wide error feed</p>
                    </div>
                    <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">Unavailable</span>
                  </div>
                  <div className="p-5">
                    <div className="space-y-2">
                      {["Pipeline failures across users", "API error aggregation", "Error rate trends"].map(label => (
                        <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg bg-white/30 border border-slate-100/60">
                          <XCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                          <span className="text-xs text-slate-400">{label}</span>
                          <span className="ml-auto text-[10px] text-slate-300">No data</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
                      Full request details from /admin/brainstormRequest/{detailRequestId}
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
                        {Object.entries(detailData).map(([key, value]) => (
                          <div key={key} className="flex items-start justify-between p-2.5 rounded-lg bg-white/60 border border-slate-100">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0 mr-4">{key}</span>
                            <span className="text-[10px] font-mono text-slate-800 text-right break-all max-w-[350px]">
                              {value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setCreateError(null); } }}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-[#333286]" />
                      New Brainstorm Request
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 pt-1">
                      Queue a new GrapeRank calculation for a specific pubkey. The request will be created and appear in the activity table.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Pubkey</label>
                      <input
                        type="text"
                        placeholder="npub1... or 64-char hex pubkey"
                        value={createPubkey}
                        onChange={e => { setCreatePubkey(e.target.value); setCreateError(null); }}
                        onKeyDown={e => { if (e.key === "Enter" && !createRunning) handleCreateRequest(); }}
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 focus:border-[#7c86ff]/40"
                        data-testid="input-create-pubkey"
                      />
                    </div>
                    {createError && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200" data-testid="create-error">
                        <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">{createError}</p>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCreateOpen(false)}
                        className="text-xs no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-cancel-create"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCreateRequest}
                        disabled={createRunning || !createPubkey.trim()}
                        className="text-xs gap-1.5 no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-submit-create"
                      >
                        {createRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        {createRunning ? "Creating..." : "Create Request"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

        </div>
      </main>

      <Footer />

      <Dialog open={!!envSwitchTarget} onOpenChange={(open) => { if (!open) setEnvSwitchTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Switch to {envSwitchTarget === "production" ? "Production" : "Staging"}?
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-1">
              {envSwitchTarget === "production"
                ? "You are about to connect to the live production server. All dashboard data will reload from brainstormserver.nosfabrica.com. Actions taken here affect real users and data."
                : "You are about to connect to the staging server. All dashboard data will reload from brainstormserver-staging.nosfabrica.com."
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
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEnvSwitchTarget(null)}
              className="text-xs"
              data-testid="button-env-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmEnvSwitch}
              className={`text-xs gap-1.5 ${
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
