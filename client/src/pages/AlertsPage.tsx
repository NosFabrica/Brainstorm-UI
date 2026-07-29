import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert, ShieldCheck, Loader2, Search, Eye, EyeOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout, fetchProfileMap } from "@/services/nostr";
import { useNetworkAlerts, selectFlaggedAlerts } from "@/hooks/useNetworkAlerts";
import { AlertRow, useAlertActions } from "@/components/dashboard/NetworkAlertsModule";
import type { NetworkAlertEntry } from "@/services/api";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

type Scope = "all" | "follows" | "extended";
type SortKey = "reports" | "muted" | "influence";
type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/**
 * The full, filterable Network Alerts list — the "view all" surface behind the
 * dashboard's summary tile. Same trust-&-safety data (David's /networkAlerts),
 * but with scope filters (your follows vs extended reach), sort, and search, so a
 * long list of flagged accounts becomes a workable list instead of a dump.
 */
export default function AlertsPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useCurrentUser();
  const observer = user?.pubkey ?? "";

  const q = useNetworkAlerts(observer, { enabled: !!observer, limit: 100 });
  const data = q.data?.data;
  const flagged = useMemo(() => selectFlaggedAlerts(data), [data]);

  const flaggedPubkeys = useMemo(() => flagged.map((e) => e.pubkey), [flagged]);
  const profilesQuery = useQuery({
    queryKey: ["alerts-profiles", flaggedPubkeys.join(",")],
    queryFn: () => fetchProfileMap(flaggedPubkeys),
    enabled: flaggedPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles: Map<string, ProfileLite> = profilesQuery.data ?? new Map();
  const nameFor = (pk: string) => profiles.get(pk)?.display_name || profiles.get(pk)?.name || `${npubFromPubkey(pk).slice(0, 12)}…`;

  const { dismissed, ignored, isEscalated, ignoredBaseline, actionsFor, dialogs } = useAlertActions(observer);
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<SortKey>("reports");
  const [query, setQuery] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);

  // Acted-on accounts (unfollow/mute/report) always drop off; ignored ones drop
  // off too unless the user toggles "Show ignored".
  // Ignored accounts reappear on their own once reports climb sharply, so an
  // escalated one counts as live even while it sits in the ignored set.
  const isSuppressed = (e: NetworkAlertEntry) =>
    ignored.has(e.pubkey) && !isEscalated(e.pubkey, e.verifiedReporterCount);
  const live = flagged.filter((e) => !dismissed.has(e.pubkey) && (showIgnored || !isSuppressed(e)));
  const ignoredCount = flagged.filter((e) => isSuppressed(e) && !dismissed.has(e.pubkey)).length;
  const followsCount = live.filter((e) => e.hops <= 1).length;
  const extendedCount = live.filter((e) => e.hops >= 2).length;

  const rows = useMemo(() => {
    let list = live;
    if (scope === "follows") list = list.filter((e) => e.hops <= 1);
    else if (scope === "extended") list = list.filter((e) => e.hops >= 2);
    const qq = query.trim().toLowerCase();
    if (qq) list = list.filter((e) => nameFor(e.pubkey).toLowerCase().includes(qq));
    const key = (e: NetworkAlertEntry) =>
      sort === "reports" ? e.verifiedReporterCount : sort === "muted" ? e.verifiedMuterCount : e.influence ?? 0;
    return [...list].sort((a, b) => key(b) - key(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope, query, sort, profiles]);

  const handleLogout = () => { logout(); setUser(null); };

  const scopeTab = (val: Scope, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setScope(val)}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
        scope === val ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white",
      )}
      data-testid={`alerts-scope-${val}`}
    >
      {label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {user && <AppHeader user={user} onLogout={handleLogout} />}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <button
          type="button"
          onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) window.history.back(); else navigate("/dashboard"); }}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid="alerts-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Network Alerts</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Accounts in your network that people you trust have reported or muted.</p>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5" role="group" aria-label="Scope">
            {scopeTab("all", "All", live.length)}
            {scopeTab("follows", "Your follows", followsCount)}
            {scopeTab("extended", "Extended reach", extendedCount)}
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="h-9 w-full sm:w-48 pl-8 text-sm" data-testid="alerts-search" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-[150px] text-sm" data-testid="alerts-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reports">Most reports</SelectItem>
                <SelectItem value="muted">Most muted</SelectItem>
                <SelectItem value="influence">Influence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ignored accounts are hidden by default; this brings them back so nothing
            an "Ignore" click removed is ever permanently lost. */}
        {ignoredCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => setShowIgnored((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
              data-testid="alerts-show-ignored"
            >
              {showIgnored ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showIgnored ? "Hide ignored" : `Show ignored (${ignoredCount})`}
            </button>
            {/* Says once, where it's actionable, what Ignore actually is — rather
                than repeating the caveat in every toast. */}
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              · Ignoring only changes what you see — nothing is published, and it syncs to your account.
            </span>
          </div>
        )}

        {/* Body */}
        {!observer ? null : q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Scanning your network…</div>
        ) : q.isError ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 py-8">Couldn't load your network alerts. <button type="button" onClick={() => q.refetch()} className="font-semibold text-brand-link hover:underline">Try again</button></div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 py-8">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            {live.length > 0
              ? "No matches for this filter."
              : ignoredCount > 0
                ? `Nothing needs your attention — ${ignoredCount} ignored ${ignoredCount === 1 ? "account is" : "accounts are"} hidden.`
                : "Your network looks clean — no flagged accounts."}
          </div>
        ) : (
          <div className="space-y-1.5" data-testid="alerts-list">
            {rows.map((e) => (
              <AlertRow key={e.pubkey} entry={e} name={nameFor(e.pubkey)} picture={profiles.get(e.pubkey)?.picture} isNew={false} following={e.hops <= 1} escalatedFrom={isEscalated(e.pubkey, e.verifiedReporterCount) ? ignoredBaseline(e.pubkey) : null}
                onDeepDive={() => navigate(`/profile/${npubFromPubkey(e.pubkey)}`)}
                onWhy={() => navigate(`/p/${npubFromPubkey(e.pubkey)}/reporters`)}
                {...actionsFor(e.pubkey, nameFor(e.pubkey), e.verifiedReporterCount, {
                  picture: profiles.get(e.pubkey)?.picture,
                  nip05: profiles.get(e.pubkey)?.nip05,
                })}
              />
            ))}
          </div>
        )}
      </main>

      {dialogs}
    </div>
  );
}
