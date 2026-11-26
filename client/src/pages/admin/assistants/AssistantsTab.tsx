import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Clock,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  Loader2,
  Sparkles,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { useState, useEffect, Fragment } from "react";
import { useDraftCommit } from "@/components/admin/users/useDraftCommit";
import { StatusBadge } from "../StatusBadge";
import { POLL_OVERVIEW_MS, POLL_ACTIVITY_MS, BOOST_INTERVAL_MS } from "../constants";
import { formatTimestamp } from "../format";
import { type PageSizeOption } from "../types";

/**
 * The Assistants tab (behind FEATURES.assistantsAdmin): publish counts, and
 * each owner's publish history. Its search, paging and open row are its own.
 */
export function AssistantsTab({ isAdmin, isBoostActive }: { isAdmin: boolean; isBoostActive: boolean }) {
  const [assistantSearch, setAssistantSearch] = useState("");
  const [assistantPage, setAssistantPage] = useState(0);
  const [assistantPageSize, setAssistantPageSize] = useState<PageSizeOption>(25);
  const [expandedAssistant, setExpandedAssistant] = useState<string | null>(null);
  // The box commits once typing pauses (useDraftCommit), so this reads it as is.
  const assistantDebouncedSearch = assistantSearch.trim();
  useEffect(() => {
    setAssistantPage(0);
  }, [assistantDebouncedSearch, assistantPageSize]);

  const assistantStatsQuery = useQuery({
    queryKey: ["/api/admin/assistants/stats"],
    queryFn: () => apiClient.getAdminAssistantStats(),
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_OVERVIEW_MS,
  });

  const assistantsListQuery = useQuery({
    queryKey: ["/api/admin/assistants", assistantDebouncedSearch, assistantPage, assistantPageSize],
    queryFn: () =>
      apiClient.getAdminAssistants({
        search: assistantDebouncedSearch || undefined,
        page: assistantPage + 1,
        size: assistantPageSize,
      }),
    enabled: isAdmin,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_ACTIVITY_MS,
  });

  const assistantHistoryQuery = useQuery({
    queryKey: ["/api/admin/assistants", expandedAssistant, "history"],
    queryFn: () =>
      expandedAssistant ? apiClient.getAdminAssistantHistory(expandedAssistant, { size: 25 }) : Promise.resolve(null),
    enabled: isAdmin && !!expandedAssistant,
    staleTime: 30_000,
  });

  return (
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
                status={statsUnavailable ? "disconnected" : assistantStatsQuery.isError ? "disconnected" : "connected"}
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
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Total Assistants
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {(stats?.totalAssistants ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Distinct owner pubkeys</p>
                  </div>
                  <div
                    className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                    data-testid="kpi-assistants-publishes"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Total Publishes
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {(stats?.totalPublishes ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Successful kind 0 events</p>
                  </div>
                  <div
                    className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                    data-testid="kpi-assistants-24h"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                  <AssistantSearchBox
                    value={assistantSearch}
                    onCommit={setAssistantSearch}
                    placeholder="Search npub or hex…"
                    className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs focus:border-brand-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 sm:w-56"
                    data-testid="input-assistant-search"
                  />
                </div>
                <StatusBadge
                  status={isUnavailable ? "disconnected" : assistantsListQuery.isError ? "disconnected" : "connected"}
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
                                    className="max-w-[220px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500"
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
                                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                        <SelectTrigger className="h-7 w-[88px] text-[11px]" data-testid="select-assistant-page-size">
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
  );
}

/** The owner search: typed into here, committed once typing pauses. */
function AssistantSearchBox({
  value,
  onCommit,
  placeholder,
  className,
  "data-testid": testId,
}: {
  value: string;
  onCommit: (text: string) => void;
  placeholder: string;
  className: string;
  "data-testid": string;
}) {
  const { draft, setDraft } = useDraftCommit(value, onCommit);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      className={className}
      data-testid={testId}
    />
  );
}
