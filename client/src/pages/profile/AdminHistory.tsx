/**
 * The admin-only "Brainstorm History" card on the analytics profile: one row per
 * GrapeRank run for this pubkey (`/admin/users/{pubkey}/history`), expandable to
 * the run's error, parameters and a hint at where its failure usually lies.
 */
import { useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/services/api";

export interface AdminHistoryItem {
  created_at: string;
  updated_at: string;
  private_id: number;
  status: string;
  ta_status: string | null;
  internal_publication_status: string | null;
  error: { code: string; message: string | null } | null;
  count_values: string | null;
  password: string | null;
  algorithm: string | null;
  parameters: string | null;
  how_many_others_with_priority: number;
  pubkey: string;
  trigger_source: string | null;
}

function AdminHistoryStatusBadge({ value, type: _type }: { value: string | null; type: "status" | "ta" | "pub" }) {
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
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${colors}`}>{value}</span>;
}

// Why this run was queued: manual (user asked), scheduled (tier auto-scheduler),
// admin (admin action), periodic (cron). Colored distinctly from status badges.
function AdminHistoryTriggerBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const colors =
    lower === "scheduled"
      ? "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/20 dark:border-brand-primary/25"
      : lower === "periodic"
        ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/25"
        : lower === "admin"
          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
          : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${colors}`}>
      {value}
    </span>
  );
}

export type AdminHistoryFailureStage = "calculation" | "ta" | "publication";

const ADMIN_HISTORY_FAILURE_HINTS: Record<AdminHistoryFailureStage, { label: string; hint: string }> = {
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

/**
 * The server writes its times without a zone (naive UTC, a space for the T);
 * read them as UTC so the row shows the viewer's local time.
 */
export function parseServerDate(d: string): Date {
  const trimmed = d.trim();
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return new Date(hasTz ? normalized : `${normalized}Z`);
}

/** The first stage of the run that failed, in pipeline order, or null when none did. */
export function adminHistoryFailureStage(
  item: Pick<AdminHistoryItem, "status" | "ta_status" | "internal_publication_status">,
): AdminHistoryFailureStage | null {
  const statusFailed = (item.status || "").toLowerCase() === "failure";
  const taFailed = (item.ta_status || "").toLowerCase() === "failure";
  const pubLower = (item.internal_publication_status || "").toLowerCase();
  const pubFailed = pubLower === "failure" || pubLower === "failed";
  return statusFailed ? "calculation" : taFailed ? "ta" : pubFailed ? "publication" : null;
}

export function AdminHistoryRow({ item, idx }: { item: AdminHistoryItem; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const userTimeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = parseServerDate(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: userTimeZone,
      });
    } catch {
      return d;
    }
  };
  const fmtDateFull = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = parseServerDate(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
        timeZone: userTimeZone,
      });
    } catch {
      return d;
    }
  };
  const failureStage = adminHistoryFailureStage(item);
  const failureInfo = failureStage ? ADMIN_HISTORY_FAILURE_HINTS[failureStage] : null;
  const errorText = item.error?.message?.trim() || "";
  return (
    <>
      <tr
        className={`cursor-pointer border-b border-amber-100/40 transition-colors hover:bg-amber-50/40 dark:border-amber-500/20 dark:hover:bg-amber-500/10 ${idx % 2 === 0 ? "bg-white/40 dark:bg-slate-900/40" : "bg-amber-50/20 dark:bg-amber-500/[0.06]"}`}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`row-admin-history-${item.private_id || idx}`}
      >
        <td className="px-2 py-2 font-mono text-slate-600 dark:text-slate-300">{item.private_id}</td>
        <td className="px-2 py-2">
          <AdminHistoryTriggerBadge value={item.trigger_source} />
        </td>
        <td className="px-2 py-2">
          <AdminHistoryStatusBadge value={item.status} type="status" />
        </td>
        <td className="px-2 py-2">
          <AdminHistoryStatusBadge value={item.ta_status} type="ta" />
        </td>
        <td className="px-2 py-2">
          <AdminHistoryStatusBadge value={item.internal_publication_status} type="pub" />
        </td>
        <td className="px-2 py-2 font-mono text-slate-600 dark:text-slate-300">{item.algorithm || "—"}</td>
        <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">
          {item.how_many_others_with_priority}
        </td>
        <td
          className="whitespace-nowrap px-2 py-2 text-slate-500 dark:text-slate-400"
          title={fmtDateFull(item.created_at)}
        >
          {fmtDate(item.created_at)}
        </td>
        <td
          className="whitespace-nowrap px-2 py-2 text-slate-500 dark:text-slate-400"
          title={fmtDateFull(item.updated_at)}
        >
          {fmtDate(item.updated_at)}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-amber-50/30 dark:bg-amber-500/[0.06]">
          <td colSpan={9} className="px-4 py-3">
            {failureInfo && (
              <div
                className="mb-3 rounded border border-red-200 bg-red-50/60 px-3 py-2 dark:border-red-500/25 dark:bg-red-500/10"
                data-testid={`panel-failure-hint-${item.private_id || idx}`}
              >
                {errorText ? (
                  <p className="break-all font-mono text-[11px] text-red-700 dark:text-red-300">{errorText}</p>
                ) : (
                  <p className="text-[11px] italic text-red-600/80 dark:text-red-400/80">
                    No error details captured — check server logs.
                  </p>
                )}
                <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">Where to look · {failureInfo.label}:</span> {failureInfo.hint}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
              {item.error?.message && (
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Error</span>
                  <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.error.message}</p>
                </div>
              )}
              {item.count_values && (
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Count Values
                  </span>
                  <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.count_values}</p>
                </div>
              )}
              {item.parameters && (
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Parameters</span>
                  <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.parameters}</p>
                </div>
              )}
              {item.password && (
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Password</span>
                  <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.password}</p>
                </div>
              )}
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Pubkey</span>
                <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.pubkey}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export interface AdminHistoryPage {
  items: AdminHistoryItem[];
  total: number;
  page: number;
  pages: number;
}

