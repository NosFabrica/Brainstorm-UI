import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { AppHeader } from "@/components/AppHeader";
import { useLocation } from "wouter";
import { env } from "@/lib/runtimeEnv";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { NostrHealthCard } from "@/components/admin/NostrHealthCard";
import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { SchedulingCard } from "@/components/admin/scheduling/SchedulingCard";
import { SchedulingStatsPanel } from "@/components/admin/scheduling/SchedulingStatsPanel";
import { AdminSupportCards } from "@/components/admin/support/AdminSupportCards";
import { ADMIN_SUPPORT_QUERY_KEY, adminListTickets } from "@/services/support";
import { unreadCount } from "@/lib/supportSeen";
import { AdminBillingCards } from "@/components/admin/billing/AdminBillingCards";
import { PlanMappingsCard } from "@/components/admin/billing/PlanMappingsCard";
import { UserTierPicker } from "@/components/admin/scheduling/UserTierPicker";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import type { SchedulingItem } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search,
  Users,
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
  FileText,
  UserCheck,
  Copy,
  Globe,
  RefreshCw,
  Hash,
  Eye,
  Play,
  Loader2,
  UserPlus,
  Calendar,
  ArrowRight,
  User,
  Square,
  CheckSquare,
  MinusSquare,
  Minus,
  Maximize2,
  Sparkles,
  CalendarClock,
  LifeBuoy,
  Receipt,
  ListChecks,
} from "lucide-react";
import { parseAdminTab, type AdminTab } from "./adminTabs";
import { TrustedListsCard } from "@/components/admin/trusted-lists/TrustedListsCard";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RcTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FEATURES } from "@/config/featureFlags";
import { fetchProfile, searchNostrProfiles, type NostrSearchResult } from "@/services/nostr";
import { PROFILE_RELAYS } from "@/lib/relays";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { useActiveAccount } from "applesauce-react/hooks";
import { hasSession } from "@/accounts/session";
import type { BrainstormAccount } from "@/accounts/metadata";
import { searchByText } from "@/lib/profileSearch";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

type SortDir = "asc" | "desc";
type PageSizeOption = 25 | 50 | 100;
type ActivityTimeRange = "1h" | "24h" | "7d" | "all";

function formatTimestamp(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
    if (isNaN(d.getTime())) return dateStr;
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return dateStr;
  }
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

