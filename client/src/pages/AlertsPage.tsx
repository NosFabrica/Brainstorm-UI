import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert, ShieldCheck, Loader2, Search, Eye, EyeOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout, fetchProfileMap } from "@/services/nostr";
import { useNetworkAlerts, selectFlaggedAlerts } from "@/hooks/useNetworkAlerts";
import { AlertRow, useAlertActions } from "@/components/dashboard/NetworkAlertsModule";
import type { NetworkAlertEntry } from "@/services/api";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

// Two scopes plus the ignored list. There used to be an "All" tab, and it was
// the default — which is what made this page a dump: it mixed the handful of
// flagged accounts you actually follow in with 100+ strangers two hops out.
// Keeping it would have restored that view one click from the new default, and
// left "Ignore all" ambiguous about which population it was about to act on.
//
// "ignored" is a different axis (state, not distance), but it earns a tab: the
// list is cross-scope, "Ignore all" can fill it with 100 accounts in one click,
// and it needs the same search/sort as everything else here.
type Scope = "follows" | "extended" | "ignored";
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

  const { dismissed, ignored, isEscalated, ignoredBaseline, actionsFor, ignoreBatch, handleUnignore, unignoreBatch, dialogs } = useAlertActions(observer, flagged);
  // Seeded from `?scope=`, defaulting to your follows. The dashboard's extended
  // footnote has always linked to /alerts?scope=extended, but nothing read the
  // param, so that deliberate step silently landed on the wrong list. Read-on-
  // mount with no writeback matches SettingsPage/EventPage/SharePage, and means
  // a plain /alerts always opens on the population you can actually act on.
  const scopeParam = new URLSearchParams(useSearch()).get("scope");
  const initialScope: Scope = scopeParam === "extended" || scopeParam === "ignored" ? scopeParam : "follows";
  const [scope, setScope] = useState<Scope>(initialScope);
  const [sort, setSort] = useState<SortKey>("reports");
  const [query, setQuery] = useState("");
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Acted-on accounts (unfollow/mute/report) always drop off. Ignored ones move
  // to the Ignored tab rather than vanishing — which is the whole point of that
  // tab, since "Ignore all" can send 100 accounts there in one click.
  // Ignored accounts reappear on their own once reports climb sharply, so an
  // escalated one counts as live even while it sits in the ignored set — and it
  // is therefore NOT listed under Ignored, where it would be double-counted
  // while already demanding attention in its own scope tab.
  const isSuppressed = (e: NetworkAlertEntry) =>
    ignored.has(e.pubkey) && !isEscalated(e.pubkey, e.verifiedReporterCount);
  const live = flagged.filter((e) => !dismissed.has(e.pubkey) && !isSuppressed(e));
  const ignoredList = flagged.filter((e) => !dismissed.has(e.pubkey) && isSuppressed(e));
  const ignoredCount = ignoredList.length;
  const followsCount = live.filter((e) => e.hops <= 1).length;
  const extendedCount = live.filter((e) => e.hops >= 2).length;

  const rows = useMemo(() => {
    let list =
      scope === "ignored" ? ignoredList
      : live.filter((e) => (scope === "follows" ? e.hops <= 1 : e.hops >= 2));
    const qq = query.trim().toLowerCase();
    if (qq) list = list.filter((e) => nameFor(e.pubkey).toLowerCase().includes(qq));
    const key = (e: NetworkAlertEntry) =>
      sort === "reports" ? e.verifiedReporterCount : sort === "muted" ? e.verifiedMuterCount : e.influence ?? 0;
    return [...list].sort((a, b) => key(b) - key(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ignoredList, scope, query, sort, profiles]);

  const viewingIgnored = scope === "ignored";

  // "Ignore all" acts on exactly what's visible (current scope + search), so the
  // count on the button is always what gets ignored — no hidden surprises.
  const searching = query.trim().length > 0;
  // The count line carries the SCOPE ("55 in extended reach") and the button
  // carries the ACTION ("Ignore all 55"). Splitting them keeps the button short
  // enough to read on a phone while the pair stays unambiguous about what would
  // be ignored — the two sit side by side on desktop, stacked on mobile.
  const countLabel = searching
    ? `${rows.length} matching “${query.trim()}”`
    : viewingIgnored ? `${rows.length} ignored`
    : scope === "extended" ? `${rows.length} in extended reach`
    : `${rows.length} of your follows`;
  const bulkLabel = viewingIgnored ? `Un-ignore all ${rows.length}` : `Ignore all ${rows.length}`;
  const bulkScopeLabel = searching ? undefined
    : scope === "extended" ? "extended reach"
    : viewingIgnored ? undefined
    : "your follows";
  // Ignoring accounts you actually follow is higher-stakes than dismissing far-off
  // extended-reach noise, so a batch that includes any follow gets a confirm first.
  // Un-ignoring never needs one: it only ever shows you MORE, so the destructive
  // direction is the only one worth interrupting.
  const bulkHasFollows = !viewingIgnored && rows.some((e) => e.hops <= 1);
  const runBulkIgnore = () => {
    if (viewingIgnored) unignoreBatch(rows.map((e) => e.pubkey));
    else ignoreBatch(rows.map((e) => ({ pubkey: e.pubkey, atReports: e.verifiedReporterCount })), bulkScopeLabel);
    setConfirmBulk(false);
  };

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
            {scopeTab("follows", "Your follows", followsCount)}
            {scopeTab("extended", "Extended reach", extendedCount)}
            {/* Always rendered, including at 0 — the other two show 0 too, and a
                tab that appears and disappears reshuffles the row under you. */}
            {scopeTab("ignored", "Ignored", ignoredCount)}
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

        {/* List action bar — one row that belongs to the list rather than three
            stacked strips of chrome. Left: what you're looking at, plus the undo
            path back to ignored accounts. Right: the bulk action.

            Desktop puts the action opposite the count (the Gmail/Linear shape).
            Mobile stacks and takes the button FULL WIDTH: a lone right-floated
            pill on a phone reads as an afterthought and sits away from the thumb,
            the same problem the footer strip had. */}
        {(rows.length > 1 || ignoredCount > 0) && (
          <div className="mb-4 border-t border-slate-100 dark:border-slate-800/60 pt-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300" data-testid="alerts-count">
                  {countLabel}
                </span>
              </div>

              {/* Same slot, inverted on the Ignored tab. Recovery has to match the
                  way the problem is created: "Ignore all 100" is one click, so
                  undoing it can't be 100. */}
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => (bulkHasFollows ? setConfirmBulk(true) : runBulkIgnore())}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-accent/40 hover:text-brand-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white sm:w-auto sm:py-1.5"
                  data-testid="alerts-ignore-all"
                >
                  {viewingIgnored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {bulkLabel}
                </button>
              )}
            </div>

            {/* Says what Ignore actually IS, wherever the action is offered — not
                only once you've already ignored something. The old gate meant a
                first-timer facing 55 alerts saw "Ignore all" with no explanation,
                which is exactly the person who needs the reassurance before they
                dare touch a safety control. */}
            {/* Plain words, and nothing here that isn't literally true.
                The old line said "nothing is published, it syncs to your
                account" — two claims that contradict each other, since syncing
                IS a publish (an encrypted note only you can read, but a note).
                On a safety control, being caught in a small inaccuracy costs
                more than the reassurance was worth, so the sync fact moved to
                the Settings card where it's a feature rather than a defence.
                "Climb sharply" was vaguer than the rule; "a lot more people" is
                plain and stays true for both halves of it (double, or +5). */}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Ignoring just hides them from your alerts. It doesn't report them, mute them,
              or tell anyone. If a lot more people report them, they'll show up again.
            </p>
          </div>
        )}

        {/* Body */}
        {!observer ? null : q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Scanning your network…</div>
        ) : q.isError ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 py-8">Couldn't load your network alerts. <button type="button" onClick={() => q.refetch()} className="font-semibold text-brand-link hover:underline">Try again</button></div>
        ) : rows.length === 0 ? (
          /* Scope-aware, because with "Your follows" as the default this is now
             the MOST COMMON thing on the page — most people follow nobody who's
             flagged. The old copy fell through to "No matches for this filter",
             which read as a broken filter when the truth was good news. Say the
             good news, and hand over the one door worth taking. */
          <div className="flex flex-col items-start gap-2 py-8">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              {searching
                ? `No matches for “${query.trim()}” in ${viewingIgnored ? "your ignored list" : scope === "extended" ? "extended reach" : "your follows"}.`
                : viewingIgnored
                  ? "You haven't ignored anyone."
                  : ignoredCount > 0
                    ? `Nothing needs your attention — ${ignoredCount} ignored ${ignoredCount === 1 ? "account is" : "accounts are"} in the Ignored tab.`
                    : scope === "extended"
                      ? "Nothing flagged in your extended reach."
                      : "None of the people you follow are flagged."}
            </div>
            {!searching && scope === "follows" && extendedCount > 0 && (
              <button
                type="button"
                onClick={() => setScope("extended")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
                data-testid="alerts-empty-extended-link"
              >
                <Eye className="h-3.5 w-3.5" />
                {extendedCount} flagged further out — we're watching →
              </button>
            )}
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
                // Presence of this switches AlertRow to its neutral variant.
                onUnignore={viewingIgnored ? () => handleUnignore(e.pubkey, nameFor(e.pubkey), e.verifiedReporterCount) : undefined}
              />
            ))}
          </div>
        )}
      </main>

      {dialogs}

      {/* Confirm only when the batch sweeps in accounts you follow — extended-reach
          noise clears with a single click + Undo, but hiding your own follows'
          warnings deserves a beat. */}
      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent data-testid="alerts-ignore-all-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Ignore {rows.length} accounts?</AlertDialogTitle>
            <AlertDialogDescription>
              This batch includes accounts you follow. Ignoring just hides them from your
              alerts — it doesn't report them, mute them, or tell anyone, and they'll show
              up again if a lot more people report them. You can undo right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); runBulkIgnore(); }}>
              Ignore all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