/** The last 50 runs for `hexPubkey`, asked only for an admin. */
export function useAdminUserHistory(hexPubkey: string, isAdmin: boolean): UseQueryResult<AdminHistoryPage> {
  return useQuery<AdminHistoryPage>({
    queryKey: ["/api/admin/users", hexPubkey, "history", 50],
    queryFn: () => apiClient.getAdminUserHistory(hexPubkey, { size: 50 }),
    enabled: isAdmin && !!hexPubkey,
    staleTime: 60_000,
    retry: false,
  });
}

export function AdminHistoryCard({ query: adminHistoryQuery }: { query: UseQueryResult<AdminHistoryPage> }) {
  return (
    <div
      className="mt-6 overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 dark:border-amber-500/25 dark:bg-slate-900 dark:bg-none"
      data-testid="card-admin-history"
    >
      <div className="flex items-center gap-2 border-b border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
        <Shield className="h-4 w-4 text-amber-600" />
        <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
          Admin — Brainstorm History
        </span>
        <Badge className="ml-auto border-amber-300 bg-amber-100 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          /admin/users/{"{pubkey}"}/history
        </Badge>
      </div>
      <div className="p-4">
        {adminHistoryQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Loading history...</span>
          </div>
        ) : adminHistoryQuery.isError ? (
          <div className="py-6 text-center">
            <p className="text-xs text-red-500 dark:text-red-400">Failed to load admin history</p>
            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
              {adminHistoryQuery.error instanceof Error ? adminHistoryQuery.error.message : "Unknown error"}
            </p>
          </div>
        ) : !adminHistoryQuery.data?.items?.length ? (
          <div className="py-6 text-center" data-testid="empty-admin-history">
            <Shield className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No Brainstorm calculation history for this user
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {adminHistoryQuery.data.total} calculation record
              {adminHistoryQuery.data.total !== 1 ? "s" : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-amber-200/40 dark:border-amber-500/20">
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      ID
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Source
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      TA Status
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Pub Status
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Algorithm
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Queue
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Created
                    </th>
                    <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {adminHistoryQuery.data.items.map((item: AdminHistoryItem, idx: number) => (
                    <AdminHistoryRow key={item.private_id || idx} item={item} idx={idx} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
