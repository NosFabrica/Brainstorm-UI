import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Eye, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { parseIsoMs, isItemFailed, getFailureStage, extractErrorMessage, normalizeErrorKey } from "../failures";
import { formatTimestamp, timeAgo, truncateError } from "../format";
import { type BrainstormRequestInstance } from "../types";

/**
 * Groups the activity feed's failed requests by stage + normalized error
 * message so an admin can see *why* things are failing, expand a pattern to see
 * every affected user, and re-run the whole group in one click.
 */
export function FailureBreakdownCard({
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

  // FIXME(audit): sends its runs without claiming them in the console's in-flight set
  // (useInFlightTriggers), so a group retry can duplicate a run a row or a bulk re-trigger has out.
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

  // Nothing to act on: the card is one line, not a block of empty space.
  const quiet = !isError && !isLoading && totalFailures === 0;
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm dark:shadow-none ${quiet ? "border-border" : "border-red-200/70 dark:border-red-500/25"}`}
      data-testid="card-failure-breakdown"
    >
      <div
        className={`flex items-start justify-between gap-3 px-5 ${quiet ? "py-3" : "border-b border-red-100 py-4 dark:border-red-500/20"}`}
      >
        <div>
          <h3
            className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {quiet ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            )}{" "}
            Failure Breakdown
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {totalFailures === 0
              ? "No failures in this range."
              : `${totalFailures} failed request${totalFailures === 1 ? "" : "s"} across ${groups.length} pattern${groups.length === 1 ? "" : "s"} — expand one to see who's affected and re-run them.`}
          </p>
        </div>
        <Chip tone={totalFailures === 0 ? "emerald" : "red"} className="px-2 py-1 font-bold tabular-nums">
          {totalFailures}
        </Chip>
      </div>
      {quiet ? null : (
        <div className="p-5">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <XCircle className="mb-2 h-8 w-8 text-red-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Couldn't load failure data</p>
              <p className="mt-1 max-w-md text-[11px] text-slate-500 dark:text-slate-400">
                {errorMessage || "The activity feed did not respond."}
              </p>
            </div>
          ) : isLoading && totalFailures === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
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
                          <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300">
                            {g.count}×
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {users.length} user{users.length === 1 ? "" : "s"} affected
                          </span>
                          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
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
                              onClick={() => void retryGroup(g.key, users)}
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
                                  className="inline-flex shrink-0 items-center gap-1 text-[10px] text-slate-400 hover:text-brand-deep dark:text-slate-500"
                                >
                                  <Eye className="h-3 w-3" /> view
                                </button>
                              </li>
                            ))}
                            {users.length > 100 && (
                              <li className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
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
      )}
    </div>
  );
}