function LiveBadge({
  updatedAt,
  boosting,
  isFetching,
}: {
  updatedAt: number;
  boosting: boolean;
  isFetching?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const label = formatRelativeAge(updatedAt, now);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
        boosting
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
      }`}
      title={boosting ? "Refreshing more frequently after a recent trigger" : "Auto-refresh enabled"}
      data-testid="badge-live-updated"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isFetching || boosting ? "animate-ping" : ""} ${boosting ? "bg-amber-400" : "bg-emerald-400"}`}
        />
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${boosting ? "bg-amber-500" : "bg-emerald-500"}`}
        />
      </span>
      <span className="text-[10px] font-medium normal-case tracking-normal">
        {boosting ? "Boosted • " : "Live • "}
        {label}
      </span>
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
  scheduling_id: number | null;
  scheduling_name: string;
}

interface AdminUsersPage {
  items: AdminUserListItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

interface GrapeRankError {
  code: string;
  message: string | null;
}

interface BrainstormRequestInstance {
  created_at: string;
  updated_at: string;
  private_id: number;
  status: string;
  ta_status: string | null;
  internal_publication_status: string | null;
  error: GrapeRankError | null;
  count_values: string | null;
  password: string;
  algorithm: string;
  parameters: string;
  how_many_others_with_priority: number;
  pubkey: string | null;
  trigger_source: string | null;
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
const NONE: never[] = [];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
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
  } catch {
    return "";
  }
}

function getUserHealth(
  status: string | null,
  taStatus: string | null,
  timesCalc: number,
): "green" | "amber" | "red" | "gray" {
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
    connected: { tone: "emerald" as const, label: "Connected" },
    degraded: { tone: "amber" as const, label: "Degraded" },
    disconnected: { tone: "red" as const, label: "Not Connected" },
  }[status];

  return (
    <Chip
      tone={config.tone}
      size="sm"
      dot
      className="font-semibold uppercase tracking-wider"
      data-testid={`badge-status-${status}`}
    >
      {config.label}
    </Chip>
  );
}

type HourlyBucket = { t: number; success: number; failed: number; total: number };

type TrendWindow = "1h" | "24h" | "7d" | "all";

type WindowConfig = {
  windowMs: number;
  bucketCount: number;
  bucketSizeMs: number;
  shortLabel: string;
  windowPhrase: string;
  longLabel: string;
  priorLabel: string;
  bucketLabelFn: (ts: number) => string;
  bucketTooltipFn: (ts: number) => string;
  xAxisInterval: number;
  bucketUnitLabel: string;
};

function getWindowConfig(w: TrendWindow): WindowConfig {
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  switch (w) {
    case "1h":
      return {
        windowMs: HOUR,
        bucketCount: 12,
        bucketSizeMs: 5 * 60000,
        shortLabel: "1h",
        windowPhrase: "the last hour",
        longLabel: "Last hour",
        priorLabel: "vs prior 1h",
        bucketLabelFn: (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        xAxisInterval: 1,
        bucketUnitLabel: "calcs / 5min",
      };
    case "24h":
      return {
        windowMs: 24 * HOUR,
        bucketCount: 24,
        bucketSizeMs: HOUR,
        shortLabel: "24h",
        windowPhrase: "the last 24h",
        longLabel: "Last 24 hours",
        priorLabel: "vs prior 24h",
        bucketLabelFn: (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        xAxisInterval: 3,
        bucketUnitLabel: "calcs / hr",
      };
    case "7d":
      return {
        windowMs: 7 * DAY,
        bucketCount: 7,
        bucketSizeMs: DAY,
        shortLabel: "7d",
        windowPhrase: "the last 7d",
        longLabel: "Last 7 days",
        priorLabel: "vs prior 7d",
        bucketLabelFn: (ts) => new Date(ts).toLocaleDateString([], { weekday: "short" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        xAxisInterval: 0,
        bucketUnitLabel: "calcs / day",
      };
    case "all":
      return {
        windowMs: Number.POSITIVE_INFINITY,
        bucketCount: 12,
        bucketSizeMs: DAY, // overridden dynamically from the loaded-data span
        shortLabel: "All",
        windowPhrase: "all loaded",
        longLabel: "All loaded activity",
        priorLabel: "vs prior period",
        bucketLabelFn: (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        xAxisInterval: 2,
        bucketUnitLabel: "calcs",
      };
  }
}

function parseActivityTs(s: string | undefined | null): number {
  if (!s) return 0;
  try {
    const d = new Date(s.endsWith("Z") ? s : s + "Z");
    const t = d.getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

function bucketActivity(
  activity: { updated_at: string; status?: string | null }[],
  bucketCount: number,
  bucketSizeMs: number,
  now: number,
): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    t: now - (bucketCount - 1 - i) * bucketSizeMs,
    success: 0,
    failed: 0,
    total: 0,
  }));
  for (const a of activity) {
    const t = parseActivityTs(a.updated_at);
    if (!t) continue;
    const ageBuckets = Math.floor((now - t) / bucketSizeMs);
    if (ageBuckets < 0 || ageBuckets >= bucketCount) continue;
    const idx = bucketCount - 1 - ageBuckets;
    buckets[idx].total++;
    const s = (a.status || "").toLowerCase();
    if (s === "success") buckets[idx].success++;
    else if (s === "failed" || s === "failure") buckets[idx].failed++;
  }
  return buckets;
}

function compareActivityWindows(
  activity: { updated_at: string; status?: string | null }[],
  windowMs: number,
  now: number,
) {
  const cur: typeof activity = [];
  const prev: typeof activity = [];
  for (const a of activity) {
    const t = parseActivityTs(a.updated_at);
    if (!t) continue;
    const age = now - t;
    if (age < 0) continue;
    if (age < windowMs) cur.push(a);
    else if (age < windowMs * 2) prev.push(a);
  }
  const countStatus = (arr: typeof activity, want: string[]) =>
    arr.filter((a) => want.includes((a.status || "").toLowerCase())).length;
  const sr = (arr: typeof activity): number | null => {
    const s = countStatus(arr, ["success"]);
    const f = countStatus(arr, ["failed", "failure"]);
    return s + f === 0 ? null : Math.round((s / (s + f)) * 100);
  };
  return {
    curTotal: cur.length,
    prevTotal: prev.length,
    curFailed: countStatus(cur, ["failed", "failure"]),
    prevFailed: countStatus(prev, ["failed", "failure"]),
    curSuccess: countStatus(cur, ["success"]),
    prevSuccess: countStatus(prev, ["success"]),
    curSR: sr(cur),
    prevSR: sr(prev),
    hasPrev: prev.length > 0,
  };
}

function MiniSparkline({
  data,
  timestamps,
  color = "#13d2e5",
  height = 22,
  width = 64,
  className,
  valueSuffix = "",
  valueLabel = "value",
}: {
  data: number[];
  timestamps?: number[];
  color?: string;
  height?: number;
  width?: number;
  className?: string;
  valueSuffix?: string;
  valueLabel?: string;
}) {
  if (!data || data.length < 2) {
    return (
      <div
        className={`inline-flex items-center justify-center text-[8px] text-slate-300 dark:text-slate-600 ${className ?? ""}`}
        style={{ height, width }}
        title="No trend data available yet"
        data-testid="mini-sparkline-empty"
      >
        <svg width={width - 4} height={4} viewBox={`0 0 ${width - 4} 4`} aria-hidden="true">
          <line x1="0" y1="2" x2={width - 4} y2="2" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      </div>
    );
  }
  const chartData = data.map((v, i) => ({
    i,
    v,
    ts: timestamps?.[i],
  }));
  return (
    <div style={{ width, height }} className={`inline-block ${className ?? ""}`} data-testid="mini-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <RcTooltip
            cursor={{ stroke: color, strokeOpacity: 0.3, strokeWidth: 1 }}
            contentStyle={{
              fontSize: 10,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              padding: "4px 6px",
              lineHeight: 1.3,
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
              whiteSpace: "nowrap",
            }}
            wrapperStyle={{ outline: "none", zIndex: 9999, pointerEvents: "none" }}
            allowEscapeViewBox={{ x: true, y: true }}
            offset={12}
            labelFormatter={(_, items) => {
              const ts = items?.[0]?.payload?.ts as number | undefined;
              return ts
                ? new Date(ts).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
            }}
            formatter={(val: number | string) => [`${val}${valueSuffix}`, valueLabel]}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2.5, fill: color }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SparklineDetailsDialog({
  open,
  onOpenChange,
  label,
  data,
  timestamps,
  color = "#13d2e5",
  valueLabel = "value",
  valueSuffix = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  data: number[];
  timestamps?: number[];
  color?: string;
  valueLabel?: string;
  valueSuffix?: string;
}) {
  const chartData = (data ?? []).map((v, i) => ({ i, v, ts: timestamps?.[i] }));
  const formatTs = (ts: number | undefined) =>
    ts ? new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const rows = [...chartData].reverse();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-sparkline-details">
        <DialogHeader>
          <DialogTitle data-testid="text-sparkline-title">{label} trend</DialogTitle>
          <DialogDescription>Per-bucket values and timestamps from the recent trend.</DialogDescription>
        </DialogHeader>
        {chartData.length >= 2 ? (
          <>
            <div className="h-40 w-full" data-testid="chart-sparkline-details">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <RcTooltip
                    cursor={{ stroke: color, strokeOpacity: 0.3, strokeWidth: 1 }}
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 6,
                      border: "1px solid #e2e8f0",
                      padding: "4px 6px",
                      lineHeight: 1.3,
                    }}
                    labelFormatter={(_, items) => formatTs(items?.[0]?.payload?.ts as number | undefined)}
                    formatter={(val: number | string) => [`${val}${valueSuffix}`, valueLabel]}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    strokeWidth={1.5}
                    dot={{ r: 2, fill: color }}
                    activeDot={{ r: 3.5, fill: color }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Time</th>
                    <th className="px-2 py-1.5 text-right font-medium capitalize">{valueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-slate-100 dark:border-slate-800/60"
                      data-testid={`row-sparkline-bucket-${idx}`}
                    >
                      <td className="px-2 py-1 text-slate-600 dark:text-slate-300">{formatTs(r.ts)}</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {r.v}
                        {valueSuffix}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="text-sparkline-empty">
            No trend data available yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeltaIndicator({
  delta,
  suffix = "",
  inverted = false,
  label = "vs 24h ago",
  insufficient,
  insufficientLabel,
}: {
  delta: number | null;
  suffix?: string;
  inverted?: boolean;
  label?: string;
  insufficient?: boolean;
  insufficientLabel?: string;
}) {
  if (insufficient || delta === null || delta === undefined || Number.isNaN(delta)) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500"
        title={insufficientLabel ?? "Not enough historical data yet to compute a trend"}
      >
        <Minus className="h-3 w-3" /> {insufficientLabel ?? "—"}
      </span>
    );
  }
  const flat = delta === 0;
  const goodWhenUp = !inverted;
  const isGood = flat ? false : delta > 0 ? goodWhenUp : !goodWhenUp;
  const colorCls = flat ? "text-slate-400 dark:text-slate-500" : isGood ? "text-emerald-600" : "text-red-500";
  const Icon = flat ? Minus : delta > 0 ? ChevronUp : ChevronDown;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold ${colorCls}`}>
      <Icon className="h-3 w-3" />
      {sign}
      {delta}
      {suffix} <span className="ml-0.5 font-normal text-slate-400 dark:text-slate-500">{label}</span>
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  subtitle,
  unsupported,
  tooltip,
  scope,
  onClick,
  sparklineData,
  sparklineTimestamps,
  sparklineColor,
  sparklineValueLabel,
  sparklineValueSuffix,
  deltaSlot,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: string; up: boolean };
  subtitle?: string;
  unsupported?: boolean;
  tooltip?: string;
  scope?: "system" | "graph";
  onClick?: () => void;
  sparklineData?: number[];
  sparklineTimestamps?: number[];
  sparklineColor?: string;
  sparklineValueLabel?: string;
  sparklineValueSuffix?: string;
  deltaSlot?: React.ReactNode;
}) {
  const [trendOpen, setTrendOpen] = useState(false);
  const hasSparkline = !unsupported && Array.isArray(sparklineData) && sparklineData.length >= 2;
  const testIdSlug = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <>
      <div
        className={`group relative z-0 flex min-h-[120px] flex-col rounded-xl border border-border bg-card px-3 py-3 text-card-foreground shadow-sm transition-all duration-300 hover:z-30 hover:-translate-y-0.5 hover:border-brand-accent/40 hover:shadow-[0_12px_24px_-8px_rgb(var(--brand-accent)/0.2)] dark:shadow-none ${onClick ? "cursor-pointer" : ""}`}
        data-testid={`kpi-${testIdSlug}`}
        title={tooltip}
        onClick={onClick}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-brand-accent/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        </div>
        <div className="relative mb-2 flex items-start justify-between">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-accent/15 bg-gradient-to-br from-brand-accent/10 to-brand-deep/10">
            <Icon className="h-4 w-4 text-brand-deep" />
          </div>
          {scope && (
            <Chip
              tone={scope === "system" ? "brand" : "slate"}
              size="sm"
              className="font-bold uppercase tracking-wider"
            >
              {scope === "system" ? "System" : "Your graph"}
            </Chip>
          )}
          {trend && !scope && (
            <span
              className={`flex items-center gap-0.5 text-[10px] font-semibold ${trend.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
            >
              {trend.up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {trend.value}
            </span>
          )}
        </div>
        <div className="relative flex items-end justify-between gap-2">
          <p
            className={`text-xl font-bold tracking-tight ${unsupported ? "text-slate-300 dark:text-slate-600" : "text-slate-900 dark:text-slate-100"}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {value}
          </p>
          {!unsupported && hasSparkline && (
            <div className="flex items-center gap-1">
              <MiniSparkline
                data={sparklineData ?? []}
                timestamps={sparklineTimestamps}
                color={sparklineColor ?? "#13d2e5"}
                height={22}
                width={64}
                valueLabel={sparklineValueLabel ?? "value"}
                valueSuffix={sparklineValueSuffix ?? ""}
              />
              {hasSparkline && (
                <button
                  type="button"
                  aria-label={`View ${label} trend details`}
                  title="View trend details"
                  className="touch-manipulation rounded-md p-1 text-slate-400 transition-colors hover:bg-brand-accent/10 hover:text-brand-deep active:bg-brand-accent/20 dark:text-slate-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTrendOpen(true);
                  }}
                  data-testid={`button-sparkline-expand-${testIdSlug}`}
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <p className="relative mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</p>
        {subtitle && <p className="relative mt-0.5 text-[9px] text-slate-400 dark:text-slate-500">{subtitle}</p>}
        {deltaSlot && (
          <div className="relative mt-1" data-testid={`kpi-delta-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            {deltaSlot}
          </div>
        )}
        <div className="relative mt-auto pt-1.5">
          {unsupported ? <StatusBadge status="disconnected" /> : <StatusBadge status="connected" />}
        </div>
      </div>
      {hasSparkline && (
        <SparklineDetailsDialog
          open={trendOpen}
          onOpenChange={setTrendOpen}
          label={label}
          data={sparklineData ?? []}
          timestamps={sparklineTimestamps}
          color={sparklineColor}
          valueLabel={sparklineValueLabel}
          valueSuffix={sparklineValueSuffix}
        />
      )}
    </>
  );
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  onSort,
}: {
  label: string;
  sortKey: AdminSortKey;
  currentSort: SortState;
  onSort: (key: AdminSortKey) => void;
}) {
  const active = currentSort.key === sortKey;
  return (
    <button
      className="flex items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      {active ? (
        currentSort.dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
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
      className="rounded p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(text);
        toast({ title: "Copied", description: text.slice(0, 20) + "...", duration: 1500 });
      }}
      data-testid="button-copy-npub"
    >
      <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300" />
    </button>
  );
}

type FailureStage = "calculation" | "ta" | "publication";

const FAILURE_STAGE_HINTS: Record<FailureStage, { label: string; hint: string }> = {
  calculation: {
    label: "Calculation",
    hint: "Common causes: user has too few trusted follows for graperank to converge, invalid algorithm parameters, or a calculation timeout. Re-trigger first; if it fails again, check server logs for the algorithm worker.",
  },
  ta: {
    label: "Trust Attestation",
    hint: "Common causes: TA pubkey unreachable or not configured. Check relay status and TA service health.",
  },
  publication: {
    label: "Publication",
    hint: "Common causes: relay outage, signing failure, or rate limiting. Check that the publisher is reaching at least one configured relay.",
  },
};

function pickFailureStage(opts: { statusFailed: boolean; taFailed: boolean; pubFailed: boolean }): FailureStage | null {
  if (opts.statusFailed) return "calculation";
  if (opts.taFailed) return "ta";
  if (opts.pubFailed) return "publication";
  return null;
}

function parseIsoMs(iso: string): number {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
}

/**
 * Groups the activity feed's failed requests by stage + normalized error
 * message so an admin can see *why* things are failing, expand a pattern to see
 * every affected user, and re-run the whole group in one click.
 */
function FailureBreakdownCard({
  items,
  isLoading,
  isError,
  errorMessage,
  onViewUser,
}: {
  items: BrainstormRequestInstance[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onViewUser: (pubkey: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const totalFailures = useMemo(() => items.filter(isItemFailed).length, [items]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; stage: string; latest: BrainstormRequestInstance; count: number; users: Map<string, number> }
    >();
    for (const item of items) {
      if (!isItemFailed(item)) continue;
      const stage = getFailureStage(item) ?? "Pipeline";
      const key = normalizeErrorKey(extractErrorMessage(item)) + "|" + stage;
      const t = parseIsoMs(item.updated_at);
      const g = map.get(key);
      if (g) {
        g.count += 1;
        if (t > parseIsoMs(g.latest.updated_at)) g.latest = item;
        if (item.pubkey) g.users.set(item.pubkey, Math.max(t, g.users.get(item.pubkey) ?? 0));
      } else {
        const users = new Map<string, number>();
        if (item.pubkey) users.set(item.pubkey, t);
        map.set(key, { key, stage, latest: item, count: 1, users });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => parseIsoMs(b.latest.updated_at) - parseIsoMs(a.latest.updated_at) || b.count - a.count,
    );
  }, [items]);

  async function retryGroup(key: string, pubkeys: string[]) {
    if (!pubkeys.length) return;
    setRetrying(key);
    let ok = 0;
    let failed = 0;
    for (const pk of pubkeys) {
      try {
        await apiClient.triggerUserGraperank(pk);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
    ]);
    toast({
      title: `Re-triggered ${ok} user${ok === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`,
      variant: failed ? "destructive" : undefined,
    });
    setRetrying(null);
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-red-200/70 bg-card text-card-foreground shadow-sm dark:border-red-500/25 dark:shadow-none"
      data-testid="card-failure-breakdown"
    >
      <div className="flex items-start justify-between gap-3 border-b border-red-100 px-5 py-4 dark:border-red-500/20">
        <div>
          <h3
            className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <AlertTriangle className="h-4 w-4 text-red-500" /> Failure Breakdown
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {totalFailures === 0
              ? "No failures in the current activity feed."
              : `${totalFailures} failed request${totalFailures === 1 ? "" : "s"} across ${groups.length} pattern${groups.length === 1 ? "" : "s"} — expand one to see who's affected and re-run them.`}
          </p>
        </div>
        <Chip tone={totalFailures === 0 ? "emerald" : "red"} className="px-2 py-1 font-bold tabular-nums">
          {totalFailures}
        </Chip>
      </div>
      <div className="p-5">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <XCircle className="mb-2 h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Couldn't load failure data</p>
            <p className="mt-1 max-w-md text-[10px] text-slate-500 dark:text-slate-400">
              {errorMessage || "The /admin/activity endpoint did not respond."}
            </p>
          </div>
        ) : isLoading && totalFailures === 0 ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
          </div>
        ) : totalFailures === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No failures right now</p>
            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Every recent request has succeeded.</p>
          </div>
        ) : (
          <ul className="space-y-2.5" data-testid="list-failure-breakdown">
            {groups.map((g) => {
              const errMsg = extractErrorMessage(g.latest);
              const users = Array.from(g.users.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([pk]) => pk);
              const isOpen = expanded === g.key;
              const isRetrying = retrying === g.key;
              return (
                <li
                  key={g.key}
                  className="rounded-lg border border-red-200 bg-white/70 p-3 dark:border-red-500/25 dark:bg-slate-900/70"
                  data-testid="failure-breakdown-group"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                          {g.stage}
                        </span>
                        <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300">
                          {g.count}×
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400">
                          {users.length} user{users.length === 1 ? "" : "s"} affected
                        </span>
                        <span className="ml-auto text-[9px] text-slate-400 dark:text-slate-500">
                          {timeAgo(g.latest.updated_at) || formatTimestamp(g.latest.updated_at)}
                        </span>
                      </div>
                      <p className="break-words font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
                        {truncateError(errMsg, 220)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {users.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : g.key)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                            data-testid="failure-breakdown-toggle-users"
                          >
                            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />{" "}
                            {isOpen ? "Hide" : "Show"} affected users
                          </button>
                        )}
                        {users.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 gap-1 border-red-200 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-500/25 dark:text-red-300 dark:hover:bg-red-500/10"
                            disabled={isRetrying}
                            onClick={() => retryGroup(g.key, users)}
                            data-testid="failure-breakdown-retry-all"
                          >
                            {isRetrying ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}{" "}
                            Retry all {users.length}
                          </Button>
                        )}
                      </div>
                      {isOpen && (
                        <ul className="mt-2 max-h-52 space-y-1 overflow-auto rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-800/60 dark:bg-slate-900">
                          {users.slice(0, 100).map((pk) => (
                            <li key={pk} className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onViewUser(pk)}
                                className="truncate font-mono text-[10px] text-brand-deep hover:text-brand-accent"
                                title={pk}
                              >
                                {pk.slice(0, 16)}…{pk.slice(-6)}
                              </button>
                              <button
                                type="button"
                                onClick={() => onViewUser(pk)}
                                className="inline-flex shrink-0 items-center gap-1 text-[9px] text-slate-400 hover:text-brand-deep dark:text-slate-500"
                              >
                                <Eye className="h-3 w-3" /> view
                              </button>
                            </li>
                          ))}
                          {users.length > 100 && (
                            <li className="px-1 text-[9px] text-slate-400 dark:text-slate-500">
                              + {users.length - 100} more
                            </li>
                          )}
                        </ul>
                      )}
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
}

function UserHistoryRow({
  pubkey,
  npub,
  taPubkey,
  schedulingName,
}: {
  pubkey: string;
  npub: string;
  taPubkey: string | null;
  schedulingName?: string;
}) {
  const historyQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/users", pubkey, "history", 10],
    queryFn: () => apiClient.getAdminUserHistory(pubkey, { page: 1, size: 10 }),
    staleTime: 30_000,
  });

  return (
    <tr
      className="bg-gradient-to-r from-slate-50/80 to-brand-primary/10 dark:bg-slate-900/40 dark:bg-none"
      data-testid={`row-user-detail-${pubkey.slice(0, 8)}`}
    >
      <td colSpan={12} className="px-5 py-4">
        <div className="space-y-4 text-[10px]">
          <div>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Identity
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <p className="mb-0.5 text-[8px] uppercase text-slate-400 dark:text-slate-500">Full Pubkey</p>
                <div className="flex min-w-0 items-center gap-1">
                  <p className="truncate font-mono text-[9px] text-slate-700 dark:text-slate-200">{pubkey}</p>
                  <CopyButton text={pubkey} />
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                <p className="mb-0.5 text-[8px] uppercase text-slate-400 dark:text-slate-500">Nostr npub</p>
                <div className="flex min-w-0 items-center gap-1">
                  <p className="truncate font-mono text-[9px] text-brand-primary dark:text-brand-link">{npub}</p>
                  <CopyButton text={npub} />
                </div>
              </div>
              {taPubkey && (
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
                  <p className="mb-0.5 text-[8px] uppercase text-slate-400 dark:text-slate-500">TA Pubkey</p>
                  <div className="flex min-w-0 items-center gap-1">
                    <p className="truncate font-mono text-[9px] text-emerald-600 dark:text-emerald-400">{taPubkey}</p>
                    <CopyButton text={taPubkey} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-brand-primary/15 bg-white p-4 shadow-sm dark:border-brand-primary/25 dark:bg-slate-900 dark:shadow-none">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-deep" />
                <p
                  className="text-xs font-bold text-slate-800 dark:text-slate-200"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Calculation History
                </p>
                {schedulingName && (
                  <Chip
                    tone="violet"
                    size="sm"
                    title="This user's current scheduling tier — how often scheduled runs recalculate them"
                  >
                    {schedulingName} schedule
                  </Chip>
                )}
              </div>
              {historyQuery.data && historyQuery.data.total > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {historyQuery.data.total} records
                </span>
              )}
            </div>
            {historyQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : historyQuery.isError ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10">
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                <p className="text-xs text-red-600 dark:text-red-400">Failed to load calculation history</p>
              </div>
            ) : historyQuery.data && historyQuery.data.items.length > 0 ? (
              <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b-2 border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Date
                      </th>
                      <th
                        className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                        title="What triggered this run"
                      >
                        Source
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Status
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Algorithm
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        TA Status
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Publication
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Queue
                      </th>
                      <th
                        className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                        title="Time from request to finished"
                      >
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <TooltipProvider delayDuration={150}>
                      {historyQuery.data.items.map((item, idx) => {
                        const statusLower = item.status.toLowerCase();
                        const taLower = item.ta_status?.toLowerCase() ?? "";
                        const pubLower = item.internal_publication_status?.toLowerCase() ?? "";
                        const statusFailed = statusLower === "failure";
                        const taFailed = taLower === "failure";
                        const pubFailed = pubLower === "failure" || pubLower === "failed";
                        const hasFail = statusFailed || taFailed || pubFailed;
                        const errorText = item.error?.message?.trim() || "";
                        const tooltipText = errorText || "No error details captured.";
                        const rowKey = item.private_id ?? idx;
                        return (
                          <Fragment key={rowKey}>
                            <tr
                              className={`border-b ${hasFail ? "border-red-200 bg-red-50/20 dark:border-red-500/25 dark:bg-red-500/10" : idx % 2 === 0 ? "border-slate-100 bg-white dark:border-slate-800/60 dark:bg-slate-900" : "border-slate-100 bg-slate-50/40 dark:border-slate-800/60 dark:bg-slate-900/40"} transition-colors hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10`}
                            >
                              <td className="whitespace-nowrap px-3 py-2.5">
                                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                                  {formatTimestamp(item.created_at)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <TriggerSourceBadge value={item.trigger_source} />
                              </td>
                              <td className="px-3 py-2.5">
                                {statusFailed ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="inline-flex cursor-help items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                        data-testid={`tooltip-history-error-status-${rowKey}`}
                                      >
                                        {item.status}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      align="center"
                                      className="max-w-[320px] break-words bg-slate-950 font-mono text-xs text-slate-100"
                                    >
                                      {tooltipText}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                      statusLower === "success"
                                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                        : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                    }`}
                                  >
                                    {item.status}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-mono text-[11px] font-semibold text-brand-deep">
                                  {item.algorithm}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                {item.ta_status ? (
                                  taFailed ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="inline-flex cursor-help items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                          data-testid={`tooltip-history-error-ta-${rowKey}`}
                                        >
                                          {item.ta_status}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        align="center"
                                        className="max-w-[320px] break-words bg-slate-950 font-mono text-xs text-slate-100"
                                      >
                                        {tooltipText}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                        taLower === "success"
                                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                          : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                      }`}
                                    >
                                      {item.ta_status}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {item.internal_publication_status ? (
                                  pubFailed ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span
                                          className="inline-flex cursor-help items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-bold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                          data-testid={`tooltip-history-error-pub-${rowKey}`}
                                        >
                                          {item.internal_publication_status}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        align="center"
                                        className="max-w-[320px] break-words bg-slate-950 font-mono text-xs text-slate-100"
                                      >
                                        {tooltipText}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                        pubLower === "success" || pubLower === "published"
                                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                          : pubLower === "pending" || pubLower === "in_progress"
                                            ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                                            : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                      }`}
                                    >
                                      {item.internal_publication_status}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
                                  {item.how_many_others_with_priority > 0 ? item.how_many_others_with_priority : "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                                  {formatLatencyMs(item.created_at, item.updated_at) ?? "—"}
                                </span>
                              </td>
                            </tr>
                            {hasFail &&
                              (() => {
                                const stage = pickFailureStage({ statusFailed, taFailed, pubFailed });
                                const stageInfo = stage ? FAILURE_STAGE_HINTS[stage] : null;
                                return (
                                  <tr
                                    className="border-b border-red-200 bg-red-50/60 dark:border-red-500/25 dark:bg-red-500/10"
                                    data-testid={`row-history-error-${rowKey}`}
                                  >
                                    <td colSpan={8} className="px-4 py-2">
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                        <div className="flex-1 space-y-1">
                                          {errorText ? (
                                            <span className="block break-all font-mono text-[11px] text-red-700 dark:text-red-300">
                                              {errorText}
                                            </span>
                                          ) : (
                                            <span className="block text-[11px] italic text-red-600/80 dark:text-red-400/80">
                                              No error details captured — check server logs.
                                            </span>
                                          )}
                                          {stageInfo && (
                                            <p
                                              className="text-[11px] leading-snug text-slate-600 dark:text-slate-300"
                                              data-testid={`text-failure-hint-${rowKey}`}
                                            >
                                              <span className="font-semibold">Where to look · {stageInfo.label}:</span>{" "}
                                              {stageInfo.hint}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })()}
                          </Fragment>
                        );
                      })}
                    </TooltipProvider>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800/60 dark:bg-slate-900">
                <Clock className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400 dark:text-slate-500">No calculation history available</p>
              </div>
            )}
          </div>

          <NostrHealthCard pubkey={pubkey} taPubkey={taPubkey} />
        </div>
      </td>
    </tr>
  );
}

function ActivityStatusBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const colors =
    lower === "success" || lower === "done" || lower === "published"
      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/25"
      : lower === "failure" || lower === "failed" || lower === "error"
        ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/25"
        : lower === "pending" || lower === "queued" || lower === "in_progress"
          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
          : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${colors}`}
      data-testid="badge-activity-status"
    >
      {value}
    </span>
  );
}

// Origin of a run: why it was queued (manual = user asked, scheduled = tier
// auto-scheduler, admin = admin action, periodic = cron). Colored distinctly
// from the status badges so origin reads at a glance.
function TriggerSourceBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const colors =
    lower === "scheduled"
      ? "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/20 dark:border-brand-primary/25"
      : lower === "periodic"
        ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/25"
        : lower === "admin"
          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
          : lower === "manual"
            ? "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
            : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${colors}`}
      data-testid="badge-trigger-source"
    >
      {value}
    </span>
  );
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
  return (
    isFailedStatus(item.status) || isFailedStatus(item.ta_status) || isFailedStatus(item.internal_publication_status)
  );
}

function getFailureStage(item: BrainstormRequestInstance): "Calculation" | "Trust Attestation" | "Publication" | null {
  if (isFailedStatus(item.status)) return "Calculation";
  if (isFailedStatus(item.ta_status)) return "Trust Attestation";
  if (isFailedStatus(item.internal_publication_status)) return "Publication";
  return null;
}

function extractErrorMessage(item: BrainstormRequestInstance): string {
  const raw = item.error?.message?.trim();
  if (raw) return raw;
  const stage = getFailureStage(item);
  if (stage)
    return `No error details recorded for the ${stage} stage. Re-trigger this user to capture a fresh error message, or open the full request to inspect server logs.`;
  return "No error details recorded. Re-trigger this user to capture a fresh error message, or open the full request to inspect server logs.";
}

function truncateError(text: string, maxLen = 140): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "…";
}

/** Human latency between a request's start and finish ISO timestamps. */
function formatLatencyMs(startIso: string, endIso: string): string | null {
  const parse = (s: string) => new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  const start = parse(startIso);
  const end = parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const ms = end - start;
  if (ms < 0) return null;
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
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
      className={`inline-flex items-center gap-1 text-[10px] font-semibold transition-colors ${
        state === "confirming"
          ? "animate-pulse text-amber-700 dark:text-amber-300"
          : state === "done"
            ? "text-emerald-700 dark:text-emerald-300"
            : state === "error"
              ? "text-red-700 dark:text-red-300"
              : state === "running"
                ? "text-slate-400 dark:text-slate-500"
                : "text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-200"
      } ${className}`}
      data-testid={testId}
    >
      {state === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === "confirming" ? (
        <>
          <RefreshCw className="h-3 w-3" />
          <span>Confirm re-trigger?</span>
        </>
      ) : state === "done" ? (
        <>
          <CheckCircle2 className="h-3 w-3" />
          <span>Re-triggered</span>
        </>
      ) : state === "error" ? (
        <>
          <XCircle className="h-3 w-3" />
          <span>Failed</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3" />
          <span>Re-trigger</span>
        </>
      )}
    </button>
  );
}

function FailureDetailCard({
  item,
  onRetrigger,
  retriggerState,
  isInPipeline,
  onViewDetail,
  onNavigateToUser,
}: {
  item: BrainstormRequestInstance;
  onRetrigger?: (e: React.MouseEvent) => void;
  retriggerState?: "idle" | "confirming" | "running" | "done" | "error";
  isInPipeline?: boolean;
  onViewDetail?: (e: React.MouseEvent) => void;
  onNavigateToUser?: (pubkey: string) => void;
}) {
  const stage = getFailureStage(item) ?? "Pipeline";
  const errorText = extractErrorMessage(item);
  const fmtFull = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d.endsWith("Z") ? d : d + "Z").toLocaleString();
    } catch {
      return d;
    }
  };
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-500/25 dark:bg-red-500/10"
      data-testid={`failure-detail-${item.private_id ?? "x"}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
              Failed at {stage}
            </span>
            <span className="text-[10px] text-red-600/80 dark:text-red-400/80">Request #{item.private_id}</span>
          </div>
          <p
            className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-red-900 dark:text-red-300"
            data-testid={`failure-message-${item.private_id ?? "x"}`}
          >
            {errorText}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-red-700/80 dark:text-red-300/80">
            <span>
              Algorithm: <span className="font-mono">{item.algorithm || "—"}</span>
            </span>
            <span>Created: {fmtFull(item.created_at)}</span>
            <span>Updated: {fmtFull(item.updated_at)}</span>
            {item.how_many_others_with_priority > 0 && <span>Queue depth: {item.how_many_others_with_priority}</span>}
          </div>
          {item.pubkey && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">User:</span>
              {onNavigateToUser ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToUser(item.pubkey!);
                  }}
                  className="break-all text-left font-mono text-brand-deep hover:text-brand-accent hover:underline"
                  data-testid={`failure-pubkey-link-${item.private_id ?? "x"}`}
                >
                  {item.pubkey}
                </button>
              ) : (
                <span className="break-all font-mono text-slate-700 dark:text-slate-200">{item.pubkey}</span>
              )}
              <CopyButton text={item.pubkey} />
            </div>
          )}
          {item.parameters && (
            <div className="mt-2 text-[10px]">
              <span className="mb-0.5 block font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">
                Parameters
              </span>
              <p
                className="whitespace-pre-wrap break-all rounded border border-red-100 bg-white/70 px-2 py-1.5 font-mono text-slate-700 dark:border-red-500/20 dark:bg-slate-900/70 dark:text-slate-200"
                data-testid={`failure-parameters-${item.private_id ?? "x"}`}
              >
                {item.parameters}
              </p>
            </div>
          )}
          {item.count_values && (
            <div className="mt-2 text-[10px]">
              <span className="mb-0.5 block font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">
                Count Values
              </span>
              <p className="break-all rounded border border-red-100 bg-white/70 px-2 py-1.5 font-mono text-slate-700 dark:border-red-500/20 dark:bg-slate-900/70 dark:text-slate-200">
                {item.count_values}
              </p>
            </div>
          )}
          {(onRetrigger || onViewDetail) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {onRetrigger && item.pubkey && (
                <button
                  onClick={onRetrigger}
                  disabled={retriggerState === "running" || isInPipeline}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-all ${
                    isInPipeline
                      ? "cursor-not-allowed border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                      : retriggerState === "confirming"
                        ? "animate-pulse border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        : retriggerState === "done"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : retriggerState === "error"
                            ? "border-red-300 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
                            : retriggerState === "running"
                              ? "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                              : "border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/15"
                  }`}
                  data-testid={`failure-retrigger-${item.private_id}`}
                >
                  {retriggerState === "running" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : retriggerState === "confirming" ? (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      <span>Confirm re-trigger?</span>
                    </>
                  ) : retriggerState === "done" ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Re-triggered</span>
                    </>
                  ) : retriggerState === "error" ? (
                    <>
                      <XCircle className="h-3 w-3" />
                      <span>Re-trigger failed</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      <span>Re-trigger GrapeRank</span>
                    </>
                  )}
                </button>
              )}
              {onViewDetail && (
                <button
                  onClick={onViewDetail}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-500/25 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/10"
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
    row: "bg-blue-50/50 dark:bg-blue-500/10 border-l-[3px] border-l-blue-500 border-b border-b-blue-100/60 dark:border-b-blue-500/20",
    hover: "hover:bg-blue-100/40 dark:hover:bg-blue-500/15",
    expanded: "bg-blue-50/30 dark:bg-blue-500/5",
    expandedBorder: "border-blue-200/40 dark:border-blue-500/25",
    label: "PROCESSING",
    labelClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/50 dark:border-blue-500/30",
    dot: "bg-blue-500",
    dotPulse: "bg-blue-400",
  },
  waiting: {
    row: "bg-amber-50/40 dark:bg-amber-500/10 border-l-[3px] border-l-amber-400 border-b border-b-amber-100/50 dark:border-b-amber-500/20",
    hover: "hover:bg-amber-100/30 dark:hover:bg-amber-500/15",
    expanded: "bg-amber-50/20 dark:bg-amber-500/5",
    expandedBorder: "border-amber-200/40 dark:border-amber-500/25",
    label: "IN QUEUE",
    labelClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/50 dark:border-amber-500/30",
    dot: "bg-amber-500",
    dotPulse: "bg-amber-400",
  },
  failed: {
    row: "bg-red-50/30 dark:bg-red-500/10 border-l-[3px] border-l-red-300 border-b border-b-red-100/40 dark:border-b-red-500/20",
    hover: "hover:bg-red-50/50 dark:hover:bg-red-500/15",
    expanded: "bg-red-50/20 dark:bg-red-500/5",
    expandedBorder: "border-red-200/40 dark:border-red-500/25",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
  complete: {
    row: "border-l-[3px] border-l-transparent border-b border-b-slate-100/60 dark:border-b-slate-800/60",
    hover: "hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10",
    expanded: "bg-brand-primary/10 dark:bg-brand-primary/5",
    expandedBorder: "border-brand-primary/15 dark:border-brand-primary/25",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
};

function ActivityRow({
  item,
  idx,
  onViewDetail,
  onNavigateToUser,
  onRetrigger,
  selected,
  onToggleSelect,
  bulkStatus,
  profile,
  queuePosition,
  schedulingName,
}: {
  item: BrainstormRequestInstance;
  idx: number;
  onViewDetail: (item: BrainstormRequestInstance) => void;
  onNavigateToUser?: (pubkey: string) => void;
  onRetrigger?: (pubkey: string) => Promise<void>;
  selected?: boolean;
  onToggleSelect?: () => void;
  bulkStatus?: "queued" | "running" | "success" | "failed";
  profile?: { name?: string; picture?: string };
  queuePosition?: number | "active";
  schedulingName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [retriggerState, setRetriggerState] = useState<"idle" | "confirming" | "running" | "done" | "error">("idle");
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      if (isNaN(date.getTime())) return d;
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return d;
    }
  };
  const pipeline = getActivityPipelineState(item);
  const style = pipelineRowStyles[pipeline];
  const isInPipeline = pipeline === "active" || pipeline === "waiting";
  const isFailed = isItemFailed(item);
  const failureStage = getFailureStage(item);
  const baseRowBg =
    pipeline === "complete"
      ? idx % 2 === 0
        ? "bg-white/40 dark:bg-slate-900/40"
        : "bg-slate-50/30 dark:bg-slate-900/30"
      : "";

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

  const bulkOverlay =
    bulkStatus === "running"
      ? "ring-1 ring-amber-300 ring-inset"
      : bulkStatus === "queued"
        ? "ring-1 ring-slate-200 dark:ring-slate-800 ring-inset opacity-90"
        : bulkStatus === "success"
          ? "ring-1 ring-emerald-300 ring-inset"
          : bulkStatus === "failed"
            ? "ring-1 ring-red-300 ring-inset"
            : "";
  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${style.row} ${style.hover} ${baseRowBg} ${bulkOverlay}`}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`row-activity-${item.private_id ?? idx}`}
      >
        {onToggleSelect && (
          <td
            className="w-8 px-2 py-2"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            <button
              type="button"
              className="inline-flex items-center justify-center"
              disabled={!item.pubkey}
              title={!item.pubkey ? "No pubkey to re-trigger" : selected ? "Deselect" : "Select"}
              data-testid={`checkbox-activity-${item.private_id ?? idx}`}
            >
              {bulkStatus === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              ) : bulkStatus === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : bulkStatus === "failed" ? (
                <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              ) : selected ? (
                <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
              ) : (
                <Square
                  className={`h-3.5 w-3.5 ${item.pubkey ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                />
              )}
            </button>
          </td>
        )}
        <td className="whitespace-nowrap px-2 py-2 text-[10px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            {isInPipeline && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${style.dotPulse}`}
                />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
              </span>
            )}
            {fmtDate(item.created_at)}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-[10px] text-slate-500 dark:text-slate-400">
          {fmtDate(item.updated_at)}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          {formatLatencyMs(item.created_at, item.updated_at) ?? "—"}
        </td>
        <td className="px-2 py-2 text-[10px]">
          {item.pubkey ? (
            (() => {
              let npub: string;
              try {
                npub = nip19.npubEncode(item.pubkey);
              } catch {
                npub = item.pubkey;
              }
              const npubShort = `${npub.slice(0, 12)}...${npub.slice(-4)}`;
              const displayName = profile?.name;
              return (
                <div className="flex min-w-0 items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToUser?.(item.pubkey!);
                    }}
                    className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left transition-opacity hover:opacity-80"
                    data-testid={`link-user-${item.pubkey.slice(0, 8)}`}
                    title={displayName ? `${displayName} — ${npub}` : npub}
                  >
                    <Avatar className="h-5 w-5 shrink-0">
                      {profile?.picture ? (
                        <AvatarImage src={profile.picture} alt={displayName || "User"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="border border-slate-200 bg-slate-100 text-[8px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                        {displayName?.charAt(0)?.toUpperCase() || (
                          <Users className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="max-w-[120px] truncate text-[10px] font-medium text-brand-deep hover:text-brand-accent">
                        {displayName || npubShort}
                      </span>
                      {displayName && (
                        <span className="hidden max-w-[120px] truncate font-mono text-[8px] text-slate-400 dark:text-slate-500 sm:inline">
                          {npubShort}
                        </span>
                      )}
                    </div>
                  </button>
                  <span className="hidden shrink-0 sm:inline-flex">
                    <CopyButton text={npub} />
                  </span>
                </div>
              );
            })()
          ) : (
            <span className="font-mono text-slate-400 dark:text-slate-500">—</span>
          )}
        </td>
        <td className="px-2 py-2">
          <TriggerSourceBadge value={item.trigger_source} />
          {schedulingName && (
            <div
              className="mt-0.5 text-[8px] font-medium text-brand-primary dark:text-brand-link"
              title="This user's current scheduling tier"
            >
              {schedulingName}
            </div>
          )}
        </td>
        <td className="px-2 py-2">
          <ActivityStatusBadge value={item.status} />
        </td>
        <td className="px-2 py-2">
          <ActivityStatusBadge value={item.ta_status} />
        </td>
        <td className="px-2 py-2">
          <ActivityStatusBadge value={item.internal_publication_status} />
        </td>
        <td className="px-2 py-2 font-mono text-[10px] text-slate-600 dark:text-slate-300">{item.algorithm || "—"}</td>
        <td className="px-2 py-2 text-center text-[10px]" data-testid={`cell-queue-${item.private_id ?? idx}`}>
          {(() => {
            // In-flight rows show their live position in the platform
            // queue (computed at the parent level): "active" for the row
            // currently being processed, 1..N for waiting rows in FIFO
            // order. Terminated rows fall back to the per-record value
            // the backend captured at run time, with 0 → "—".
            if (isInPipeline && queuePosition !== undefined) {
              if (queuePosition === "active") {
                return <span className="font-semibold text-emerald-600 dark:text-emerald-400">active</span>;
              }
              return (
                <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{queuePosition}</span>
              );
            }
            const depth = item.how_many_others_with_priority;
            return <span className="text-slate-600 dark:text-slate-300">{depth > 0 ? depth : "—"}</span>;
          })()}
        </td>
        <td className="px-2 py-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-slate-400 dark:text-slate-500">{item.private_id}</span>
            {isInPipeline && style.label && (
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${style.labelClass}`}
              >
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
              className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                isInPipeline
                  ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                  : retriggerState === "confirming"
                    ? "animate-pulse border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                    : retriggerState === "done"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : retriggerState === "error"
                        ? "border border-red-200 bg-red-50 text-red-500 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400"
                        : retriggerState === "running"
                          ? "text-slate-400 dark:text-slate-500"
                          : "border border-transparent text-brand-deep hover:border-brand-accent/20 hover:bg-brand-deep/5 hover:text-brand-accent"
              }`}
              title={
                isInPipeline
                  ? "Currently processing"
                  : retriggerState === "confirming"
                    ? "Click again to confirm"
                    : "Re-trigger GrapeRank"
              }
              data-testid={`button-retrigger-${item.private_id}`}
            >
              {retriggerState === "running" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : retriggerState === "confirming" ? (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span>Confirm?</span>
                </>
              ) : retriggerState === "done" ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Done</span>
                </>
              ) : retriggerState === "error" ? (
                <>
                  <XCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Failed</span>
                </>
              ) : isInPipeline ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin opacity-40" />
                  <span className="hidden sm:inline">Active</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span className="hidden sm:inline">Re-trigger</span>
                </>
              )}
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
          <td colSpan={13} className="border-t border-red-100/50 px-4 py-1.5 dark:border-red-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                  Failed at {failureStage ?? "Pipeline"}:
                </span>
                <span className="break-words font-mono text-[10px] text-red-800 dark:text-red-300">
                  {truncateError(extractErrorMessage(item), 160)}
                </span>
                <span className="ml-2 text-[9px] italic text-red-500/70">Click for details</span>
              </div>
            </div>
          </td>
        </tr>
      )}
      {expanded && (
        <tr className={style.expanded}>
          <td colSpan={12} className="px-4 py-3">
            {isFailed ? (
              <FailureDetailCard
                item={item}
                onRetrigger={item.pubkey && onRetrigger ? handleRetrigger : undefined}
                retriggerState={retriggerState}
                isInPipeline={isInPipeline}
                onViewDetail={(e) => {
                  e.stopPropagation();
                  onViewDetail(item);
                }}
                onNavigateToUser={onNavigateToUser}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
                  {item.pubkey && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Full Pubkey
                      </span>
                      <p className="mt-0.5 break-all font-mono text-[9px] text-slate-700 dark:text-slate-200">
                        {item.pubkey}
                      </p>
                    </div>
                  )}
                  {item.error?.message && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Error</span>
                      <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">
                        {item.error.message}
                      </p>
                    </div>
                  )}
                  {item.count_values && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Count Values
                      </span>
                      <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">
                        {item.count_values}
                      </p>
                    </div>
                  )}
                  {item.parameters && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Parameters
                      </span>
                      <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.parameters}</p>
                    </div>
                  )}
                </div>
                <div className={`mt-3 border-t pt-2 ${style.expandedBorder} flex flex-wrap items-center gap-3`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetail(item);
                    }}
                    className="flex min-h-[28px] items-center gap-1 text-[10px] font-semibold text-brand-deep transition-colors hover:text-brand-accent"
                    data-testid={`button-view-detail-${item.private_id}`}
                  >
                    <Eye className="h-3 w-3" />
                    View Full Request
                  </button>
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const [mobileTabDropdownOpen, setMobileTabDropdownOpen] = useState(false);

  // Scrollbars are hidden app-wide (see index.css); admin opts back in while
  // mounted. Its wide tables need the horizontal scrollbar to show there ARE
  // more columns — ScrollableTable even mirrors one above the table. Set on
  // <html> because the window scrollbar lives there, out of reach of any
  // selector scoped inside the page.
  useEffect(() => {
    document.documentElement.classList.add("admin-scrollbars");
    return () => document.documentElement.classList.remove("admin-scrollbars");
  }, []);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    return parseAdminTab(new URLSearchParams(window.location.search).get("tab"), {
      assistants: FEATURES.assistantsAdmin,
    });
  });
  // Who the Users tab's "Publish trusted lists" sent to the Trusted Lists tab.
  const [trustedListsObserver, setTrustedListsObserver] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [daysFilter, setDaysFilter] = useState(30);
  const [userSort, setUserSort] = useState<SortState>({ key: "last_triggered", dir: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [activityPage, setActivityPage] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState<PageSizeOption>(25);
  const [activityTimeRange, setActivityTimeRange] = useState<ActivityTimeRange>("24h");
  const [kpiFilter, setKpiFilter] = useState<"scored" | "sp_adopters" | "queue" | "failed" | null>(null);
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("24h");
  useEffect(() => {
    try {
      localStorage.removeItem("admin_trend_window");
    } catch {
      /* ignore */
    }
  }, []);
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
  useEffect(
    () => () => {
      if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
    },
    [],
  );
  const [triggerConfirmPubkey, setTriggerConfirmPubkey] = useState<string | null>(null);

  const [selectedUserPubkeys, setSelectedUserPubkeys] = useState<Set<string>>(new Set());
  const [selectedActivityRows, setSelectedActivityRows] = useState<Map<number, string>>(new Map());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkStatuses, setBulkStatuses] = useState<Map<string, "queued" | "running" | "success" | "failed">>(new Map());
  const [, setBulkErrors] = useState<Map<string, string>>(new Map());
  const [bulkConfirm, setBulkConfirm] = useState<{ pubkeys: string[]; source: "users" | "activity" | "retry" } | null>(
    null,
  );
  const [fetchingMatching, setFetchingMatching] = useState(false);
  const [bulkLastResult, setBulkLastResult] = useState<{
    source: "users" | "activity";
    successes: string[];
    failures: { pubkey: string; error: string }[];
  } | null>(null);
  const SELECT_ALL_MATCHING_CAP = 200;
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupMode, setLookupMode] = useState<"lookup" | "onboard">("lookup");
  const [lookupInput, setLookupInput] = useState("");
  const [lookupRunning, setLookupRunning] = useState(false);
  const [, setLookupResult] = useState<{ success: boolean; message: string; data?: Record<string, unknown> } | null>(
    null,
  );
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
  const [onboardProgress, setOnboardProgress] = useState<{
    done: number;
    total: number;
    results: { pubkey: string; name: string; success: boolean; message: string }[];
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<number | null>(null);
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

  // The claim rides on the Account's Session, so "no Session" is undecided, not
  // "not an admin" — a background re-auth clears it for the length of one
  // round-trip, and that must not bounce an admin off the page they are on.
  const account = useActiveAccount();
  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
      return;
    }
    if (account && hasSession(account as BrainstormAccount) && !user.isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, account, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab") || params.has("highlight")) {
      window.history.replaceState({}, "", window.location.pathname);
      if (params.get("highlight")) {
        setTimeout(() => setHighlightedPubkey(null), 2500);
      }
    }
  }, []);

  // `user` is non-null on the first render for anyone signed in — it used to be
  // set only after the admin check passed. The redirect below merely *schedules*
  // a navigation, so gating on `user` alone fires every admin request for a
  // non-admin and collects a handful of 403s on the way out.
  const grapeRankQuery = useQuery<GrapeRankApiResponse>({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user?.isAdmin,
    staleTime: 30_000,
  });

  const adminStatsQuery = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => apiClient.getAdminStats(),
    enabled: !!user?.isAdmin,
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
    queryFn: () =>
      apiClient.getAdminUsers({
        search: debouncedSearch || undefined,
        sort: userSort.key,
        order: userSort.dir,
        days: daysFilter,
        page: userPage + 1,
        size: pageSize,
      }),
    enabled: !!user?.isAdmin,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: activeTab === "users" ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_USERS_MS) : false,
    refetchOnWindowFocus: "always",
  });

  // Tickets where the user spoke last and hasn't been seen — the Support
  // tab's dot. Shares the tab's query key, so opening the tab dedupes it.
  const adminSupportQuery = useQuery({
    queryKey: ADMIN_SUPPORT_QUERY_KEY,
    queryFn: adminListTickets,
    enabled: !!user?.isAdmin,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const supportUnread = unreadCount("admin", adminSupportQuery.data ?? []);

  const schedulingPoliciesQuery = useQuery<SchedulingItem[]>({
    queryKey: ["/api/admin/scheduling"],
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: !!user?.isAdmin,
    staleTime: 60_000,
  });
  const schedulingPolicies = schedulingPoliciesQuery.data ?? [];

  const adminUsersData = adminUsersQuery.data;
  const adminUsersList = adminUsersData?.items ?? NONE;
  const adminUsersTotal = adminUsersData?.total ?? 0;
  const adminUsersTotalPages = adminUsersData?.pages ?? 1;

  const overviewUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users/overview", daysFilter],
    queryFn: () => apiClient.getAdminUsers({ days: daysFilter, page: 1, size: 100 }),
    enabled: !!user?.isAdmin,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_OVERVIEW_MS,
    refetchOnWindowFocus: "always",
  });

  const overviewActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity/overview"],
    // Backend caps `size` at 100; requesting more 422s.
    queryFn: () => apiClient.getAdminActivity({ page: 1, size: 100 }),
    enabled: !!user?.isAdmin,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_OVERVIEW_MS,
    refetchOnWindowFocus: "always",
  });

  const adminActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity", activityPage, activityPageSize],
    queryFn: () =>
      apiClient.getAdminActivity({
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
  const activityItems = activityData?.items ?? NONE;
  const activityTotal = activityData?.total ?? 0;
  const activityTotalPages = activityData?.pages ?? 1;

  // ----- Brainstorm Assistants admin view -----
  const [assistantSearch, setAssistantSearch] = useState("");
  const [assistantDebouncedSearch, setAssistantDebouncedSearch] = useState("");
  const [assistantPage, setAssistantPage] = useState(0);
  const [assistantPageSize, setAssistantPageSize] = useState<PageSizeOption>(25);
  const [expandedAssistant, setExpandedAssistant] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setAssistantDebouncedSearch(assistantSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [assistantSearch]);
  useEffect(() => {
    setAssistantPage(0);
  }, [assistantDebouncedSearch, assistantPageSize]);

  const assistantStatsQuery = useQuery({
    queryKey: ["/api/admin/assistants/stats"],
    queryFn: () => apiClient.getAdminAssistantStats(),
    enabled: !!user && activeTab === "assistants" && FEATURES.assistantsAdmin,
    staleTime: 30_000,
    refetchInterval:
      activeTab === "assistants" && FEATURES.assistantsAdmin
        ? isBoostActive
          ? BOOST_INTERVAL_MS
          : POLL_OVERVIEW_MS
        : false,
  });

  const assistantsListQuery = useQuery({
    queryKey: ["/api/admin/assistants", assistantDebouncedSearch, assistantPage, assistantPageSize],
    queryFn: () =>
      apiClient.getAdminAssistants({
        search: assistantDebouncedSearch || undefined,
        page: assistantPage + 1,
        size: assistantPageSize,
      }),
    enabled: !!user && activeTab === "assistants" && FEATURES.assistantsAdmin,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    refetchInterval:
      activeTab === "assistants" && FEATURES.assistantsAdmin
        ? isBoostActive
          ? BOOST_INTERVAL_MS
          : POLL_ACTIVITY_MS
        : false,
  });

  const assistantHistoryQuery = useQuery({
    queryKey: ["/api/admin/assistants", expandedAssistant, "history"],
    queryFn: () =>
      expandedAssistant ? apiClient.getAdminAssistantHistory(expandedAssistant, { size: 25 }) : Promise.resolve(null),
    enabled: !!user && activeTab === "assistants" && FEATURES.assistantsAdmin && !!expandedAssistant,
    staleTime: 30_000,
  });

  const runBulkRetrigger = useCallback(
    async (rawPubkeys: string[], source: "users" | "activity" | "retry") => {
      const skipSet = triggeringPubkeys;
      const seen = new Set<string>();
      const toRun: string[] = [];
      const skipped: string[] = [];
      for (const pk of rawPubkeys) {
        if (!pk || seen.has(pk)) continue;
        seen.add(pk);
        if (skipSet.has(pk)) {
          skipped.push(pk);
          continue;
        }
        toRun.push(pk);
      }
      if (toRun.length === 0) {
        toast({
          title: "Nothing to re-trigger",
          description: skipped.length
            ? `${skipped.length} pubkey(s) already in flight.`
            : "No valid pubkeys in selection.",
          variant: "destructive",
        });
        return;
      }
      setBulkRunning(true);
      setBulkLastResult(null);
      setBulkErrors(new Map());
      const initial = new Map<string, "queued" | "running" | "success" | "failed">();
      toRun.forEach((pk) => initial.set(pk, "queued"));
      setBulkStatuses(initial);

      const concurrency = 5;
      let cursor = 0;
      const successes: string[] = [];
      const failures: { pubkey: string; error: string }[] = [];
      let firstSuccessFired = false;

      const worker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= toRun.length) return;
          const pk = toRun[i];
          setBulkStatuses((prev) => {
            const next = new Map(prev);
            next.set(pk, "running");
            return next;
          });
          try {
            await apiClient.triggerUserGraperank(pk);
            successes.push(pk);
            setBulkStatuses((prev) => {
              const next = new Map(prev);
              next.set(pk, "success");
              return next;
            });
            if (!firstSuccessFired) {
              firstSuccessFired = true;
              triggerRefreshBoost();
            }
          } catch (err: unknown) {
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === "object" && err !== null
                  ? JSON.stringify(err)
                  : "Unknown error";
            failures.push({ pubkey: pk, error: msg });
            setBulkStatuses((prev) => {
              const next = new Map(prev);
              next.set(pk, "failed");
              return next;
            });
            setBulkErrors((prev) => {
              const next = new Map(prev);
              next.set(pk, msg);
              return next;
            });
          }
        }
      };
      const workers = Array.from({ length: Math.min(concurrency, toRun.length) }, () => worker());
      await Promise.all(workers);

      setBulkRunning(false);
      const resultSource: "users" | "activity" = source === "retry" ? (bulkLastResult?.source ?? "users") : source;
      setBulkLastResult({ source: resultSource, successes, failures });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title:
          failures.length === 0
            ? `Re-triggered ${successes.length} user${successes.length !== 1 ? "s" : ""}`
            : `${successes.length} succeeded, ${failures.length} failed`,
        description: skipped.length ? `${skipped.length} skipped (already in flight).` : undefined,
        variant: failures.length === 0 ? "default" : "destructive",
      });
      if (resultSource === "users") setSelectedUserPubkeys(new Set());
      else setSelectedActivityRows(new Map());
    },
    [triggeringPubkeys, toast, triggerRefreshBoost, queryClient, bulkLastResult],
  );

  useEffect(() => {
    setSelectedUserPubkeys(new Set());
    setBulkLastResult((prev) => (prev?.source === "users" ? null : prev));
  }, [userSearch, debouncedSearch, daysFilter, kpiFilter]);

  useEffect(() => {
    setSelectedActivityRows(new Map());
    setBulkLastResult((prev) => (prev?.source === "activity" ? null : prev));
  }, [activityTimeRange]);

  const [userProfiles, setUserProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());

  useEffect(() => {
    const activityPubkeys = activityItems.map((a) => a.pubkey).filter((pk): pk is string => !!pk);
    if (adminUsersList.length === 0 && activityPubkeys.length === 0) return;
    let cancelled = false;
    const allPubkeys = [
      ...adminUsersList.map((u) => u.pubkey),
      ...(overviewUsersQuery.data?.items ?? []).map((u) => u.pubkey),
      ...activityPubkeys,
    ];
    const seen = new Set<string>();
    const toFetch: string[] = [];
    for (const pk of allPubkeys) {
      if (seen.has(pk) || userProfiles.has(pk)) continue;
      seen.add(pk);
      toFetch.push(pk);
    }
    if (toFetch.length === 0) return;
    (async () => {
      const results = await Promise.allSettled(toFetch.map((pk) => fetchProfile(pk, 8000)));
      if (cancelled) return;
      setUserProfiles((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < toFetch.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            next.set(toFetch[i], { name: r.value.display_name || r.value.name, picture: r.value.picture });
          } else {
            next.set(toFetch[i], {});
          }
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userProfiles is written here; adding it would loop
  }, [adminUsersList, overviewUsersQuery.data, activityItems]);

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
          resolve({
            url,
            latencyMs: latency,
            status: latency < 2000 ? "connected" : "degraded",
            checkedAt: new Date(),
          });
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
    const results = await Promise.all(relays.map((r) => probeRelayLatency(r)));
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

  const grapeRank: GrapeRankData | null = grapeRankQuery.data?.data ?? null;
  const queuePosition =
    typeof grapeRank?.how_many_others_with_priority === "number" ? grapeRank.how_many_others_with_priority : null;

  const overviewAllUsers = overviewUsersQuery.data?.items ?? NONE;
  // pubkey → current scheduling tier, for Platform Activity rows (best-effort:
  // only covers users in the loaded set; activity records don't carry the tier).
  const schedulingTierByPubkey = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of overviewAllUsers) {
      if (u.pubkey && u.scheduling_name) m.set(u.pubkey, u.scheduling_name);
    }
    return m;
  }, [overviewAllUsers]);
  const overviewAllActivity = overviewActivityQuery.data?.items ?? NONE;
  // Coverage of the loaded activity feed — surfaced so admins know how far the
  // trend windows actually reach (7d/30d may exceed the loaded records).
  const activityCoverage = useMemo(() => {
    const times = overviewAllActivity.map((a) => parseActivityTs(a.updated_at)).filter((t): t is number => !!t);
    return { count: overviewAllActivity.length, oldest: times.length ? Math.min(...times) : null };
  }, [overviewAllActivity]);
  const overviewTotalUsers = overviewUsersQuery.data?.total ?? 0;
  const overviewLoading = overviewUsersQuery.isLoading || overviewActivityQuery.isLoading;

  const filteredUsersList = useMemo(() => {
    const trimmed = userSearch.trim();
    const nameSearch = trimmed && isNameSearch(trimmed);
    let list = nameSearch ? overviewAllUsers : adminUsersList;
    if (nameSearch) {
      const query = trimmed.toLowerCase();
      list = list.filter((u) => {
        const prof = userProfiles.get(u.pubkey);
        const name = prof?.name?.toLowerCase() ?? "";
        return name.includes(query);
      });
    }
    if (kpiFilter) {
      list = list.filter((u) => {
        if (kpiFilter === "scored") return u.latest_status?.toLowerCase() === "success";
        if (kpiFilter === "sp_adopters") return u.latest_ta_status?.toLowerCase() === "success";
        if (kpiFilter === "queue")
          return u.latest_status?.toLowerCase() !== "success" && !isFailedStatus(u.latest_status);
        if (kpiFilter === "failed") return isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status);
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

    const successCount = users.filter((u) => u.latest_status?.toLowerCase() === "success").length;
    const failedCount = users.filter((u) => isFailedStatus(u.latest_status)).length;
    const pendingCount = total - successCount - failedCount;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

    const taSuccessCount = users.filter((u) => u.latest_ta_status?.toLowerCase() === "success").length;
    const taFailedCount = users.filter((u) => isFailedStatus(u.latest_ta_status)).length;
    const taAdoptionRate = total > 0 ? Math.round((taSuccessCount / total) * 100) : 0;

    const withTaPubkey = users.filter((u) => u.ta_pubkey).length;

    const totalCalcs = users.reduce((sum, u) => sum + (u.times_calculated || 0), 0);
    const avgCalcs = total > 0 ? (totalCalcs / total).toFixed(1) : "0";

    const algoCounts: Record<string, number> = {};
    users.forEach((u) => {
      const algo = u.latest_algorithm || "unknown";
      algoCounts[algo] = (algoCounts[algo] || 0) + 1;
    });

    const now = Date.now();
    const last24h = activity.filter((a) => {
      try {
        const t = new Date(a.updated_at.endsWith("Z") ? a.updated_at : a.updated_at + "Z").getTime();
        return now - t < 86400000;
      } catch {
        return false;
      }
    });
    const recentSuccess = last24h.filter((a) => a.status?.toLowerCase() === "success").length;
    const recentFailed = last24h.filter((a) => isFailedStatus(a.status)).length;

    const sortedByUpdate = [...users].sort((a, b) => {
      const ta = new Date(a.last_updated || "").getTime() || 0;
      const tb = new Date(b.last_updated || "").getTime() || 0;
      return tb - ta;
    });
    const lastPlatformActivity = sortedByUpdate[0]?.last_updated ?? null;

    const neverCalc = users.filter((u) => !u.times_calculated || u.times_calculated === 0).length;

    return {
      total: overviewTotalUsers,
      successCount,
      failedCount,
      pendingCount,
      successRate,
      taSuccessCount,
      taFailedCount,
      taAdoptionRate,
      withTaPubkey,
      totalCalcs,
      avgCalcs,
      algoCounts,
      recentSuccess,
      recentFailed,
      lastPlatformActivity,
      neverCalc,
    };
  }, [overviewAllUsers, overviewAllActivity, overviewTotalUsers]);

  const computedQueueDepth = useMemo(() => {
    if (overviewAllUsers.length === 0) return null;
    return overviewAllUsers.filter((u) => {
      const s = u.latest_status?.toLowerCase();
      return s === "waiting" || s === "ongoing" || s === "queued" || s === "pending";
    }).length;
  }, [overviewAllUsers]);

  // Assign a live "queue position" to every in-flight request so the
  // Platform Activity table's Queue column reflects real ordering instead
  // of one shared concurrency count. Waiting rows are numbered 1..N in
  // FIFO order (oldest created_at first = next to run); the actively
  // processing row(s) are tagged as "active". Terminated rows get no
  // entry and fall back to the per-record backend value.
  const queuePositionByPrivateId = useMemo(() => {
    const map = new Map<number, number | "active">();
    // Prefer the broader overview snapshot for ordering, but merge in any
    // current-page rows that the snapshot may have missed (it is capped to
    // 100 records and may lag the live page).
    const seen = new Set<number>();
    const merged: BrainstormRequestInstance[] = [];
    for (const it of overviewAllActivity) {
      if (typeof it.private_id === "number" && !seen.has(it.private_id)) {
        seen.add(it.private_id);
        merged.push(it);
      }
    }
    for (const it of activityItems) {
      if (typeof it.private_id === "number" && !seen.has(it.private_id)) {
        seen.add(it.private_id);
        merged.push(it);
      }
    }
    const tsOf = (s: string | null | undefined) => {
      if (!s) return 0;
      try {
        const d = new Date(s.endsWith("Z") ? s : s + "Z");
        const t = d.getTime();
        return isNaN(t) ? 0 : t;
      } catch {
        return 0;
      }
    };
    const active = merged.filter((i) => getActivityPipelineState(i) === "active");
    const waiting = merged
      .filter((i) => getActivityPipelineState(i) === "waiting")
      .sort((a, b) => tsOf(a.created_at) - tsOf(b.created_at));
    for (const a of active) {
      if (typeof a.private_id === "number") map.set(a.private_id, "active");
    }
    waiting.forEach((w, idx) => {
      if (typeof w.private_id === "number") map.set(w.private_id, idx + 1);
    });
    return map;
  }, [overviewAllActivity, activityItems]);

  // Fixed 24h glance-trend for the top KPI-card sparklines — independent of the
  // Overview trend-window filter (the header cards show "right now" state).
  const fixedTrends24h = useMemo(() => {
    const now = Date.now();
    const cfg = getWindowConfig("24h");
    const buckets = bucketActivity(overviewAllActivity, cfg.bucketCount, cfg.bucketSizeMs, now);
    return {
      bucketTimestamps: buckets.map((b) => b.t),
      totalSeries: buckets.map((b) => b.total),
      successSeries: buckets.map((b) => b.success),
      failedSeries: buckets.map((b) => b.failed),
      rateSeries: buckets.map((b) => {
        const d = b.success + b.failed;
        return d === 0 ? 0 : Math.round((b.success / d) * 100);
      }),
    };
  }, [overviewAllActivity]);

  const trends = useMemo(() => {
    const now = Date.now();
    const HOUR = 3600000;
    const oldestActivityTs = overviewAllActivity.reduce((min, a) => {
      const t = parseActivityTs(a.updated_at);
      if (!t) return min;
      return min === 0 ? t : Math.min(min, t);
    }, 0);
    const dataAgeMs = oldestActivityTs > 0 ? now - oldestActivityTs : 0;
    let cfg = getWindowConfig(trendWindow);
    if (trendWindow === "all") {
      // Bucket the whole loaded span so "All" reads well no matter the range.
      const spanMs = Math.max(dataAgeMs, HOUR);
      const bucketCount = 12;
      cfg = { ...cfg, bucketCount, bucketSizeMs: Math.ceil(spanMs / bucketCount) };
    }
    const dataCoversWindow = trendWindow === "all" ? true : oldestActivityTs > 0 && dataAgeMs >= cfg.windowMs * 0.95;
    const dataCoversPriorWindow =
      trendWindow === "all" ? false : oldestActivityTs > 0 && dataAgeMs >= cfg.windowMs * 1.95;
    const buckets = bucketActivity(overviewAllActivity, cfg.bucketCount, cfg.bucketSizeMs, now);
    const cmp = compareActivityWindows(overviewAllActivity, cfg.windowMs, now);
    const cmp1h = compareActivityWindows(overviewAllActivity, HOUR, now);
    const totalSeries = buckets.map((b) => b.total);
    const successSeries = buckets.map((b) => b.success);
    const failedSeries = buckets.map((b) => b.failed);
    const bucketTimestamps = buckets.map((b) => b.t);
    const rateSeries = buckets.map((b) => {
      const d = b.success + b.failed;
      return d === 0 ? 0 : Math.round((b.success / d) * 100);
    });
    return {
      cfg,
      buckets,
      bucketTimestamps,
      totalSeries,
      successSeries,
      failedSeries,
      rateSeries,
      cmp,
      cmp1h,
      hasPriorWindow: cmp.hasPrev,
      hasPriorHourWindow: cmp1h.hasPrev,
      hasAnyActivity: cmp.curTotal > 0,
      dataCoversWindow,
      dataCoversPriorWindow,
    };
  }, [overviewAllActivity, trendWindow]);

  const algoDistinct = pipelineMetrics ? Object.keys(pipelineMetrics.algoCounts).length : 0;

  const handleTriggerGraperank = useCallback(
    async (pubkey: string) => {
      setTriggeringPubkeys((prev) => new Set(prev).add(pubkey));
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
        setTriggeringPubkeys((prev) => {
          const next = new Set(prev);
          next.delete(pubkey);
          return next;
        });
      }
    },
    [toast, queryClient, triggerRefreshBoost],
  );

  const totalPages = activeNameSearch
    ? Math.max(1, Math.ceil(filteredUsersList.length / pageSize))
    : adminUsersTotalPages;

  const handleSort = useCallback((key: AdminSortKey) => {
    setUserSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
    setUserPage(0);
  }, []);

  const handlePageSizeChange = useCallback((val: string) => {
    setPageSize(parseInt(val, 10) as PageSizeOption);
    setUserPage(0);
  }, []);

  const jumpToUser = useCallback(
    (pubkey: string, displayName?: string) => {
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
    },
    [toast, userProfiles],
  );

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
      const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
      const isNew = data.created === true || data.is_new === true;
      const canonicalPubkey =
        typeof data.pubkey === "string"
          ? data.pubkey
          : typeof data.brainstorm_pubkey === "string"
            ? data.brainstorm_pubkey
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
      let results: NostrSearchResult[] = [];
      try {
        // Backend search (NosFabrica/house POV, unauthenticated) — same endpoint
        // the public search uses. Falls back to a direct relay search on failure.
        const { results: byText } = await searchByText(q, "nosfabrica", undefined, 10);
        results = byText.map((r) => ({
          pubkey: r.pubkey,
          npub: r.npub,
          name: r.name,
          displayName: r.displayName,
          picture: r.picture,
          about: r.about,
          nip05: r.nip05,
        }));
      } catch {
        results = await searchNostrProfiles(q, { limit: 10, timeoutMs: 5000 });
      }
      if (results.length === 0) {
        setOnboardError("No profiles found — try a different name");
      } else {
        setOnboardResults(results);
      }
    } catch {
      setOnboardError("Search failed — backend may be unavailable");
    } finally {
      setOnboardSearching(false);
    }
  }, [onboardSearch]);

  const addToOnboardQueue = useCallback((profile: NostrSearchResult) => {
    setOnboardQueue((prev) => {
      if (prev.some((p) => p.pubkey === profile.pubkey)) return prev;
      return [...prev, profile];
    });
  }, []);

  const removeFromOnboardQueue = useCallback((pubkey: string) => {
    setOnboardQueue((prev) => prev.filter((p) => p.pubkey !== pubkey));
  }, []);

  const handleBulkPasteAdd = useCallback(() => {
    const lines = bulkPasteInput
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: NostrSearchResult[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      let hex = line;
      if (line.startsWith("npub")) {
        try {
          const decoded = nip19.decode(line);
          if (decoded.type === "npub") hex = decoded.data;
          else {
            errors.push(line.slice(0, 20) + "...");
            continue;
          }
        } catch {
          errors.push(line.slice(0, 20) + "...");
          continue;
        }
      } else if (!/^[0-9a-fA-F]{64}$/.test(line)) {
        errors.push(line.slice(0, 20) + "...");
        continue;
      }
      hex = hex.toLowerCase();
      if (!added.some((p) => p.pubkey === hex) && !onboardQueue.some((p) => p.pubkey === hex)) {
        added.push({ pubkey: hex, npub: nip19.npubEncode(hex) });
      }
    }
    if (added.length > 0) {
      setOnboardQueue((prev) => [...prev, ...added]);
      setBulkPasteInput("");
      toast({
        title: `${added.length} added to queue`,
        description: errors.length > 0 ? `${errors.length} invalid entries skipped` : undefined,
      });
    } else if (errors.length > 0) {
      setOnboardError(
        `Could not parse: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`,
      );
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
        const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
        const isNew = data.created === true || data.is_new === true;
        results.push({
          pubkey: profile.pubkey,
          name: displayName,
          success: true,
          message: isNew ? "Onboarded" : "Already exists",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed";
        results.push({ pubkey: profile.pubkey, name: displayName, success: false, message: msg });
      }
      setOnboardProgress({ done: i + 1, total, results: [...results] });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
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

  if (!user || isAuthRedirecting()) return null;

  const tabs: { key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "scheduling", label: "Scheduling", icon: CalendarClock },
    { key: "support", label: "Support", icon: LifeBuoy },
    // Gated on nothing. A fresh instance has billing enabled and zero plan
    // mappings, which is exactly when an admin needs this tab to create the
    // first one — gating on plans existing would be a bootstrap deadlock, and
    // the mock flag answers an unrelated question. Where billing isn't
    // configured the endpoints 404 and the cards say so.
    { key: "billing" as AdminTab, label: "Billing", icon: Receipt },
    { key: "users", label: "Users", icon: Users },
    { key: "trusted-lists", label: "Trusted Lists", icon: ListChecks },
    ...(FEATURES.assistantsAdmin ? [{ key: "assistants" as AdminTab, label: "Assistants", icon: Sparkles }] : []),
    { key: "health", label: "System Health", icon: Server },
  ];

  const configuredRelays = [PRIMARY_RELAY, ...PROFILE_RELAYS];

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-admin"
    >
      <PageBackground />

      <AppHeader user={user} onLogout={handleLogout} active="admin" />

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <DeferredSessionNotice className="mb-6" />
        <div className="animate-fade-up space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-admin-header">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="amber" size="sm" dot className="font-bold uppercase tracking-[0.15em]">
                  NosFabrica Admin
                </Chip>
              </div>
              <h1
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span className="block pb-1">Admin Dashboard</span>
              </h1>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:text-base">
                System overview and management for NosFabrica operators.
              </p>
            </div>
          </div>

          {/* One line on a desk; on a phone the kicker and "live now" share the
              first line and the note takes a line of its own beneath — three
              narrow columns of wrapped words was the alternative. */}
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="system-state-line">
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current system state
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[9px] text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              live now
            </span>
            <span
              className="basis-full text-[9px] text-slate-400 dark:text-slate-500 sm:basis-auto"
              data-testid="system-state-note"
            >
              <span className="hidden sm:inline">· </span>mini-charts show the last 24h · window filters affect the
              charts below, not these
            </span>
          </div>
          <div
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            data-testid="section-kpi-strip"
          >
            <KpiCard
              label="Scored Users"
              value={
                pipelineMetrics
                  ? `${formatNumber(pipelineMetrics.successCount)} / ${formatNumber(pipelineMetrics.total)}`
                  : hasSystemData
                    ? formatNumber(adminStats!.scoredUsers)
                    : "0"
              }
              icon={UserCheck}
              subtitle={pipelineMetrics ? `${pipelineMetrics.successRate}% of all users scored` : "Completed GrapeRank"}
              tooltip="Click to view scored users"
              scope={pipelineMetrics || hasSystemData ? "system" : "graph"}
              onClick={() => {
                setKpiFilter("scored");
                setActiveTab("users");
                setUserPage(0);
              }}
              sparklineData={fixedTrends24h.successSeries}
              sparklineTimestamps={fixedTrends24h.bucketTimestamps}
              sparklineColor="#10b981"
              sparklineValueLabel="successes"
            />
            <KpiCard
              label="SP Adopters"
              value={
                pipelineMetrics
                  ? `${formatNumber(pipelineMetrics.taSuccessCount)} / ${formatNumber(pipelineMetrics.total)}`
                  : hasSystemData
                    ? formatNumber(adminStats!.spAdopters)
                    : "0"
              }
              icon={Shield}
              subtitle={pipelineMetrics ? `${pipelineMetrics.taAdoptionRate}% TA adoption` : "Published NIP-85 TA"}
              tooltip="Click to view SP adopters"
              scope={pipelineMetrics || hasSystemData ? "system" : "graph"}
              onClick={() => {
                setKpiFilter("sp_adopters");
                setActiveTab("users");
                setUserPage(0);
              }}
            />
            <KpiCard
              label="Queue Depth"
              value={
                computedQueueDepth !== null
                  ? formatNumber(computedQueueDepth)
                  : hasSystemData
                    ? formatNumber(adminStats!.queueDepth)
                    : queuePosition !== null
                      ? queuePosition.toString()
                      : "—"
              }
              icon={Clock}
              subtitle={
                computedQueueDepth !== null
                  ? "Users awaiting calculation"
                  : hasSystemData
                    ? "Users awaiting calculation"
                    : queuePosition !== null
                      ? "Position in queue"
                      : "Via graperankResult"
              }
              tooltip="Click to view queued users"
              scope={computedQueueDepth !== null || hasSystemData ? "system" : "graph"}
              onClick={() => {
                setKpiFilter("queue");
                setActiveTab("users");
                setUserPage(0);
              }}
            />
            <KpiCard
              label="Total Calcs"
              value={pipelineMetrics ? formatNumber(pipelineMetrics.totalCalcs) : "0"}
              icon={Activity}
              subtitle="Cumulative attempts, all users"
              tooltip="Cumulative calculation attempts across all users"
              scope="system"
              sparklineData={fixedTrends24h.totalSeries}
              sparklineTimestamps={fixedTrends24h.bucketTimestamps}
              sparklineColor="#13d2e5"
              sparklineValueLabel="calcs / hr"
            />
            <KpiCard
              label="Success Rate"
              value={
                pipelineMetrics
                  ? `${pipelineMetrics.successRate}%`
                  : trends.cmp.curSR !== null
                    ? `${trends.cmp.curSR}%`
                    : "—"
              }
              icon={CheckCircle2}
              subtitle="Cumulative success rate"
              tooltip="Successful calculations as % of attempted"
              scope="system"
              sparklineData={fixedTrends24h.rateSeries}
              sparklineTimestamps={fixedTrends24h.bucketTimestamps}
              sparklineColor="#10b981"
              sparklineValueLabel="success rate"
              sparklineValueSuffix="%"
            />
            <KpiCard
              label="Failed Count"
              value={pipelineMetrics ? formatNumber(pipelineMetrics.failedCount) : formatNumber(trends.cmp.curFailed)}
              icon={AlertTriangle}
              subtitle="Users with a failed run"
              tooltip="Click to view users with failures"
              scope="system"
              onClick={() => {
                setKpiFilter("failed");
                setActiveTab("users");
                setUserPage(0);
              }}
              sparklineData={fixedTrends24h.failedSeries}
              sparklineTimestamps={fixedTrends24h.bucketTimestamps}
              sparklineColor="#f87171"
              sparklineValueLabel="failures"
            />
          </div>

          <div className="scrollbar-hide -mx-4 hidden overflow-x-auto px-4 sm:mx-0 sm:block sm:px-0">
            <div
              className="flex w-fit gap-1 rounded-2xl border border-brand-accent/10 bg-white/60 p-1 backdrop-blur-sm dark:bg-slate-900/60"
              data-testid="admin-tab-bar"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setUserPage(0);
                      if (tab.key === "users") setKpiFilter(null);
                    }}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 sm:gap-2 sm:px-4 sm:text-sm ${
                      active
                        ? "bg-brand-primary text-white shadow-md"
                        : "text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
                    }`}
                    data-testid={`tab-${tab.key}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.key === "support" && supportUnread > 0 && (
                      <span
                        className={`h-2 w-2 rounded-full ${active ? "bg-white" : "bg-brand-accent"}`}
                        aria-label={`${supportUnread} tickets awaiting reply`}
                        data-testid="tab-support-dot"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:hidden" data-testid="admin-tab-bar-mobile">
            {(() => {
              const [mobileTabOpen, setMobileTabOpen] = [mobileTabDropdownOpen, setMobileTabDropdownOpen];
              const activeTabData = tabs.find((t) => t.key === activeTab);
              const ActiveIcon = activeTabData?.icon ?? BarChart3;
              return (
                <div className="relative">
                  <button
                    onClick={() => setMobileTabOpen(!mobileTabOpen)}
                    className="flex w-full items-center justify-between rounded-2xl border border-brand-accent/10 bg-white/60 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:bg-slate-900/60 dark:text-slate-200"
                    data-testid="button-tab-mobile-trigger"
                  >
                    <span className="flex items-center gap-2">
                      <ActiveIcon className="h-4 w-4 text-brand-deep" />
                      {activeTabData?.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${mobileTabOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {mobileTabOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMobileTabOpen(false)} />
                      <div
                        className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-brand-accent/15 bg-white shadow-lg dark:bg-slate-900"
                        data-testid="dropdown-tab-mobile"
                      >
                        {tabs.map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.key;
                          return (
                            <button
                              key={tab.key}
                              onClick={() => {
                                setActiveTab(tab.key);
                                setUserPage(0);
                                if (tab.key === "users") setKpiFilter(null);
                                setMobileTabOpen(false);
                              }}
                              className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors ${
                                isActive
                                  ? "bg-gradient-to-r from-brand-deep/10 to-brand-accent/10 text-brand-deep"
                                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                              }`}
                              data-testid={`tab-mobile-${tab.key}`}
                            >
                              <Icon
                                className={`h-4 w-4 ${isActive ? "text-brand-deep" : "text-slate-400 dark:text-slate-500"}`}
                              />
                              {tab.label}
                              {isActive && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-brand-deep" />}
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
            <div className="space-y-6" data-testid="panel-overview">
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                data-testid="trend-window-selector-row"
              >
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Trend window
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    All Overview sparklines, deltas, and charts use this window
                    {activityCoverage.count > 0 && ` · last ${activityCoverage.count} records`}
                    {activityCoverage.oldest ? ` since ${new Date(activityCoverage.oldest).toLocaleDateString()}` : ""}
                    {!trends.dataCoversWindow && trends.hasAnyActivity ? " · this range exceeds the loaded data" : ""}
                  </p>
                </div>
                <div
                  className="inline-flex gap-0.5 self-start rounded-lg border-2 border-brand-accent/40 bg-white p-1 shadow-sm dark:bg-slate-900"
                  role="tablist"
                  aria-label="Trend window"
                >
                  {(["1h", "24h", "7d", "all"] as TrendWindow[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="tab"
                      aria-selected={trendWindow === w}
                      onClick={() => setTrendWindow(w)}
                      className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] font-bold transition-all active:scale-95 ${trendWindow === w ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
                      data-testid={`button-trend-window-${w}`}
                    >
                      {w === "all" ? "All" : w}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-trend-strip"
              >
                <div className="flex items-center justify-between gap-3 border-b border-brand-accent/10 px-5 py-3">
                  <div>
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-trend-strip-title"
                    >
                      {trends.cfg.longLabel}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Calculation volume with failure-rate band{" "}
                      {!trends.dataCoversWindow && trends.hasAnyActivity ? "· data may be partial" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" /> {trends.cfg.bucketUnitLabel}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Failure rate
                    </span>
                  </div>
                </div>
                <div className="px-3 py-3" style={{ height: 140 }}>
                  {overviewActivityQuery.isLoading && !trends.hasAnyActivity ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  ) : !trends.hasAnyActivity ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-slate-400 dark:text-slate-500">
                      No activity in the {trends.cfg.longLabel.toLowerCase()}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trends.buckets.map((b) => ({
                          bucket: trends.cfg.bucketLabelFn(b.t),
                          ts: b.t,
                          total: b.total,
                          failureRate:
                            b.success + b.failed === 0 ? 0 : Math.round((b.failed / (b.success + b.failed)) * 100),
                        }))}
                        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#13d2e5" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#13d2e5" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="failRateGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          interval={trends.cfg.xAxisInterval}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 9, fill: "#fca5a5" }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                          domain={[0, 100]}
                          unit="%"
                        />
                        <RcTooltip
                          contentStyle={{
                            fontSize: 11,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            padding: "6px 8px",
                          }}
                          labelFormatter={(_, items) => {
                            const ts = items?.[0]?.payload?.ts as number | undefined;
                            return ts ? trends.cfg.bucketTooltipFn(ts) : "";
                          }}
                          formatter={(v: number, name: string) =>
                            name === "Failure rate" ? [`${v}%`, name] : [v, name]
                          }
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="total"
                          name={trends.cfg.bucketUnitLabel}
                          stroke="#13d2e5"
                          strokeWidth={1.5}
                          fill="url(#totalGrad)"
                        />
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="failureRate"
                          name="Failure rate"
                          stroke="#f87171"
                          strokeWidth={1}
                          fill="url(#failRateGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div
                  className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                  data-testid="card-pipeline-health"
                >
                  <div className="border-b border-brand-accent/10 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3
                          className="text-sm font-bold text-slate-900 dark:text-slate-100"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          Pipeline Health
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Platform-wide GrapeRank calculation health from /admin/users
                        </p>
                      </div>
                      <LiveBadge
                        updatedAt={overviewUsersQuery.dataUpdatedAt}
                        boosting={isBoostActive}
                        isFetching={overviewUsersQuery.isFetching || overviewActivityQuery.isFetching}
                      />
                    </div>
                  </div>
                  {overviewLoading && !pipelineMetrics ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  ) : pipelineMetrics ? (
                    <div className="space-y-5 p-5">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Success Rate
                          </span>
                          <div className="flex items-center gap-2">
                            {trends.hasAnyActivity && (
                              <MiniSparkline
                                data={trends.rateSeries}
                                timestamps={trends.bucketTimestamps}
                                color="#10b981"
                                height={20}
                                width={64}
                                valueLabel="success rate"
                                valueSuffix="%"
                              />
                            )}
                            <span
                              className={`text-lg font-bold tabular-nums ${pipelineMetrics.successRate >= 80 ? "text-emerald-600" : pipelineMetrics.successRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600"}`}
                            >
                              {pipelineMetrics.successRate}%
                            </span>
                          </div>
                        </div>
                        <div className="mb-1 flex justify-end">
                          <DeltaIndicator
                            delta={
                              trends.cmp.curSR !== null && trends.cmp.prevSR !== null
                                ? trends.cmp.curSR - trends.cmp.prevSR
                                : null
                            }
                            insufficient={!(trends.cmp.curSR !== null && trends.cmp.prevSR !== null)}
                            suffix=" pts"
                            label={trends.cfg.priorLabel}
                          />
                        </div>
                        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{
                              width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.successCount / pipelineMetrics.total) * 100 : 0}%`,
                            }}
                          />
                          <div
                            className="h-full bg-red-400 transition-all duration-500"
                            style={{
                              width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.failedCount / pipelineMetrics.total) * 100 : 0}%`,
                            }}
                          />
                          <div
                            className="h-full bg-slate-300 transition-all duration-500"
                            style={{
                              width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.pendingCount / pipelineMetrics.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center gap-4">
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {pipelineMetrics.successCount} success
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                            {pipelineMetrics.failedCount} failed
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" />
                            {pipelineMetrics.pendingCount} pending
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800/60">
                        <div className="rounded-xl border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Total Users
                          </p>
                          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatNumber(pipelineMetrics.total)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Total Calculations
                          </p>
                          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatNumber(pipelineMetrics.totalCalcs)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Avg Calcs / User
                          </p>
                          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {pipelineMetrics.avgCalcs}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Never Calculated
                          </p>
                          <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatNumber(pipelineMetrics.neverCalc)}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Throughput · {trends.cfg.windowPhrase}
                          </p>
                          <DeltaIndicator
                            delta={trends.hasPriorWindow ? trends.cmp.curTotal - trends.cmp.prevTotal : null}
                            insufficient={!trends.hasPriorWindow}
                            label={trends.cfg.priorLabel}
                          />
                        </div>
                        <div
                          className="rounded-xl border border-slate-100 bg-white/60 px-2 pb-1 pt-2 dark:border-slate-800/60 dark:bg-slate-900/60"
                          style={{ height: 110 }}
                          data-testid="chart-pipeline-throughput"
                        >
                          {!trends.hasAnyActivity ? (
                            <div className="flex h-full items-center justify-center text-[11px] text-slate-400 dark:text-slate-500">
                              No activity in {trends.cfg.windowPhrase}
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={trends.buckets.map((b) => ({
                                  bucket: trends.cfg.bucketLabelFn(b.t),
                                  ts: b.t,
                                  success: b.success,
                                  failed: b.failed,
                                }))}
                                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                              >
                                <XAxis
                                  dataKey="bucket"
                                  tick={{ fontSize: 9, fill: "#94a3b8" }}
                                  interval={trends.cfg.xAxisInterval}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  tick={{ fontSize: 9, fill: "#94a3b8" }}
                                  axisLine={false}
                                  tickLine={false}
                                  width={24}
                                  allowDecimals={false}
                                />
                                <RcTooltip
                                  contentStyle={{
                                    fontSize: 11,
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    padding: "6px 8px",
                                  }}
                                  labelFormatter={(_, items) => {
                                    const ts = items?.[0]?.payload?.ts as number | undefined;
                                    return ts ? trends.cfg.bucketTooltipFn(ts) : "";
                                  }}
                                />
                                <Bar
                                  dataKey="success"
                                  stackId="t"
                                  name="Success"
                                  fill="#10b981"
                                  radius={[2, 2, 0, 0]}
                                />
                                <Bar dataKey="failed" stackId="t" name="Failed" fill="#f87171" radius={[2, 2, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {pipelineMetrics.lastPlatformActivity && (
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/60">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">Last platform activity</span>
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {new Date(
                              pipelineMetrics.lastPlatformActivity.endsWith("Z")
                                ? pipelineMetrics.lastPlatformActivity
                                : pipelineMetrics.lastPlatformActivity + "Z",
                            ).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : overviewUsersQuery.isError ? (
                    <div className="p-8 text-center text-xs text-red-400">Failed to load pipeline data</div>
                  ) : (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                </div>

                <div
                  className="self-start overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                  data-testid="card-ta-adoption"
                >
                  <div className="border-b border-brand-accent/10 px-5 py-4">
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Trust Attestation & Throughput
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      TA adoption and recent calculation activity
                    </p>
                  </div>
                  {overviewLoading && !pipelineMetrics ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  ) : pipelineMetrics ? (
                    <div className="space-y-5 p-5">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            TA Success Rate
                          </span>
                          <span
                            className={`text-lg font-bold tabular-nums ${pipelineMetrics.taAdoptionRate >= 80 ? "text-emerald-600" : pipelineMetrics.taAdoptionRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600"}`}
                          >
                            {pipelineMetrics.taAdoptionRate}%
                          </span>
                        </div>
                        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full bg-brand-primary transition-all duration-500"
                            style={{
                              width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.taSuccessCount / pipelineMetrics.total) * 100 : 0}%`,
                            }}
                          />
                          <div
                            className="h-full bg-red-400 transition-all duration-500"
                            style={{
                              width: `${pipelineMetrics.total > 0 ? (pipelineMetrics.taFailedCount / pipelineMetrics.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center gap-4">
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-primary" />
                            {pipelineMetrics.taSuccessCount} published
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                            {pipelineMetrics.taFailedCount} failed
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                            {pipelineMetrics.withTaPubkey} with TA key
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Throughput · {trends.cfg.windowPhrase}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Successful
                            </p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {trends.cmp.curSuccess}
                            </p>
                          </div>
                          <div className="rounded-xl border border-red-100 bg-red-50/60 p-2.5 dark:border-red-500/25 dark:bg-red-500/10">
                            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400">Failed</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-red-700 dark:text-red-300">
                              {trends.cmp.curFailed}
                            </p>
                          </div>
                        </div>
                      </div>

                      {algoDistinct === 1 ? (
                        (() => {
                          const [algo, count] = Object.entries(pipelineMetrics.algoCounts)[0];
                          return (
                            <div
                              className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/60"
                              data-testid="row-algo-single"
                            >
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Algorithm
                              </span>
                              <span className="text-xs text-slate-700 dark:text-slate-200">
                                <span className="font-mono">{algo}</span>{" "}
                                <span className="text-slate-400 dark:text-slate-500">
                                  · {count} user{count !== 1 ? "s" : ""}
                                </span>
                              </span>
                            </div>
                          );
                        })()
                      ) : algoDistinct > 1 ? (
                        <div
                          className="border-t border-slate-100 pt-4 dark:border-slate-800/60"
                          data-testid="section-algo-distribution"
                        >
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Algorithm Distribution
                          </p>
                          <div className="space-y-1.5">
                            {Object.entries(pipelineMetrics.algoCounts)
                              .sort((a, b) => b[1] - a[1])
                              .map(([algo, count]) => (
                                <div key={algo} className="flex items-center justify-between">
                                  <span className="max-w-[180px] truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                                    {algo}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                      <div
                                        className="h-full rounded-full bg-brand-primary"
                                        style={{ width: `${(count / pipelineMetrics.total) * 100}%` }}
                                      />
                                    </div>
                                    <span className="w-8 text-right text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                                      {count}
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                </div>

                {(() => {
                  const failureWindowMs = trends.cfg.windowMs;
                  const failureNow = Date.now();
                  const failedItems = overviewAllActivity.filter((item) => {
                    if (!isItemFailed(item)) return false;
                    const t = parseActivityTs(item.updated_at);
                    if (!t) return false;
                    const age = failureNow - t;
                    return age >= 0 && age < failureWindowMs;
                  });
                  const groups = new Map<
                    string,
                    { count: number; latest: BrainstormRequestInstance; pubkeys: Set<string> }
                  >();
                  for (const item of failedItems) {
                    const key = normalizeErrorKey(extractErrorMessage(item)) + "|" + (getFailureStage(item) ?? "");
                    const existing = groups.get(key);
                    if (existing) {
                      existing.count += 1;
                      if (item.pubkey) existing.pubkeys.add(item.pubkey);
                      const latestT = new Date(
                        existing.latest.updated_at.endsWith("Z")
                          ? existing.latest.updated_at
                          : existing.latest.updated_at + "Z",
                      ).getTime();
                      const itemT = new Date(
                        item.updated_at.endsWith("Z") ? item.updated_at : item.updated_at + "Z",
                      ).getTime();
                      if (itemT > latestT) existing.latest = item;
                    } else {
                      groups.set(key, { count: 1, latest: item, pubkeys: new Set(item.pubkey ? [item.pubkey] : []) });
                    }
                  }
                  const sortedGroups = Array.from(groups.values())
                    .sort((a, b) => {
                      const at = new Date(
                        a.latest.updated_at.endsWith("Z") ? a.latest.updated_at : a.latest.updated_at + "Z",
                      ).getTime();
                      const bt = new Date(
                        b.latest.updated_at.endsWith("Z") ? b.latest.updated_at : b.latest.updated_at + "Z",
                      ).getTime();
                      if (bt !== at) return bt - at;
                      return b.count - a.count;
                    })
                    .slice(0, 8);
                  const totalFailures = failedItems.length;
                  const dataUnavailable =
                    overviewActivityQuery.isError ||
                    (!overviewActivityQuery.isSuccess && !overviewActivityQuery.isLoading);
                  return (
                    <div
                      className="overflow-hidden rounded-2xl border border-red-200/70 bg-card text-card-foreground shadow-sm dark:border-red-500/25 dark:shadow-none lg:col-span-2"
                      data-testid="card-recent-failures"
                    >
                      <div className="border-b border-red-100 px-5 py-4 dark:border-red-500/20">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3
                              className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              Recent Failures
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {totalFailures === 0
                                ? `No failures in ${trends.cfg.windowPhrase}.`
                                : `${totalFailures} failed request${totalFailures === 1 ? "" : "s"} in ${trends.cfg.windowPhrase}, grouped into ${sortedGroups.length} pattern${sortedGroups.length === 1 ? "" : "s"}.`}
                            </p>
                          </div>
                          <Chip
                            tone={totalFailures === 0 ? "emerald" : "red"}
                            className="px-2 py-1 font-bold tabular-nums"
                            data-testid="badge-failure-count"
                          >
                            {totalFailures}
                          </Chip>
                        </div>
                      </div>
                      <div className="p-5">
                        {overviewActivityQuery.isError ? (
                          <div
                            className="flex flex-col items-center justify-center py-6 text-center"
                            data-testid="failures-error-state"
                          >
                            <XCircle className="mb-2 h-8 w-8 text-red-400" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              Couldn't load failure data
                            </p>
                            <p className="mt-1 max-w-md text-[10px] text-slate-500 dark:text-slate-400">
                              {overviewActivityQuery.error instanceof Error
                                ? overviewActivityQuery.error.message
                                : "The /admin/activity endpoint did not respond. Failure status is unknown."}
                            </p>
                          </div>
                        ) : overviewLoading && totalFailures === 0 ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                          </div>
                        ) : dataUnavailable ? (
                          <div
                            className="flex flex-col items-center justify-center py-6 text-center"
                            data-testid="failures-unknown-state"
                          >
                            <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              Failure status unavailable
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                              Activity data has not loaded yet.
                            </p>
                          </div>
                        ) : totalFailures === 0 ? (
                          <div
                            className="flex flex-col items-center justify-center py-6 text-center"
                            data-testid="failures-empty-state"
                          >
                            <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              All recent requests succeeded
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                              No errors found in the latest activity feed.
                            </p>
                          </div>
                        ) : (
                          <ul className="space-y-2.5" data-testid="list-recent-failures">
                            {sortedGroups.map((g, idx) => {
                              const stage = getFailureStage(g.latest) ?? "Pipeline";
                              const errMsg = extractErrorMessage(g.latest);
                              const userCount = g.pubkeys.size;
                              return (
                                <li
                                  key={idx}
                                  className="rounded-lg border border-red-200 bg-white/70 p-3 dark:border-red-500/25 dark:bg-slate-900/70"
                                  data-testid={`failure-group-${idx}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                    <div className="min-w-0 flex-1">
                                      <div className="mb-1 flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                                          {stage}
                                        </span>
                                        {g.count > 1 && (
                                          <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300">
                                            {g.count}× occurrences
                                          </span>
                                        )}
                                        {userCount > 0 && (
                                          <span className="text-[9px] text-slate-500 dark:text-slate-400">
                                            {userCount} user{userCount === 1 ? "" : "s"} affected
                                          </span>
                                        )}
                                        <span className="ml-auto text-[9px] text-slate-400 dark:text-slate-500">
                                          {timeAgo(g.latest.updated_at) || formatTimestamp(g.latest.updated_at)}
                                        </span>
                                      </div>
                                      <p className="break-words font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
                                        {truncateError(errMsg, 220)}
                                      </p>
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
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-deep hover:text-brand-accent"
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
                                                toast({
                                                  title: "Request Queued",
                                                  description: `Re-triggered GrapeRank for ${pk.slice(0, 12)}...`,
                                                });
                                                queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                                                queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                                triggerRefreshBoost();
                                              } catch (err: unknown) {
                                                const msg = err instanceof Error ? err.message : "Unknown error";
                                                toast({
                                                  title: "Re-trigger Failed",
                                                  description: msg,
                                                  variant: "destructive",
                                                });
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

                <div
                  className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2"
                  data-testid="card-quick-stats"
                >
                  <div className="border-b border-brand-accent/10 px-5 py-4">
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      System Endpoints
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">API connectivity</p>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {(() => {
                        const baseUrl = env.VITE_API_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");
                        return [
                          // TODO: replace with a meaningful health probe (dedicated endpoint?)
                          // { endpoint: "/user/self", label: "User Self", status: selfQuery.isSuccess ? "connected" as const : selfQuery.isError ? "disconnected" as const : "degraded" as const },
                          {
                            endpoint: "/user/graperankResult",
                            label: "GrapeRank Result",
                            status: grapeRankQuery.isSuccess
                              ? ("connected" as const)
                              : grapeRankQuery.isError
                                ? ("disconnected" as const)
                                : ("degraded" as const),
                          },
                          {
                            endpoint: "/admin/users",
                            label: "Admin Users",
                            status: adminUsersQuery.isSuccess
                              ? ("connected" as const)
                              : adminUsersQuery.isError
                                ? ("disconnected" as const)
                                : ("degraded" as const),
                          },
                          {
                            endpoint: "/admin/activity",
                            label: "Admin Activity",
                            status: adminActivityQuery.isSuccess
                              ? ("connected" as const)
                              : adminActivityQuery.isError
                                ? ("disconnected" as const)
                                : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError
                                  ? ("connected" as const)
                                  : ("degraded" as const),
                          },
                        ].map((ep) => (
                          <div
                            key={ep.endpoint}
                            className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid={`endpoint-${ep.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{ep.label}</p>
                              <p
                                className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500"
                                title={`${baseUrl}${ep.endpoint}`}
                              >
                                {baseUrl}
                                {ep.endpoint}
                              </p>
                            </div>
                            <StatusBadge status={ep.status} />
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <>
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="panel-users"
              >
                <div className="flex flex-col gap-3 border-b border-brand-accent/10 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      User Database
                    </h3>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {(activeNameSearch ? filteredUsersList.length : adminUsersTotal).toLocaleString()} users
                        {activeNameSearch && userSearch.trim() ? " (filtered)" : ""}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        Page {userPage + 1} of {totalPages}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        Source: /admin/users
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <input
                        type="text"
                        placeholder="Search name, pubkey, npub..."
                        value={userSearch}
                        onChange={(e) => {
                          setUserSearch(e.target.value);
                          setUserPage(0);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 pr-7 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                        data-testid="input-user-search"
                      />
                      {userSearch && (
                        <button
                          onClick={() => {
                            setUserSearch("");
                            setDebouncedSearch("");
                            setUserPage(0);
                            setHighlightedPubkey(null);
                            setExpandedRows(new Set());
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          data-testid="button-clear-search"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <Select
                      value={daysFilter.toString()}
                      onValueChange={(val) => {
                        setDaysFilter(parseInt(val, 10));
                        setUserPage(0);
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-28 rounded-xl border-slate-200 text-xs dark:border-slate-800"
                        data-testid="select-days-filter"
                      >
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
                      <SelectTrigger
                        className="h-8 w-20 rounded-xl border-slate-200 text-xs dark:border-slate-800"
                        data-testid="select-page-size"
                      >
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
                      onClick={() => {
                        setLookupOpen(true);
                        setLookupMode("lookup");
                        setLookupInput("");
                        setLookupResult(null);
                        setLookupError(null);
                        setLookupNameResults([]);
                        setOnboardSearch("");
                        setOnboardResults([]);
                        setOnboardError(null);
                        setOnboardQueue([]);
                        setBulkPasteOpen(false);
                        setBulkPasteInput("");
                        setOnboardProgress(null);
                      }}
                      className="no-default-hover-elevate no-default-active-elevate h-8 gap-1.5 text-xs"
                      data-testid="button-lookup-pubkey"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Lookup / Onboard
                    </Button>
                  </div>

                  <Dialog
                    open={lookupOpen}
                    onOpenChange={(open) => {
                      if (onboardingAll) return;
                      setLookupOpen(open);
                      if (!open) {
                        setLookupResult(null);
                        setLookupError(null);
                        setOnboardResults([]);
                        setOnboardError(null);
                        setOnboardProgress(null);
                      }
                    }}
                  >
                    <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          {lookupMode === "lookup" ? (
                            <Search className="h-5 w-5 text-brand-deep" />
                          ) : (
                            <UserPlus className="h-5 w-5 text-brand-deep" />
                          )}
                          {lookupMode === "lookup" ? "Lookup User" : "Onboard User"}
                        </DialogTitle>
                        <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
                          {lookupMode === "lookup"
                            ? "Find a user by name, pubkey, or npub and jump to their row in the table."
                            : "Search Nostr by name to find and onboard a user into Brainstorm."}
                        </DialogDescription>
                      </DialogHeader>

                      <div
                        className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800"
                        data-testid="toggle-lookup-mode"
                      >
                        <button
                          onClick={() => {
                            setLookupMode("lookup");
                            setLookupResult(null);
                            setLookupError(null);
                            setLookupNameResults([]);
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${lookupMode === "lookup" ? "border border-slate-200 bg-white text-brand-deep shadow-sm dark:border-slate-800 dark:bg-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
                          data-testid="button-mode-lookup"
                        >
                          <Search className="h-3 w-3" />
                          Lookup
                        </button>
                        <button
                          onClick={() => {
                            setLookupMode("onboard");
                            setLookupResult(null);
                            setLookupError(null);
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${lookupMode === "onboard" ? "border border-slate-200 bg-white text-brand-deep shadow-sm dark:border-slate-800 dark:bg-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
                          data-testid="button-mode-onboard"
                        >
                          <UserPlus className="h-3 w-3" />
                          Onboard
                        </button>
                      </div>

                      {lookupMode === "lookup" ? (
                        <div className="space-y-3 overflow-hidden pt-1">
                          <div className="flex min-w-0 gap-2">
                            <input
                              type="text"
                              placeholder="Name, npub, or hex pubkey"
                              value={lookupInput}
                              onChange={(e) => {
                                setLookupInput(e.target.value);
                                setLookupError(null);
                                setLookupNameResults([]);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !lookupRunning) handleLookupPubkey();
                              }}
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                              data-testid="input-lookup-pubkey"
                            />
                            <Button
                              size="sm"
                              onClick={handleLookupPubkey}
                              disabled={lookupRunning || !lookupInput.trim()}
                              className="no-default-hover-elevate no-default-active-elevate shrink-0 gap-1.5 text-xs"
                              data-testid="button-submit-lookup"
                            >
                              {lookupRunning ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Search className="h-3.5 w-3.5" />
                              )}
                              {lookupRunning ? "..." : "Lookup"}
                            </Button>
                          </div>

                          {lookupNameResults.length > 0 && (
                            <div className="space-y-1" data-testid="lookup-name-results">
                              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                {lookupNameResults.length} user{lookupNameResults.length !== 1 ? "s" : ""} found
                              </p>
                              <div className="-mx-1 max-h-[200px] space-y-1 overflow-y-auto px-1">
                                {lookupNameResults.map((u) => {
                                  const npub = nip19.npubEncode(u.pubkey);
                                  return (
                                    <div
                                      key={u.pubkey}
                                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 transition-all hover:border-brand-accent/30 hover:bg-brand-primary/10 dark:border-slate-800 dark:bg-slate-900/80"
                                      onClick={() => jumpToUser(u.pubkey, u.name)}
                                      data-testid={`lookup-name-result-${u.pubkey.slice(0, 8)}`}
                                    >
                                      {u.picture ? (
                                        <img
                                          src={u.picture}
                                          alt=""
                                          className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
                                        />
                                      ) : (
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
                                          <User className="h-3.5 w-3.5 text-brand-deep/60" />
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                                          {u.name || "Unknown"}
                                        </p>
                                        <p className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                                          {npub.slice(0, 20)}...{npub.slice(-6)}
                                        </p>
                                      </div>
                                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 overflow-hidden pt-1">
                          <div className="flex min-w-0 gap-2">
                            <input
                              type="text"
                              placeholder="Search by name..."
                              value={onboardSearch}
                              onChange={(e) => {
                                setOnboardSearch(e.target.value);
                                setOnboardError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !onboardSearching) handleOnboardSearch();
                              }}
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                              data-testid="input-onboard-search"
                              disabled={onboardingAll}
                            />
                            <Button
                              size="sm"
                              onClick={handleOnboardSearch}
                              disabled={onboardSearching || !onboardSearch.trim() || onboardingAll}
                              className="no-default-hover-elevate no-default-active-elevate shrink-0 gap-1.5 text-xs"
                              data-testid="button-submit-onboard-search"
                            >
                              {onboardSearching ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Search className="h-3.5 w-3.5" />
                              )}
                              {onboardSearching ? "..." : "Search"}
                            </Button>
                          </div>
                          <p className="-mt-1 flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                            <Globe className="h-2.5 w-2.5 shrink-0" />
                            Powered by Brainstorm WoT search
                          </p>

                          {onboardResults.length > 0 && !onboardingAll && (
                            <div
                              className="-mx-1 max-h-[180px] space-y-1 overflow-y-auto overflow-x-hidden px-1"
                              data-testid="onboard-results"
                            >
                              {onboardResults.map((profile) => {
                                const displayName =
                                  profile.displayName || profile.name || profile.npub.slice(0, 16) + "...";
                                const isQueued = onboardQueue.some((p) => p.pubkey === profile.pubkey);
                                return (
                                  <div
                                    key={profile.pubkey}
                                    className={`flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border p-2 transition-all ${isQueued ? "border-brand-accent/40 bg-brand-primary/10" : "border-slate-200 bg-white/80 hover:border-brand-accent/20 hover:bg-brand-primary/10 dark:border-slate-800 dark:bg-slate-900/80"}`}
                                    onClick={() =>
                                      isQueued ? removeFromOnboardQueue(profile.pubkey) : addToOnboardQueue(profile)
                                    }
                                    data-testid={`onboard-result-${profile.pubkey.slice(0, 8)}`}
                                  >
                                    <div
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${isQueued ? "border-brand-deep bg-brand-deep" : "border-slate-300 dark:border-slate-700"}`}
                                    >
                                      {isQueued && <CheckCircle2 className="h-3 w-3 text-white" />}
                                    </div>
                                    {profile.picture ? (
                                      <img
                                        src={profile.picture}
                                        alt=""
                                        className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
                                        <Users className="h-3 w-3 text-brand-deep/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                      <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                                        {displayName}
                                      </p>
                                      <p className="truncate font-mono text-[9px] text-slate-400 dark:text-slate-500">
                                        {profile.npub.slice(0, 16)}...{profile.npub.slice(-4)}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {!onboardingAll && (
                            <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
                              <button
                                onClick={() => setBulkPasteOpen((prev) => !prev)}
                                className="flex w-full items-center gap-1.5 text-[10px] font-semibold text-slate-500 transition-colors hover:text-brand-deep dark:text-slate-400"
                                data-testid="button-toggle-bulk-paste"
                              >
                                <FileText className="h-3 w-3" />
                                Import by npub list
                                <ChevronDown
                                  className={`ml-auto h-3 w-3 transition-transform ${bulkPasteOpen ? "rotate-180" : ""}`}
                                />
                              </button>
                              {bulkPasteOpen && (
                                <div className="mt-2 space-y-2">
                                  <textarea
                                    placeholder={"Paste npubs or hex pubkeys\nOne per line or comma-separated"}
                                    value={bulkPasteInput}
                                    onChange={(e) => setBulkPasteInput(e.target.value)}
                                    className="h-16 w-full resize-none rounded-lg border border-slate-200 bg-white/80 px-3 py-2 font-mono text-[10px] focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                                    data-testid="textarea-bulk-paste"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleBulkPasteAdd}
                                    disabled={!bulkPasteInput.trim()}
                                    className="no-default-hover-elevate no-default-active-elevate h-7 w-full gap-1 text-[10px]"
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
                            <div
                              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-500/25 dark:bg-red-500/10"
                              data-testid="onboard-error"
                            >
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                              <p className="text-[10px] text-red-700 dark:text-red-300">{onboardError}</p>
                            </div>
                          )}

                          {onboardQueue.length > 0 && (
                            <div
                              className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800"
                              data-testid="onboard-queue"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Onboard Queue ({onboardQueue.length})
                                </span>
                                {!onboardingAll && (
                                  <button
                                    onClick={() => setOnboardQueue([])}
                                    className="text-[10px] text-slate-400 transition-colors hover:text-red-500 dark:text-slate-500"
                                    data-testid="button-clear-queue"
                                  >
                                    Clear all
                                  </button>
                                )}
                              </div>
                              <div className="flex max-h-[100px] flex-wrap gap-1.5 overflow-y-auto overflow-x-hidden">
                                {onboardQueue.map((profile) => {
                                  const displayName =
                                    profile.displayName || profile.name || profile.npub.slice(0, 10) + "...";
                                  const progressItem = onboardProgress?.results.find(
                                    (r) => r.pubkey === profile.pubkey,
                                  );
                                  return (
                                    <div
                                      key={profile.pubkey}
                                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] transition-all ${
                                        progressItem
                                          ? progressItem.success
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                          : "border-brand-accent/20 bg-brand-primary/10 text-slate-700 dark:bg-brand-primary/10 dark:text-slate-200"
                                      }`}
                                      data-testid={`queue-item-${profile.pubkey.slice(0, 8)}`}
                                    >
                                      {profile.picture ? (
                                        <img
                                          src={profile.picture}
                                          alt=""
                                          className="h-4 w-4 shrink-0 rounded-full object-cover"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                          }}
                                        />
                                      ) : null}
                                      <span className="max-w-[80px] truncate font-medium">{displayName}</span>
                                      {progressItem ? (
                                        progressItem.success ? (
                                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                                        ) : (
                                          <XCircle className="h-3 w-3 shrink-0 text-red-500" />
                                        )
                                      ) : !onboardingAll ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeFromOnboardQueue(profile.pubkey);
                                          }}
                                          className="shrink-0 transition-colors hover:text-red-500"
                                          data-testid={`button-remove-${profile.pubkey.slice(0, 8)}`}
                                        >
                                          <XCircle className="h-3 w-3" />
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>

                              {onboardingAll && onboardProgress && (
                                <div className="space-y-1.5">
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-brand-accent to-brand-deep transition-all duration-300"
                                      style={{ width: `${(onboardProgress.done / onboardProgress.total) * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">
                                    {onboardProgress.done} of {onboardProgress.total} processed
                                  </p>
                                </div>
                              )}

                              {!onboardingAll && !onboardProgress && (
                                <Button
                                  size="sm"
                                  onClick={handleOnboardAll}
                                  className="no-default-hover-elevate no-default-active-elevate h-8 w-full gap-1.5 text-xs"
                                  data-testid="button-onboard-all"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Onboard All ({onboardQueue.length})
                                </Button>
                              )}

                              {onboardProgress && !onboardingAll && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                                      {onboardProgress.results.filter((r) => r.success).length} onboarded
                                      {onboardProgress.results.filter((r) => !r.success).length > 0 &&
                                        `, ${onboardProgress.results.filter((r) => !r.success).length} failed`}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {lookupError && lookupMode === "lookup" && (
                        <div
                          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10"
                          data-testid="lookup-error"
                        >
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                          <p className="text-xs text-red-700 dark:text-red-300">{lookupError}</p>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>

                {(selectedUserPubkeys.size > 0 || (bulkLastResult && bulkLastResult.source !== "activity")) && (
                  <div className="space-y-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800/60 sm:px-5">
                    {selectedUserPubkeys.size > 0 &&
                      (() => {
                        const dedupePubkeys = Array.from(selectedUserPubkeys);
                        const liveCount = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
                          : 0;
                        const liveTotal = bulkRunning ? bulkStatuses.size : 0;
                        const liveFailed = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length
                          : 0;
                        const clientFiltered = activeNameSearch || !!kpiFilter;
                        const matchingTotal = clientFiltered ? filteredUsersList.length : adminUsersTotal;
                        const visibleCount = (
                          activeNameSearch
                            ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                            : filteredUsersList
                        ).length;
                        const filtersActive = activeNameSearch || !!debouncedSearch || !!kpiFilter || daysFilter !== 30;
                        const canSelectAllMatching = filtersActive && matchingTotal > visibleCount;
                        const matchingLabelSuffix = kpiFilter && !activeNameSearch ? " in cache" : "";
                        const handleSelectAllMatching = async () => {
                          const cap = Math.min(matchingTotal, SELECT_ALL_MATCHING_CAP);
                          if (clientFiltered) {
                            setSelectedUserPubkeys(new Set(filteredUsersList.slice(0, cap).map((u) => u.pubkey)));
                            return;
                          }
                          try {
                            setFetchingMatching(true);
                            const resp = await apiClient.getAdminUsers({
                              search: debouncedSearch || undefined,
                              sort: userSort.key,
                              order: userSort.dir,
                              days: daysFilter,
                              page: 1,
                              size: cap,
                            });
                            setSelectedUserPubkeys(
                              new Set((resp.items ?? []).slice(0, cap).map((u: { pubkey: string }) => u.pubkey)),
                            );
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : "Unknown error";
                            toast({
                              title: "Failed to fetch matching users",
                              description: msg,
                              variant: "destructive",
                            });
                          } finally {
                            setFetchingMatching(false);
                          }
                        };
                        return (
                          <div
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10"
                            data-testid="bulk-toolbar-users"
                          >
                            <CheckSquare className="h-4 w-4 text-brand-deep" />
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {dedupePubkeys.length} selected
                            </span>
                            {canSelectAllMatching && (
                              <button
                                onClick={handleSelectAllMatching}
                                disabled={bulkRunning || fetchingMatching}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-deep hover:underline disabled:opacity-40"
                                data-testid="button-bulk-select-all-matching-users"
                              >
                                {fetchingMatching && <Loader2 className="h-3 w-3 animate-spin" />}
                                Select all {Math.min(matchingTotal, SELECT_ALL_MATCHING_CAP)} matching
                                {matchingLabelSuffix}
                                {matchingTotal > SELECT_ALL_MATCHING_CAP
                                  ? ` (capped at ${SELECT_ALL_MATCHING_CAP})`
                                  : ""}
                              </button>
                            )}
                            {bulkRunning && (
                              <span
                                className="text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                data-testid="bulk-progress-users"
                              >
                                {liveCount} of {liveTotal} triggered… {liveFailed > 0 ? `${liveFailed} failed` : ""}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => setBulkConfirm({ pubkeys: dedupePubkeys, source: "users" })}
                                disabled={bulkRunning || dedupePubkeys.length === 0}
                                className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                                data-testid="button-bulk-retrigger-users"
                              >
                                {bulkRunning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Re-trigger {dedupePubkeys.length} user{dedupePubkeys.length !== 1 ? "s" : ""}
                              </Button>
                              <button
                                onClick={() => setSelectedUserPubkeys(new Set())}
                                disabled={bulkRunning}
                                className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                                data-testid="button-bulk-clear-users"
                              >
                                Clear selection
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    {bulkLastResult && bulkLastResult.source === "users" && (
                      <div
                        className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${bulkLastResult.failures.length === 0 ? "border-emerald-300/50 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-300/50 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"}`}
                        data-testid="bulk-result-users"
                      >
                        {bulkLastResult.failures.length === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {bulkLastResult.successes.length} succeeded · {bulkLastResult.failures.length} failed
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          {bulkLastResult.failures.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setBulkConfirm({
                                  pubkeys: bulkLastResult.failures.map((f) => f.pubkey),
                                  source: "retry",
                                })
                              }
                              disabled={bulkRunning}
                              className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 text-xs"
                              data-testid="button-bulk-retry-failed-users"
                            >
                              <RefreshCw className="h-3 w-3" /> Retry failed only
                            </Button>
                          )}
                          <button
                            onClick={() => setBulkLastResult(null)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                            data-testid="button-bulk-dismiss-users"
                          >
                            Dismiss
                          </button>
                        </div>
                        {bulkLastResult.failures.length > 0 && (
                          <details className="mt-1.5 basis-full">
                            <summary className="cursor-pointer select-none text-[10px] font-semibold text-red-700 dark:text-red-300">
                              View failure details ({bulkLastResult.failures.length})
                            </summary>
                            <ul
                              className="mt-1.5 max-h-40 space-y-0.5 overflow-auto"
                              data-testid="list-bulk-errors-users"
                            >
                              {bulkLastResult.failures.map((f, i) => (
                                <li
                                  key={`${f.pubkey}-${i}`}
                                  className="truncate font-mono text-[10px] text-red-900/90 dark:text-red-300/90"
                                  title={`${f.pubkey}: ${f.error}`}
                                >
                                  <span className="text-red-600 dark:text-red-400">{f.pubkey.slice(0, 12)}…</span> —{" "}
                                  {f.error}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {kpiFilter && (
                  <div
                    className="flex items-center gap-2 border-b border-brand-accent/10 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10 sm:px-5"
                    data-testid="kpi-filter-badge"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Filtered:
                    </span>
                    <Chip
                      size="sm"
                      tone={
                        kpiFilter === "scored"
                          ? "emerald"
                          : kpiFilter === "sp_adopters"
                            ? "indigo"
                            : kpiFilter === "failed"
                              ? "red"
                              : "amber"
                      }
                      className="gap-1.5 px-2.5 py-1 font-bold uppercase tracking-wider"
                    >
                      {kpiFilter === "scored" && (
                        <>
                          <UserCheck className="h-3 w-3" /> Scored Users
                        </>
                      )}
                      {kpiFilter === "sp_adopters" && (
                        <>
                          <Shield className="h-3 w-3" /> SP Adopters
                        </>
                      )}
                      {kpiFilter === "queue" && (
                        <>
                          <Clock className="h-3 w-3" /> In Queue
                        </>
                      )}
                      {kpiFilter === "failed" && (
                        <>
                          <AlertTriangle className="h-3 w-3" /> Failed
                        </>
                      )}
                    </Chip>
                    <button
                      onClick={() => setKpiFilter(null)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
                      data-testid="button-clear-kpi-filter"
                    >
                      <XCircle className="h-3 w-3" />
                      Clear filter
                    </button>
                  </div>
                )}

                <div className="hidden md:block">
                  <ScrollableTable>
                    <table
                      className="w-full min-w-[900px] border-collapse border border-slate-200 text-left dark:border-slate-800"
                      data-testid="table-users"
                    >
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                          <th className="sticky left-0 z-20 w-8 border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle dark:border-slate-800 dark:bg-slate-900">
                            {(() => {
                              const visible = activeNameSearch
                                ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                                : filteredUsersList;
                              const visiblePks = visible.map((u) => u.pubkey);
                              const selectedCount = visiblePks.filter((pk) => selectedUserPubkeys.has(pk)).length;
                              const allSelected = visiblePks.length > 0 && selectedCount === visiblePks.length;
                              const someSelected = selectedCount > 0 && !allSelected;
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (allSelected) {
                                      setSelectedUserPubkeys((prev) => {
                                        const next = new Set(prev);
                                        for (const pk of visiblePks) next.delete(pk);
                                        return next;
                                      });
                                    } else {
                                      setSelectedUserPubkeys((prev) => {
                                        const next = new Set(prev);
                                        for (const pk of visiblePks) next.add(pk);
                                        return next;
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center justify-center"
                                  title={allSelected ? "Deselect all on page" : "Select all on page"}
                                  data-testid="checkbox-users-select-all"
                                  disabled={visiblePks.length === 0}
                                >
                                  {allSelected ? (
                                    <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                  ) : someSelected ? (
                                    <MinusSquare className="h-3.5 w-3.5 text-brand-deep" />
                                  ) : (
                                    <Square
                                      className={`h-3.5 w-3.5 ${visiblePks.length ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                                    />
                                  )}
                                </button>
                              );
                            })()}
                          </th>
                          <th className="sticky left-8 z-20 w-12 border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle dark:border-slate-800 dark:bg-slate-900"></th>
                          <th className="sticky left-20 z-20 whitespace-nowrap border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle shadow-[8px_0_10px_-8px_rgba(15,23,42,0.15)] dark:border-slate-800 dark:bg-slate-900">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Profile
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <SortHeader label="Pubkey" sortKey="pubkey" currentSort={userSort} onSort={handleSort} />
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              TA Pubkey
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Status
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              TA Status
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Algorithm
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <SortHeader
                              label="# Calcs"
                              sortKey="times_calculated"
                              currentSort={userSort}
                              onSort={handleSort}
                            />
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <SortHeader
                              label="Last Triggered"
                              sortKey="last_triggered"
                              currentSort={userSort}
                              onSort={handleSort}
                            />
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <SortHeader
                              label="Last Updated"
                              sortKey="last_updated"
                              currentSort={userSort}
                              onSort={handleSort}
                            />
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Tier
                            </span>
                          </th>
                          <th className="sticky right-0 z-20 whitespace-nowrap bg-slate-50 px-2 py-2.5 text-center align-middle shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)] dark:bg-slate-900">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Actions
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                            >
                              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                              Loading users...
                            </td>
                          </tr>
                        ) : adminUsersQuery.isError ? (
                          <tr>
                            <td colSpan={13} className="px-5 py-10 text-center text-sm text-red-400">
                              Failed to load users. Check your admin access.
                            </td>
                          </tr>
                        ) : adminUsersList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                            >
                              {userSearch ? "No users match your search" : "No user data available"}
                            </td>
                          </tr>
                        ) : filteredUsersList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                            >
                              No users match the current filter
                            </td>
                          </tr>
                        ) : (
                          (activeNameSearch
                            ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                            : filteredUsersList
                          ).map((u, i) => {
                            const isExpanded = expandedRows.has(u.pubkey);
                            const prof = userProfiles.get(u.pubkey);
                            let npub: string;
                            try {
                              npub = nip19.npubEncode(u.pubkey);
                            } catch {
                              npub = u.pubkey;
                            }
                            const isTriggering = triggeringPubkeys.has(u.pubkey);
                            return (
                              <Fragment key={u.pubkey}>
                                <tr
                                  className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/60 ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : ""}`}
                                  onClick={() => {
                                    setExpandedRows((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(u.pubkey)) next.delete(u.pubkey);
                                      else next.add(u.pubkey);
                                      return next;
                                    });
                                  }}
                                  data-testid={`row-user-${i}`}
                                >
                                  <td
                                    className="sticky left-0 z-10 w-8 border-r border-slate-100 bg-white px-2 py-2.5 group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedUserPubkeys((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(u.pubkey)) next.delete(u.pubkey);
                                        else next.add(u.pubkey);
                                        return next;
                                      });
                                    }}
                                  >
                                    {(() => {
                                      const isSelected = selectedUserPubkeys.has(u.pubkey);
                                      const bs = bulkStatuses.get(u.pubkey);
                                      return (
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center"
                                          data-testid={`checkbox-user-${i}`}
                                          title={isSelected ? "Deselect" : "Select"}
                                        >
                                          {bs === "running" ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                                          ) : bs === "success" ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                          ) : bs === "failed" ? (
                                            <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                          ) : isSelected ? (
                                            <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                          ) : (
                                            <Square className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </td>
                                  <td className="sticky left-8 z-10 w-12 border-r border-slate-100 bg-white px-2 py-2.5 group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      {(() => {
                                        const health = getUserHealth(
                                          u.latest_status,
                                          u.latest_ta_status,
                                          u.times_calculated,
                                        );
                                        const colors = {
                                          green: "bg-emerald-400",
                                          amber: "bg-amber-400",
                                          red: "bg-red-400",
                                          gray: "bg-slate-300",
                                        };
                                        const titles = {
                                          green: "Healthy",
                                          amber: "Partial failure",
                                          red: "Failing",
                                          gray: "No calculations",
                                        };
                                        return (
                                          <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${colors[health]}`}
                                            title={titles[health]}
                                            data-testid={`health-dot-${i}`}
                                          />
                                        );
                                      })()}
                                      <ChevronDown
                                        className={`h-3 w-3 text-slate-400 transition-transform dark:text-slate-500 ${isExpanded ? "rotate-180" : ""}`}
                                      />
                                    </div>
                                  </td>
                                  <td
                                    className="sticky left-20 z-10 border-r border-slate-100 bg-white px-2 py-2.5 shadow-[8px_0_10px_-8px_rgba(15,23,42,0.15)] group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900"
                                    data-testid={`cell-profile-${i}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Avatar className="h-6 w-6 shrink-0">
                                        {prof?.picture ? (
                                          <AvatarImage
                                            src={prof.picture}
                                            alt={prof.name || "User"}
                                            className="object-cover"
                                          />
                                        ) : null}
                                        <AvatarFallback className="border border-slate-200 bg-slate-100 text-[9px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                                          {prof?.name?.charAt(0)?.toUpperCase() || (
                                            <Users className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                                          )}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="block max-w-[90px] truncate text-[9px] font-medium text-slate-700 dark:text-slate-200">
                                        {prof?.name || npub.slice(0, 12) + "..."}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono text-[8px] text-brand-primary/80">
                                          {npub.slice(0, 12)}...{npub.slice(-4)}
                                        </span>
                                        <CopyButton text={npub} />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono text-[7px] text-slate-400 dark:text-slate-500">
                                          {u.pubkey.slice(0, 8)}...{u.pubkey.slice(-4)}
                                        </span>
                                        <CopyButton text={u.pubkey} />
                                      </div>
                                    </div>
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-ta-pubkey-${i}`}
                                  >
                                    {u.ta_pubkey ? (
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono text-[8px] text-emerald-600 dark:text-emerald-400">
                                          {u.ta_pubkey.slice(0, 10)}...{u.ta_pubkey.slice(-4)}
                                        </span>
                                        <CopyButton text={u.ta_pubkey} />
                                      </div>
                                    ) : (
                                      <span className="text-[8px] italic text-slate-300 dark:text-slate-600">none</span>
                                    )}
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-status-${i}`}
                                  >
                                    {u.latest_status ? (
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-semibold ${
                                            u.latest_status.toLowerCase() === "success"
                                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                              : isFailedStatus(u.latest_status)
                                                ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                                : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                          }`}
                                        >
                                          {u.latest_status}
                                        </span>
                                        {isFailedStatus(u.latest_status) && (
                                          <span
                                            title="Calculation failed — click row to view error"
                                            data-testid={`icon-status-failed-${i}`}
                                          >
                                            <AlertTriangle className="h-3 w-3 text-red-500" />
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[8px] italic text-slate-400 dark:text-slate-500">
                                        Pending
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-ta-status-${i}`}
                                  >
                                    {u.latest_ta_status ? (
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-semibold ${
                                            u.latest_ta_status.toLowerCase() === "success"
                                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                              : isFailedStatus(u.latest_ta_status)
                                                ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                                : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                          }`}
                                        >
                                          {u.latest_ta_status}
                                        </span>
                                        {isFailedStatus(u.latest_ta_status) && (
                                          <span
                                            title="Trust Attestation failed — click row to view error"
                                            data-testid={`icon-ta-status-failed-${i}`}
                                          >
                                            <AlertTriangle className="h-3 w-3 text-red-500" />
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[8px] italic text-slate-400 dark:text-slate-500">
                                        Pending
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-algorithm-${i}`}
                                  >
                                    {u.latest_algorithm ? (
                                      <span className="font-mono text-[9px] text-slate-600 dark:text-slate-300">
                                        {u.latest_algorithm}
                                      </span>
                                    ) : (
                                      <span className="text-[8px] italic text-slate-400 dark:text-slate-500">N/A</span>
                                    )}
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-times-calc-${i}`}
                                  >
                                    <span className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                                      {u.times_calculated}
                                    </span>
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-last-triggered-${i}`}
                                  >
                                    <div>
                                      <span className="block text-[9px] text-slate-600 dark:text-slate-300">
                                        {formatTimestamp(u.last_triggered)}
                                      </span>
                                      {timeAgo(u.last_triggered) && (
                                        <span className="text-[8px] text-slate-400 dark:text-slate-500">
                                          {timeAgo(u.last_triggered)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-last-updated-${i}`}
                                  >
                                    <div>
                                      <span className="block text-[9px] text-slate-600 dark:text-slate-300">
                                        {formatTimestamp(u.last_updated)}
                                      </span>
                                      {timeAgo(u.last_updated) && (
                                        <span className="text-[8px] text-slate-400 dark:text-slate-500">
                                          {timeAgo(u.last_updated)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {schedulingPolicies.length > 0 ? (
                                      <UserTierPicker
                                        pubkey={u.pubkey}
                                        schedulingId={u.scheduling_id}
                                        schedulingName={u.scheduling_name}
                                        policies={schedulingPolicies}
                                        displayName={prof?.name}
                                        picture={prof?.picture}
                                      />
                                    ) : (
                                      <span className="text-[9px] text-slate-500 dark:text-slate-400">
                                        {u.scheduling_name}
                                      </span>
                                    )}
                                  </td>
                                  <td className="sticky right-0 z-10 bg-white px-2 py-2.5 text-center shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-900">
                                    <UserActionsMenu
                                      pubkey={u.pubkey}
                                      triggering={isTriggering}
                                      triggerDisabled={bulkRunning || bulkStatuses.get(u.pubkey) === "running"}
                                      onTrigger={() => setTriggerConfirmPubkey(u.pubkey)}
                                      onView={() => {
                                        window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                                        navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                                      }}
                                      onPublishTrustedLists={() => {
                                        setTrustedListsObserver(u.pubkey);
                                        setActiveTab("trusted-lists");
                                        window.scrollTo({ top: 0 });
                                      }}
                                      testIdSuffix={i}
                                    />
                                  </td>
                                </tr>
                                {(isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status)) &&
                                  !isExpanded && (
                                    <tr
                                      className="border-b border-red-100 bg-red-50/40 dark:border-red-500/25 dark:bg-red-500/10"
                                      data-testid={`row-failure-summary-${i}`}
                                    >
                                      <td colSpan={13} className="px-3 py-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                                          <span className="text-[10px] font-medium text-red-800 dark:text-red-300">
                                            {isFailedStatus(u.latest_status) && isFailedStatus(u.latest_ta_status)
                                              ? "GrapeRank and TA Attestation both failed on the most recent run."
                                              : isFailedStatus(u.latest_status)
                                                ? "GrapeRank calculation failed on the most recent run."
                                                : "TA Attestation failed on the most recent run."}
                                          </span>
                                          <span className="text-[9px] text-red-600/80 dark:text-red-400/80">
                                            Open the error history to see the full message.
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedRows((prev) => {
                                                const next = new Set(prev);
                                                next.add(u.pubkey);
                                                return next;
                                              });
                                            }}
                                            className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/15"
                                            data-testid={`button-view-error-history-${i}`}
                                          >
                                            <Eye className="h-3 w-3" /> View error history
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                {isExpanded && (
                                  <UserHistoryRow
                                    pubkey={u.pubkey}
                                    npub={npub}
                                    taPubkey={u.ta_pubkey}
                                    schedulingName={u.scheduling_name}
                                  />
                                )}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </ScrollableTable>
                </div>

                {/* Mobile: stacked user cards (the wide table is md+ only) */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 md:hidden" data-testid="cards-users">
                  {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                      Loading users...
                    </div>
                  ) : adminUsersQuery.isError ? (
                    <div className="px-4 py-10 text-center text-sm text-red-400">
                      Failed to load users. Check your admin access.
                    </div>
                  ) : adminUsersList.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      {userSearch ? "No users match your search" : "No user data available"}
                    </div>
                  ) : filteredUsersList.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      No users match the current filter
                    </div>
                  ) : (
                    (activeNameSearch
                      ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                      : filteredUsersList
                    ).map((u, i) => {
                      const prof = userProfiles.get(u.pubkey);
                      let npub: string;
                      try {
                        npub = nip19.npubEncode(u.pubkey);
                      } catch {
                        npub = u.pubkey;
                      }
                      const isTriggering = triggeringPubkeys.has(u.pubkey);
                      const isSelected = selectedUserPubkeys.has(u.pubkey);
                      const bs = bulkStatuses.get(u.pubkey);
                      const health = getUserHealth(u.latest_status, u.latest_ta_status, u.times_calculated);
                      const healthColors = {
                        green: "bg-emerald-400",
                        amber: "bg-amber-400",
                        red: "bg-red-400",
                        gray: "bg-slate-300",
                      } as const;
                      return (
                        <div
                          key={u.pubkey}
                          className={`p-3 ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : "bg-white dark:bg-slate-900"}`}
                          data-testid={`card-user-${i}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedUserPubkeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(u.pubkey)) next.delete(u.pubkey);
                                  else next.add(u.pubkey);
                                  return next;
                                })
                              }
                              className="mt-0.5 shrink-0"
                              title={isSelected ? "Deselect" : "Select"}
                              data-testid={`card-checkbox-user-${i}`}
                            >
                              {bs === "running" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                              ) : bs === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              ) : bs === "failed" ? (
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                              ) : isSelected ? (
                                <CheckSquare className="h-4 w-4 text-brand-deep" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                              )}
                            </button>
                            <Avatar className="h-9 w-9 shrink-0">
                              {prof?.picture ? (
                                <AvatarImage src={prof.picture} alt={prof.name || "User"} className="object-cover" />
                              ) : null}
                              <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                                {prof?.name?.charAt(0)?.toUpperCase() || (
                                  <Users className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${healthColors[health]}`} />
                                <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                  {prof?.name || npub.slice(0, 12) + "..."}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1">
                                <span className="truncate font-mono text-[10px] text-brand-primary/80">
                                  {npub.slice(0, 16)}...{npub.slice(-4)}
                                </span>
                                <CopyButton text={npub} />
                              </div>
                            </div>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              {schedulingPolicies.length > 0 ? (
                                <UserTierPicker
                                  pubkey={u.pubkey}
                                  schedulingId={u.scheduling_id}
                                  schedulingName={u.scheduling_name}
                                  policies={schedulingPolicies}
                                  displayName={prof?.name}
                                  picture={prof?.picture}
                                />
                              ) : (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {u.scheduling_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {u.latest_status && (
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${u.latest_status.toLowerCase() === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300" : isFailedStatus(u.latest_status) ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}
                              >
                                {u.latest_status}
                              </span>
                            )}
                            {u.latest_ta_status && (
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${u.latest_ta_status.toLowerCase() === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300" : isFailedStatus(u.latest_ta_status) ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}
                              >
                                TA {u.latest_ta_status}
                              </span>
                            )}
                            <span className="text-[9px] tabular-nums text-slate-400 dark:text-slate-500">
                              {u.times_calculated} calcs
                            </span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500">
                              · Updated {timeAgo(u.last_updated) || formatTimestamp(u.last_updated)}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center justify-end">
                            <UserActionsMenu
                              pubkey={u.pubkey}
                              triggering={isTriggering}
                              triggerDisabled={bulkRunning || bulkStatuses.get(u.pubkey) === "running"}
                              onTrigger={() => setTriggerConfirmPubkey(u.pubkey)}
                              onView={() => {
                                window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                                navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                              }}
                              onPublishTrustedLists={() => {
                                setTrustedListsObserver(u.pubkey);
                                setActiveTab("trusted-lists");
                                window.scrollTo({ top: 0 });
                              }}
                              testIdSuffix={`card-${i}`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/60 sm:gap-3 sm:px-5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[9px] text-slate-500 dark:text-slate-400">Data from /admin/users</span>
                  </div>
                  {adminUsersQuery.isFetching && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400 dark:text-slate-500" />
                      <span className="text-[9px] text-slate-400 dark:text-slate-500">Refreshing...</span>
                    </div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/60 sm:px-5"
                    data-testid="pagination-users"
                  >
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Page {userPage + 1} of {totalPages} (
                      {(activeNameSearch ? filteredUsersList.length : adminUsersTotal).toLocaleString()} total)
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={userPage === 0}
                        onClick={() => setUserPage((p) => p - 1)}
                        className="no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={userPage >= totalPages - 1}
                        onClick={() => setUserPage((p) => p + 1)}
                        className="no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Dialog
                open={triggerConfirmPubkey !== null}
                onOpenChange={(open) => {
                  if (!open) setTriggerConfirmPubkey(null);
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      Confirm GrapeRank Trigger
                    </DialogTitle>
                    <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
                      You are about to manually trigger a GrapeRank calculation. Please review the details below before
                      confirming.
                    </DialogDescription>
                  </DialogHeader>
                  {triggerConfirmPubkey && (
                    <div className="space-y-4 pt-2">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          What happens when you confirm
                        </p>
                        <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                          <li>
                            A GrapeRank calculation request is sent to the Brainstorm server for this user's pubkey
                          </li>
                          <li>
                            The server crawls the user's Nostr social graph — follows, mutes, and interactions — to
                            compute personalized scores
                          </li>
                          <li>
                            This is <span className="font-semibold">resource-intensive</span> and may take several
                            minutes depending on graph size
                          </li>
                          <li>
                            Progress and results will appear in the <span className="font-semibold">Activity tab</span>{" "}
                            once processing begins
                          </li>
                          <li>If a calculation is already running for this user, a duplicate request may be queued</li>
                        </ul>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-500/25 dark:bg-blue-500/10">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                          Good to know
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          GrapeRank scores are calculated relative to the user's own social graph. Each user's network
                          is unique. Triggering this does not affect other users' scores.
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Target Pubkey
                        </p>
                        <p
                          className="break-all font-mono text-xs text-slate-800 dark:text-slate-200"
                          data-testid="text-trigger-confirm-pubkey"
                        >
                          {triggerConfirmPubkey}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTriggerConfirmPubkey(null)}
                          className="no-default-hover-elevate no-default-active-elevate text-xs"
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
                          className="no-default-hover-elevate no-default-active-elevate gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
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

          {activeTab === "support" && (
            <div className="grid grid-cols-1 gap-6" data-testid="panel-support">
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-support-tickets"
              >
                <div className="border-b border-brand-accent/10 px-5 py-4">
                  <h3
                    className="text-sm font-bold text-slate-900 dark:text-slate-100"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Priority Support
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Tickets from paid users — reply here; the in-app thread is the source of truth
                  </p>
                </div>
                <div className="px-5 py-4">
                  <AdminSupportCards active={activeTab === "support"} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "scheduling" && (
            <div className="grid grid-cols-1 gap-6" data-testid="panel-scheduling">
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-scheduling-policies"
              >
                <div className="border-b border-brand-accent/10 px-5 py-4">
                  <h3
                    className="text-sm font-bold text-slate-900 dark:text-slate-100"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Scheduling Policies
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Tier cadences for automatic GrapeRank recalculation
                  </p>
                </div>
                <div className="px-5 py-4">
                  <SchedulingCard active={activeTab === "scheduling"} />
                </div>
              </div>
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-scheduling-stats"
              >
                <div className="border-b border-brand-accent/10 px-5 py-4">
                  <h3
                    className="text-sm font-bold text-slate-900 dark:text-slate-100"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Scheduler Health
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Throughput, demand, queue depths and per-tier slip
                  </p>
                </div>
                <div className="px-5 py-4">
                  <SchedulingStatsPanel active={activeTab === "scheduling"} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="grid grid-cols-1 gap-6" data-testid="panel-billing">
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-billing-subscribers"
              >
                {/* The header is the roster's own — count, page, source and the
                    controls — the User Database's anatomy. */}
                <AdminBillingCards active={activeTab === "billing"} />
              </div>
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-billing-plans"
              >
                {/* The header is the card's own — its sentence once, New mapping beside it. */}
                <PlanMappingsCard active={activeTab === "billing"} />
              </div>
            </div>
          )}

          {activeTab === "trusted-lists" && (
            <div className="grid grid-cols-1 gap-6" data-testid="panel-trusted-lists">
              {/* Keyed on the person sent, so a new shortcut starts fresh. */}
              <TrustedListsCard
                key={trustedListsObserver ?? "picker"}
                initialObserver={trustedListsObserver ?? undefined}
              />
            </div>
          )}

          {activeTab === "health" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="panel-health">
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2"
                data-testid="card-api-health"
              >
                <div className="border-b border-brand-accent/10 px-5 py-4">
                  <h3
                    className="text-sm font-bold text-slate-900 dark:text-slate-100"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    API Health
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Live endpoint status from active queries
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  {[
                    // TODO: replace with a meaningful health probe (dedicated endpoint?)
                    // { name: "/user/self", ok: selfQuery.isSuccess, loading: selfQuery.isLoading, error: selfQuery.isError, description: "User profile & social graph" },
                    {
                      name: "/user/graperankResult",
                      ok: grapeRankQuery.isSuccess,
                      loading: grapeRankQuery.isLoading,
                      error: grapeRankQuery.isError,
                      description: "GrapeRank calculation result",
                    },
                    {
                      name: "/admin/users",
                      ok: adminUsersQuery.isSuccess,
                      loading: adminUsersQuery.isLoading,
                      error: adminUsersQuery.isError,
                      description: "Platform user database",
                    },
                    {
                      name: "/admin/activity",
                      ok: adminActivityQuery.isSuccess || !adminActivityQuery.isError,
                      loading: adminActivityQuery.isLoading,
                      error: adminActivityQuery.isError,
                      description: "Platform calculation activity",
                    },
                  ].map((ep) => (
                    <div
                      key={ep.name}
                      className="flex flex-col justify-between gap-1 rounded-xl border border-slate-100 bg-white/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:gap-2"
                      data-testid={`health-ep-${ep.name.replace(/[/*]/g, "-")}`}
                    >
                      <div className="flex items-center gap-3">
                        {ep.loading ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400 dark:text-slate-500" />
                        ) : ep.ok ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                        )}
                        <div>
                          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {ep.name}
                          </span>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">{ep.description}</p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          ep.loading
                            ? "border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                            : ep.ok
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "border border-red-200 bg-red-50 text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400"
                        }`}
                      >
                        {ep.loading ? "Loading" : ep.ok ? "Healthy" : "Error"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2"
                data-testid="card-relay-status"
              >
                <div className="flex flex-col justify-between gap-3 border-b border-brand-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div>
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Relay Connectivity
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Live WebSocket latency probes</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={runRelayCheck}
                    disabled={relayCheckRunning}
                    className="no-default-hover-elevate no-default-active-elevate w-full gap-1.5 text-xs sm:w-auto"
                    data-testid="button-recheck-relays"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${relayCheckRunning ? "animate-spin" : ""}`} />
                    {relayCheckRunning ? "Checking..." : "Re-check"}
                  </Button>
                </div>
                <div className="space-y-3 p-5">
                  {configuredRelays.map((relay, idx) => {
                    const latencyInfo = relayLatencies.find((r) => r.url === relay);
                    const relayStatus =
                      latencyInfo?.status ?? (relayCheckRunning ? ("degraded" as const) : ("connected" as const));
                    return (
                      <div
                        key={relay}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:gap-3"
                        data-testid={`relay-row-${idx}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              relayStatus === "connected"
                                ? "border border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
                                : relayStatus === "degraded"
                                  ? "border border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
                                  : "border border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10"
                            }`}
                          >
                            {relayStatus === "disconnected" ? (
                              <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
                            ) : (
                              <Wifi
                                className={`h-4 w-4 ${relayStatus === "connected" ? "text-emerald-600" : "text-amber-600 dark:text-amber-400"}`}
                              />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {relay === PRIMARY_RELAY ? "DCoSL Relay (primary)" : "Profile Relay"}
                            </p>
                            <p className="max-w-[200px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:max-w-none">
                              {relay}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {latencyInfo?.latencyMs !== null && latencyInfo?.latencyMs !== undefined && (
                            <span
                              className={`font-mono text-[10px] font-bold tabular-nums ${
                                latencyInfo.latencyMs < 500
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : latencyInfo.latencyMs < 2000
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-red-600"
                              }`}
                              data-testid={`relay-latency-${idx}`}
                            >
                              {latencyInfo.latencyMs}ms
                            </span>
                          )}
                          {relayCheckRunning && !latencyInfo && (
                            <span className="animate-pulse text-[10px] text-slate-400 dark:text-slate-500">
                              Probing...
                            </span>
                          )}
                          <StatusBadge status={relayStatus} />
                        </div>
                      </div>
                    );
                  })}
                  {relayLatencies.length > 0 && (
                    <p className="pt-2 text-[10px] text-slate-400 dark:text-slate-500">
                      Last checked: {relayLatencies[0].checkedAt.toLocaleTimeString()} · Avg latency:{" "}
                      {Math.round(
                        relayLatencies.filter((r) => r.latencyMs !== null).reduce((s, r) => s + (r.latencyMs ?? 0), 0) /
                          Math.max(1, relayLatencies.filter((r) => r.latencyMs !== null).length),
                      )}
                      ms
                    </p>
                  )}
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
                  "1h": "Last Hour",
                  "24h": "Last 24 Hours",
                  "7d": "Last 7 Days",
                  all: "All Loaded",
                };
                const rangeShort: Record<ActivityTimeRange, string> = {
                  "1h": "1h",
                  "24h": "24h",
                  "7d": "7d",
                  all: "All",
                };

                const getStartMs = (range: ActivityTimeRange): number => {
                  switch (range) {
                    case "1h":
                      return now - 3600000;
                    case "24h":
                      return now - 86400000;
                    case "7d":
                      return now - 7 * 86400000;
                    case "all":
                      return 0;
                    default:
                      return 0;
                  }
                };
                const getEndMs = (_range: ActivityTimeRange): number => now;

                const startMs = getStartMs(activityTimeRange);
                const endMs = getEndMs(activityTimeRange);

                const parseTs = (ts: string): number => {
                  try {
                    return new Date(ts.endsWith("Z") ? ts : ts + "Z").getTime();
                  } catch {
                    return 0;
                  }
                };

                const filteredItems = actSummaryActivity.filter((a) => {
                  const t = parseTs(a.updated_at);
                  return t >= startMs && t <= endMs;
                });
                const filteredSuccess = filteredItems.filter((a) => a.status?.toLowerCase() === "success").length;
                const filteredFailed = filteredItems.filter((a) => isFailedStatus(a.status)).length;
                const filteredTotal = filteredItems.length;
                const totalCalcsAll = actSummaryUsers.reduce((s, u) => s + (u.times_calculated || 0), 0);
                const failedUsers = actSummaryUsers.filter(
                  (u) => isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status),
                ).length;
                const sortedByUpdate = [...actSummaryUsers].sort((a, b) => {
                  const ta = new Date(a.last_updated || "").getTime() || 0;
                  const tb = new Date(b.last_updated || "").getTime() || 0;
                  return tb - ta;
                });
                const lastActivityTs = sortedByUpdate[0]?.last_updated ?? null;
                const uniquePubkeys = new Set(filteredItems.map((a) => a.pubkey).filter(Boolean)).size;

                const presets: ActivityTimeRange[] = ["1h", "24h", "7d", "all"];

                return (
                  <div
                    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                    data-testid="card-activity-summary"
                  >
                    <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 items-center gap-2">
                          <div>
                            <h3
                              className="text-sm font-bold text-slate-900 dark:text-slate-100"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              Activity Summary
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              Platform-wide throughput —{" "}
                              <span className="font-semibold text-brand-deep">{rangeLabels[activityTimeRange]}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={
                              overviewActivityQuery.isSuccess && overviewUsersQuery.isSuccess
                                ? "connected"
                                : overviewActivityQuery.isError || overviewUsersQuery.isError
                                  ? "disconnected"
                                  : "degraded"
                            }
                          />
                        </div>
                      </div>
                      <div
                        className="mt-3 hidden flex-wrap items-center gap-1.5 sm:flex"
                        data-testid="time-range-selector"
                      >
                        {presets.map((p) => (
                          <button
                            key={p}
                            onClick={() => setActivityTimeRange(p)}
                            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                              activityTimeRange === p
                                ? "bg-brand-deep text-white shadow-md shadow-brand-primary/20"
                                : "border border-slate-200 bg-white/70 text-slate-600 hover:border-brand-primary/20 hover:bg-brand-primary/10 hover:text-brand-deep dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                            }`}
                            data-testid={`time-range-${p}`}
                          >
                            {rangeShort[p]}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 sm:hidden" data-testid="time-range-selector-mobile">
                        <div className="relative">
                          <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-deep" />
                          <select
                            value={activityTimeRange}
                            onChange={(e) => setActivityTimeRange(e.target.value as ActivityTimeRange)}
                            className="w-full appearance-none rounded-lg border border-brand-accent/30 bg-white py-2 pl-8 pr-8 text-xs font-semibold text-slate-700 shadow-sm focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:bg-slate-900 dark:text-slate-200"
                            data-testid="select-time-range-mobile"
                          >
                            {presets.map((p) => (
                              <option key={p} value={p}>
                                {rangeLabels[p]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                        </div>
                      </div>
                      {activityTimeRange !== "24h" && (
                        <p className="mt-2 text-[9px] italic text-slate-400 dark:text-slate-500">
                          Based on the latest {activityCoverage.count} activity records (backend cap). Longer ranges may
                          not reflect full history.
                        </p>
                      )}
                    </div>
                    <div className="p-4 sm:p-5">
                      {actSummaryLoading ? (
                        <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-total"
                          >
                            <Activity className="mx-auto mb-1 h-4 w-4 text-brand-deep" />
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {filteredTotal.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {rangeShort[activityTimeRange]} Requests
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-success"
                          >
                            <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                              {filteredSuccess.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {rangeShort[activityTimeRange]} Succeeded
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-failed"
                          >
                            <XCircle className="mx-auto mb-1 h-4 w-4 text-red-400" />
                            <p className="text-lg font-bold text-red-500">{filteredFailed.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {rangeShort[activityTimeRange]} Failed
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-unique-users"
                          >
                            <Users className="mx-auto mb-1 h-4 w-4 text-blue-500" />
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {uniquePubkeys.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {rangeShort[activityTimeRange]} Active Users
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-total-calcs"
                          >
                            <Hash className="mx-auto mb-1 h-4 w-4 text-brand-deep" />
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {totalCalcsAll.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Total Calculations</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setKpiFilter("failed");
                              setActiveTab("users");
                              setUserPage(0);
                            }}
                            className="h-full w-full cursor-pointer rounded-xl border border-slate-100 bg-white/50 p-3 text-center transition-colors hover:border-red-200 hover:bg-red-50 dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-failed-users"
                            title="Click to view users with failures"
                          >
                            <AlertTriangle className="mx-auto mb-1 h-4 w-4 text-amber-500" />
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {failedUsers.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Users w/ Failures</p>
                          </button>
                        </div>
                      )}
                      {lastActivityTs && !actSummaryLoading && (
                        <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
                          Last platform activity:{" "}
                          {(() => {
                            try {
                              const d = new Date(lastActivityTs.endsWith("Z") ? lastActivityTs : lastActivityTs + "Z");
                              return d.toLocaleString();
                            } catch {
                              return lastActivityTs;
                            }
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <FailureBreakdownCard
                items={overviewAllActivity}
                isLoading={overviewLoading}
                isError={overviewActivityQuery.isError}
                errorMessage={
                  overviewActivityQuery.error instanceof Error ? overviewActivityQuery.error.message : undefined
                }
                onViewUser={(pk) => {
                  setUserSearch(pk);
                  setDebouncedSearch(pk);
                  setActiveTab("users");
                  setKpiFilter(null);
                  setUserPage(0);
                  setExpandedRows(new Set([pk]));
                  setHighlightedPubkey(pk);
                  setTimeout(() => setHighlightedPubkey(null), 2500);
                }}
              />

              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-platform-activity"
              >
                <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h3
                        className="text-sm font-bold text-slate-900 dark:text-slate-100"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        Platform Activity
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        All GrapeRank calculation records from /admin/activity
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {activityTotal.toLocaleString()} total
                      </span>
                      <LiveBadge
                        updatedAt={adminActivityQuery.dataUpdatedAt}
                        boosting={isBoostActive}
                        isFetching={adminActivityQuery.isFetching}
                      />
                      <StatusBadge
                        status={
                          adminActivityQuery.isSuccess
                            ? "connected"
                            : adminActivityQuery.isError
                              ? "disconnected"
                              : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError
                                ? "connected"
                                : "degraded"
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="p-3 sm:p-5">
                  {adminActivityQuery.isLoading && !activityItems.length ? (
                    <div className="animate-pulse space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800" />
                      ))}
                    </div>
                  ) : adminActivityQuery.isError ? (
                    <div className="py-8 text-center">
                      <XCircle className="mx-auto mb-2 h-8 w-8 text-red-300" />
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Failed to load activity
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        {adminActivityQuery.error instanceof Error ? adminActivityQuery.error.message : "Unknown error"}
                      </p>
                    </div>
                  ) : activityItems.length === 0 ? (
                    <div className="py-8 text-center">
                      <Activity className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">No activity records</p>
                      <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        No GrapeRank calculations have been recorded yet.
                      </p>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const selectedCount = selectedActivityRows.size;
                        const dedupePubkeys = Array.from(
                          new Set(Array.from(selectedActivityRows.values()).filter((p): p is string => !!p)),
                        );
                        if (selectedCount === 0) return null;
                        const liveCount = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
                          : 0;
                        const liveTotal = bulkRunning ? bulkStatuses.size : 0;
                        const liveFailed = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length
                          : 0;
                        return (
                          <div
                            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10"
                            data-testid="bulk-toolbar-activity"
                          >
                            <CheckSquare className="h-4 w-4 text-brand-deep" />
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {selectedCount} selected
                              {dedupePubkeys.length !== selectedCount && (
                                <span className="font-normal text-slate-500 dark:text-slate-400">
                                  {" "}
                                  ({dedupePubkeys.length} unique)
                                </span>
                              )}
                            </span>
                            {bulkRunning && (
                              <span
                                className="text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                data-testid="bulk-progress-activity"
                              >
                                {liveCount} of {liveTotal} triggered… {liveFailed > 0 ? `${liveFailed} failed` : ""}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => setBulkConfirm({ pubkeys: dedupePubkeys, source: "activity" })}
                                disabled={bulkRunning || dedupePubkeys.length === 0}
                                className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                                data-testid="button-bulk-retrigger-activity"
                              >
                                {bulkRunning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Re-trigger {dedupePubkeys.length} user{dedupePubkeys.length !== 1 ? "s" : ""}
                              </Button>
                              <button
                                onClick={() => setSelectedActivityRows(new Map())}
                                disabled={bulkRunning}
                                className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                                data-testid="button-bulk-clear-activity"
                              >
                                Clear selection
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      {bulkLastResult && bulkLastResult.source === "activity" && (
                        <div
                          className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${bulkLastResult.failures.length === 0 ? "border-emerald-300/50 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-300/50 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"}`}
                          data-testid="bulk-result-activity"
                        >
                          {bulkLastResult.failures.length === 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {bulkLastResult.successes.length} succeeded · {bulkLastResult.failures.length} failed
                          </span>
                          <div className="ml-auto flex items-center gap-2">
                            {bulkLastResult.failures.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setBulkConfirm({
                                    pubkeys: bulkLastResult.failures.map((f) => f.pubkey),
                                    source: "retry",
                                  })
                                }
                                disabled={bulkRunning}
                                className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 text-xs"
                                data-testid="button-bulk-retry-failed-activity"
                              >
                                <RefreshCw className="h-3 w-3" /> Retry failed only
                              </Button>
                            )}
                            <button
                              onClick={() => setBulkLastResult(null)}
                              className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                              data-testid="button-bulk-dismiss-activity"
                            >
                              Dismiss
                            </button>
                          </div>
                          {bulkLastResult.failures.length > 0 && (
                            <details className="mt-1.5 basis-full">
                              <summary className="cursor-pointer select-none text-[10px] font-semibold text-red-700 dark:text-red-300">
                                View failure details ({bulkLastResult.failures.length})
                              </summary>
                              <ul
                                className="mt-1.5 max-h-40 space-y-0.5 overflow-auto"
                                data-testid="list-bulk-errors-activity"
                              >
                                {bulkLastResult.failures.map((f, i) => (
                                  <li
                                    key={`${f.pubkey}-${i}`}
                                    className="truncate font-mono text-[10px] text-red-900/90 dark:text-red-300/90"
                                    title={`${f.pubkey}: ${f.error}`}
                                  >
                                    <span className="text-red-600 dark:text-red-400">{f.pubkey.slice(0, 12)}…</span> —{" "}
                                    {f.error}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-left" data-testid="table-platform-activity">
                          <thead>
                            <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                              <th className="w-8 px-2 py-2">
                                {(() => {
                                  const eligible = activityItems.filter(
                                    (a) => !!a.pubkey && a.private_id !== undefined && a.private_id !== null,
                                  );
                                  const selectedOnPage = eligible.filter((a) =>
                                    selectedActivityRows.has(a.private_id as number),
                                  ).length;
                                  const allSelected = eligible.length > 0 && selectedOnPage === eligible.length;
                                  const someSelected = selectedOnPage > 0 && !allSelected;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (allSelected) {
                                          setSelectedActivityRows((prev) => {
                                            const next = new Map(prev);
                                            for (const a of eligible) next.delete(a.private_id as number);
                                            return next;
                                          });
                                        } else {
                                          setSelectedActivityRows((prev) => {
                                            const next = new Map(prev);
                                            for (const a of eligible)
                                              next.set(a.private_id as number, a.pubkey as string);
                                            return next;
                                          });
                                        }
                                      }}
                                      className="inline-flex items-center justify-center"
                                      title={allSelected ? "Deselect all on page" : "Select all on page"}
                                      data-testid="checkbox-activity-select-all"
                                      disabled={eligible.length === 0}
                                    >
                                      {allSelected ? (
                                        <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                      ) : someSelected ? (
                                        <MinusSquare className="h-3.5 w-3.5 text-brand-deep" />
                                      ) : (
                                        <Square
                                          className={`h-3.5 w-3.5 ${eligible.length ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                                        />
                                      )}
                                    </button>
                                  );
                                })()}
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Created
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Updated
                              </th>
                              <th
                                className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                                title="Time from created to updated"
                              >
                                Duration
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                User
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Source
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Status
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                TA Status
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Pub Status
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Algorithm
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Queue
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Req #
                              </th>
                              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {activityItems.map((item, idx) => {
                              const pid = item.private_id as number | null;
                              const isSelected = pid !== null && pid !== undefined && selectedActivityRows.has(pid);
                              const bs = item.pubkey ? bulkStatuses.get(item.pubkey) : undefined;
                              return (
                                <ActivityRow
                                  key={item.private_id ?? idx}
                                  item={item}
                                  idx={idx}
                                  profile={item.pubkey ? userProfiles.get(item.pubkey) : undefined}
                                  schedulingName={item.pubkey ? schedulingTierByPubkey.get(item.pubkey) : undefined}
                                  onViewDetail={handleViewRequestDetail}
                                  selected={isSelected}
                                  bulkStatus={bs}
                                  queuePosition={
                                    typeof item.private_id === "number"
                                      ? queuePositionByPrivateId.get(item.private_id)
                                      : undefined
                                  }
                                  onToggleSelect={() => {
                                    if (!item.pubkey || pid === null || pid === undefined) return;
                                    setSelectedActivityRows((prev) => {
                                      const next = new Map(prev);
                                      if (next.has(pid)) next.delete(pid);
                                      else next.set(pid, item.pubkey as string);
                                      return next;
                                    });
                                  }}
                                  onNavigateToUser={(pubkey) => {
                                    setUserSearch(pubkey);
                                    setDebouncedSearch(pubkey);
                                    setActiveTab("users");
                                    setKpiFilter(null);
                                    setUserPage(0);
                                    setExpandedRows(new Set([pubkey]));
                                    setHighlightedPubkey(pubkey);
                                    setTimeout(() => setHighlightedPubkey(null), 2500);
                                  }}
                                  onRetrigger={async (pubkey) => {
                                    try {
                                      await apiClient.triggerUserGraperank(pubkey);
                                      toast({
                                        title: "Request Queued",
                                        description: `Re-triggered GrapeRank for ${pubkey.slice(0, 12)}...`,
                                      });
                                      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                                      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                      triggerRefreshBoost();
                                    } catch (err: unknown) {
                                      const msg =
                                        err instanceof Error
                                          ? err.message
                                          : typeof err === "object" && err !== null
                                            ? JSON.stringify(err)
                                            : "Unknown error";
                                      toast({ title: "Re-trigger Failed", description: msg, variant: "destructive" });
                                      throw err;
                                    }
                                  }}
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/60 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">Rows per page:</span>
                          <select
                            className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            value={activityPageSize}
                            onChange={(e) => {
                              setActivityPageSize(Number(e.target.value) as PageSizeOption);
                              setActivityPage(0);
                            }}
                            data-testid="select-activity-page-size"
                          >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Page {activityPage + 1} of {activityTotalPages}
                          </span>
                          <div className="flex gap-1">
                            <button
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900"
                              disabled={activityPage === 0}
                              onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                              data-testid="button-activity-prev"
                            >
                              Prev
                            </button>
                            <button
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900"
                              disabled={activityPage + 1 >= activityTotalPages}
                              onClick={() => setActivityPage((p) => p + 1)}
                              data-testid="button-activity-next"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] italic text-slate-400 dark:text-slate-500">
                        Click any row to expand details. Use the re-trigger button to re-run GrapeRank for that user.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <Dialog
                open={detailOpen}
                onOpenChange={(open) => {
                  setDetailOpen(open);
                  if (!open) {
                    setDetailData(null);
                    setDetailError(null);
                  }
                }}
              >
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-brand-deep" />
                      Brainstorm Request #{detailRequestId}
                    </DialogTitle>
                    <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
                      Full request details for request #{detailRequestId}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="pt-2">
                    {detailLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-brand-deep" />
                        <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                          Loading request detail...
                        </span>
                      </div>
                    )}
                    {detailError && (
                      <div
                        className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10"
                        data-testid="detail-error"
                      >
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <p className="text-xs text-red-700 dark:text-red-300">{detailError}</p>
                      </div>
                    )}
                    {detailData && (
                      <div className="space-y-2" data-testid="detail-fields">
                        {Object.entries(detailData)
                          .filter(([, value]) => value !== null && value !== undefined && value !== "")
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="flex items-start justify-between rounded-lg border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60"
                            >
                              <span className="mr-4 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {key}
                              </span>
                              <span className="max-w-[60%] break-all text-right font-mono text-[10px] text-slate-800 dark:text-slate-200 sm:max-w-[350px]">
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

          {activeTab === "assistants" && FEATURES.assistantsAdmin && (
            <div className="space-y-6" data-testid="panel-assistants">
              {(() => {
                const stats = assistantStatsQuery.data;
                const statsLoading = assistantStatsQuery.isLoading;
                const statsUnavailable = !statsLoading && stats === null;
                return (
                  <div
                    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                    data-testid="card-assistant-stats"
                  >
                    <div className="flex flex-col justify-between gap-2 border-b border-brand-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3
                          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          <Sparkles className="h-4 w-4 text-brand-accent" />
                          Brainstorm Assistants
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Tracks each successful kind 0 publish from the assistant publish endpoint.
                        </p>
                      </div>
                      <StatusBadge
                        status={
                          statsUnavailable ? "disconnected" : assistantStatsQuery.isError ? "disconnected" : "connected"
                        }
                      />
                    </div>
                    <div className="p-4 sm:p-5">
                      {statsLoading ? (
                        <div className="grid animate-pulse grid-cols-2 gap-3 md:grid-cols-5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
                          ))}
                        </div>
                      ) : statsUnavailable ? (
                        <div className="py-6 text-center" data-testid="assistant-stats-unavailable">
                          <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Not Connected</p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            The backend has not yet exposed <code>/admin/assistants/stats</code>.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-total"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Total Assistants
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.totalAssistants ?? 0).toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              Distinct owner pubkeys
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-publishes"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Total Publishes
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.totalPublishes ?? 0).toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              Successful kind 0 events
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-24h"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Last 24h
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.publishes24h ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-7d"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Last 7 days
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.publishes7d ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-last"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Last Publish
                            </p>
                            <p className="mt-2 text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                              {stats?.lastPublishAt ? formatTimestamp(stats.lastPublishAt) : "—"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const data = assistantsListQuery.data;
                const isUnavailable = !assistantsListQuery.isLoading && data === null;
                const items = data?.items ?? [];
                const total = data?.total ?? 0;
                const totalPages = data?.pages ?? 1;
                return (
                  <div
                    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                    data-testid="card-assistant-list"
                  >
                    <div className="flex flex-col justify-between gap-3 border-b border-brand-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3
                          className="text-sm font-bold text-slate-900 dark:text-slate-100"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          Per-User Publish History
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {total.toLocaleString()} owner{total === 1 ? "" : "s"} have published an assistant.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                          <input
                            type="text"
                            value={assistantSearch}
                            onChange={(e) => setAssistantSearch(e.target.value)}
                            placeholder="Search npub or hex…"
                            className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs focus:border-brand-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 sm:w-56"
                            data-testid="input-assistant-search"
                          />
                        </div>
                        <StatusBadge
                          status={
                            isUnavailable ? "disconnected" : assistantsListQuery.isError ? "disconnected" : "connected"
                          }
                        />
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                      {assistantsListQuery.isLoading && items.length === 0 ? (
                        <div className="animate-pulse space-y-2">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
                          ))}
                        </div>
                      ) : isUnavailable ? (
                        <div className="py-8 text-center" data-testid="assistants-list-unavailable">
                          <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Not Connected</p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            The backend has not yet exposed <code>/admin/assistants</code>.
                          </p>
                        </div>
                      ) : items.length === 0 ? (
                        <div className="py-8 text-center">
                          <Sparkles className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                            No assistants published yet
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Once a user publishes their assistant, they'll appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-left" data-testid="table-assistants">
                            <thead>
                              <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Owner
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  # Publishes
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  First
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Last
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Latest Event
                                </th>
                                <th className="w-8 px-2 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it) => {
                                let npub = it.owner_pubkey;
                                try {
                                  npub = nip19.npubEncode(it.owner_pubkey);
                                } catch {}
                                const isExpanded = expandedAssistant === it.owner_pubkey;
                                return (
                                  <Fragment key={it.owner_pubkey}>
                                    <tr
                                      className="cursor-pointer border-b border-slate-100 hover:bg-brand-primary/10 dark:border-slate-800/60 dark:hover:bg-brand-primary/10"
                                      onClick={() => setExpandedAssistant(isExpanded ? null : it.owner_pubkey)}
                                      data-testid={`row-assistant-${it.owner_pubkey}`}
                                    >
                                      <td className="px-2 py-2">
                                        <div className="flex flex-col">
                                          <span
                                            className="max-w-[220px] truncate font-mono text-[11px] text-slate-800 dark:text-slate-200"
                                            title={npub}
                                          >
                                            {npub.slice(0, 18)}…{npub.slice(-6)}
                                          </span>
                                          <span
                                            className="max-w-[220px] truncate font-mono text-[9px] text-slate-400 dark:text-slate-500"
                                            title={it.owner_pubkey}
                                          >
                                            {it.owner_pubkey.slice(0, 12)}…
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-[11px] font-bold text-slate-900 dark:text-slate-100">
                                        {it.publish_count.toLocaleString()}
                                      </td>
                                      <td className="px-2 py-2 text-[10px] text-slate-600 dark:text-slate-300">
                                        {it.first_published_at ? formatTimestamp(it.first_published_at) : "—"}
                                      </td>
                                      <td className="px-2 py-2 text-[10px] text-slate-600 dark:text-slate-300">
                                        {it.last_published_at ? formatTimestamp(it.last_published_at) : "—"}
                                      </td>
                                      <td
                                        className="max-w-[180px] truncate px-2 py-2 font-mono text-[10px] text-slate-500 dark:text-slate-400"
                                        title={it.event_id || ""}
                                      >
                                        {it.event_id ? `${it.event_id.slice(0, 14)}…` : "—"}
                                      </td>
                                      <td className="px-2 py-2 text-slate-400 dark:text-slate-500">
                                        {isExpanded ? (
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        ) : (
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        )}
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr data-testid={`row-assistant-history-${it.owner_pubkey}`}>
                                        <td colSpan={6} className="bg-slate-50/60 px-3 py-3 dark:bg-slate-900/60">
                                          {assistantHistoryQuery.isLoading ? (
                                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                              <Loader2 className="h-3 w-3 animate-spin" /> Loading history…
                                            </div>
                                          ) : assistantHistoryQuery.data === null ? (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                              Per-user history endpoint not available.
                                            </div>
                                          ) : (assistantHistoryQuery.data?.items?.length ?? 0) === 0 ? (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                              No detailed publish events recorded.
                                            </div>
                                          ) : (
                                            <div className="space-y-1">
                                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                Recent publishes
                                              </p>
                                              <ul className="max-h-60 space-y-1 overflow-auto">
                                                {assistantHistoryQuery.data!.items.map((h, i) => (
                                                  <li
                                                    key={`${h.event_id}-${i}`}
                                                    className="flex items-center gap-2 rounded border border-slate-100 bg-white px-2 py-1 text-[11px] dark:border-slate-800/60 dark:bg-slate-900"
                                                  >
                                                    <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                                    <span className="text-slate-700 dark:text-slate-200">
                                                      {formatTimestamp(h.published_at)}
                                                    </span>
                                                    <span
                                                      className="flex-1 truncate font-mono text-slate-500 dark:text-slate-400"
                                                      title={h.event_id}
                                                    >
                                                      {h.event_id.slice(0, 24)}…
                                                    </span>
                                                    {h.status && (
                                                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                        {h.status}
                                                      </span>
                                                    )}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Page {assistantPage + 1} of {totalPages} · {total.toLocaleString()} total
                            </div>
                            <div className="flex items-center gap-2">
                              <Select
                                value={String(assistantPageSize)}
                                onValueChange={(v) => setAssistantPageSize(Number(v) as PageSizeOption)}
                              >
                                <SelectTrigger
                                  className="h-7 w-[88px] text-[11px]"
                                  data-testid="select-assistant-page-size"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="25">25 / page</SelectItem>
                                  <SelectItem value="50">50 / page</SelectItem>
                                  <SelectItem value="100">100 / page</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={assistantPage === 0}
                                onClick={() => setAssistantPage((p) => Math.max(0, p - 1))}
                                data-testid="button-assistant-prev"
                              >
                                <ChevronLeft className="h-3 w-3" /> Prev
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={assistantPage + 1 >= totalPages}
                                onClick={() => setAssistantPage((p) => p + 1)}
                                data-testid="button-assistant-next"
                              >
                                Next <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>

      <Footer />

      <Dialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !bulkRunning) setBulkConfirm(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-brand-deep" />
              Confirm Bulk Re-trigger
            </DialogTitle>
            <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
              Re-trigger GrapeRank calculation for multiple users at once.
            </DialogDescription>
          </DialogHeader>
          {bulkConfirm &&
            (() => {
              const inFlight = bulkConfirm.pubkeys.filter((pk) => triggeringPubkeys.has(pk));
              return (
                <div className="space-y-4 pt-2">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      What happens when you confirm
                    </p>
                    <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                      <li>
                        One GrapeRank calculation request is sent{" "}
                        <span className="font-semibold">per unique pubkey</span>
                      </li>
                      <li>Requests fire in parallel batches (5 at a time) to avoid hammering the server</li>
                      <li>Already in-flight users will be skipped automatically</li>
                      <li>Progress will appear inline; failures can be retried individually</li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Targets
                    </p>
                    <p className="text-xs text-slate-800 dark:text-slate-200" data-testid="text-bulk-confirm-count">
                      <span className="font-bold">{bulkConfirm.pubkeys.length}</span> unique pubkey
                      {bulkConfirm.pubkeys.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {inFlight.length > 0 && (
                    <div
                      className="rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/25 dark:bg-orange-500/10"
                      data-testid="text-bulk-confirm-inflight"
                    >
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                        Heads up
                      </p>
                      <p className="text-xs text-orange-900 dark:text-orange-200">
                        {inFlight.length} of these user{inFlight.length !== 1 ? "s are" : " is"} already in flight and
                        will be skipped.
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBulkConfirm(null)}
                      disabled={bulkRunning}
                      className="no-default-hover-elevate no-default-active-elevate text-xs"
                      data-testid="button-cancel-bulk"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const target = bulkConfirm;
                        setBulkConfirm(null);
                        if (target)
                          runBulkRetrigger(
                            target.pubkeys,
                            target.source === "retry" ? (bulkLastResult?.source ?? "users") : target.source,
                          );
                      }}
                      disabled={bulkRunning || bulkConfirm.pubkeys.length === 0}
                      className="no-default-hover-elevate no-default-active-elevate gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                      data-testid="button-confirm-bulk"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Re-trigger {bulkConfirm.pubkeys.length} user{bulkConfirm.pubkeys.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
