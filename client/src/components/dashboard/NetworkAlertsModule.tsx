import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, VolumeX, UserMinus, ArrowRight, Loader2, ChevronDown, EyeOff, Flag, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useNetworkAlerts, selectFlaggedAlerts } from "@/hooks/useNetworkAlerts";
import type { NetworkAlertEntry } from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import { unfollowUser, muteUser, reportUser } from "@/services/socialActions";
import { npubFromPubkey } from "@/lib/shareId";
import { computeNewAlerts, markAlertsSeen } from "@/lib/networkAlertsSeen";
import { ignoredAlertSet, ignoreAlert, ignoreAlerts, unignoreAlert, unignoreAlerts, hydrateIgnoredFromNostr } from "@/lib/networkAlertsIgnored";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };
type PendingAction = { pubkey: string; name: string; action: "unfollow" | "mute" };
type ReportTarget = { pubkey: string; name: string };

/** Per-row action handlers, produced by useAlertActions for a given account. */
export interface RowActions {
  onIgnore: () => void;
  onUnfollow: () => void;
  onMute: () => void;
  onReport: () => void;
}

// NIP-56 report types offered in the Report dialog (the `reason` token on the
// p-tag). Kept to the handful that make sense for a trust-&-safety report.
const REPORT_TYPES: { key: string; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "impersonation", label: "Impersonation" },
  { key: "profanity", label: "Profanity" },
  { key: "illegal", label: "Illegal" },
  { key: "other", label: "Other" },
];

/** A direct follow's verified muters clearly outweigh its followers → "widely muted". */
function isWidelyMuted(e: NetworkAlertEntry): boolean {
  return e.verifiedMuterCount >= 50 && e.verifiedMuterCount >= e.verifiedFollowerCount;
}

/**
 * Shared alert-action state for both the dashboard module and the full /alerts
 * page: the four row actions (ignore / unfollow / mute / report) plus the confirm
 * + typed-report dialogs they open. Ignore is a local dismiss (no Nostr action);
 * unfollow/mute/report all optimistically remove the row on success.
 *
 * Returns `dismissed`/`ignored` sets (so callers filter their own lists),
 * `actionsFor(pubkey, name)` to wire a row, and `dialogs` to render once.
 */
export function useAlertActions(observer: string) {
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ignored, setIgnored] = useState<Set<string>>(() => ignoredAlertSet(observer));
  useEffect(() => {
    // Local copy paints immediately; the account's encrypted NIP-78 list merges
    // in when it arrives, so a dismissal made on another device carries over.
    setIgnored(ignoredAlertSet(observer));
    let live = true;
    void hydrateIgnoredFromNostr(observer).then((merged) => { if (live) setIgnored(merged); }).catch(() => {});
    return () => { live = false; };
  }, [observer]);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportType, setReportType] = useState<string>("");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);

  const isHidden = (pk: string) => dismissed.has(pk) || ignored.has(pk);

  function handleIgnore(pubkey: string, name: string) {
    setIgnored(ignoreAlert(observer, pubkey));
    toast({
      // The main barrier to using Ignore is fear that it does something public —
      // so the toast leads with what it does NOT do.
      title: `Ignored ${name}`,
      description: "Hidden from your alerts. Nothing was published and they won't be notified.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo ignore" onClick={() => setIgnored(unignoreAlert(observer, pubkey))}>
          Undo
        </ToastAction>
      ),
    });
  }

  /** Bulk ignore (e.g. every flagged account in extended reach) with a batch Undo. */
  function handleIgnoreMany(pubkeys: string[], label: string) {
    if (pubkeys.length === 0) return;
    setIgnored(ignoreAlerts(observer, pubkeys));
    toast({
      title: `Ignored ${pubkeys.length} ${label}`,
      description: "Hidden from your alerts. Nothing was published and they won't be notified.",
      duration: 8000,
      action: (
        <ToastAction altText="Undo ignore" onClick={() => setIgnored(unignoreAlerts(observer, pubkeys))}>
          Undo
        </ToastAction>
      ),
    });
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    const { pubkey, name, action } = pending;
    const res = action === "unfollow" ? await unfollowUser(pubkey) : await muteUser(pubkey);
    setBusy(false);
    setPending(null);
    if (res.success) {
      setDismissed((s) => new Set(s).add(pubkey));
      toast({ title: action === "unfollow" ? `Unfollowed ${name}` : `Muted ${name}`, duration: 4000 });
    } else {
      toast({ title: `Couldn't ${action} ${name}`, description: res.error, variant: "destructive", duration: 6000 });
    }
  }

  async function submitReport() {
    if (!reportTarget || !reportType) return;
    setReporting(true);
    const { pubkey, name } = reportTarget;
    const res = await reportUser(pubkey, reportType, reportNote);
    setReporting(false);
    setReportTarget(null);
    if (res.success) {
      setDismissed((s) => new Set(s).add(pubkey));
      toast({ title: `Reported ${name}`, description: "Your report was published to Nostr.", duration: 4000 });
    } else {
      toast({ title: `Couldn't report ${name}`, description: res.error, variant: "destructive", duration: 6000 });
    }
  }

  const actionsFor = (pubkey: string, name: string): RowActions => ({
    onIgnore: () => handleIgnore(pubkey, name),
    onUnfollow: () => setPending({ pubkey, name, action: "unfollow" }),
    onMute: () => setPending({ pubkey, name, action: "mute" }),
    onReport: () => { setReportType(""); setReportNote(""); setReportTarget({ pubkey, name }); },
  });

  const dialogs = (
    <>
      {/* Unfollow / Mute confirm */}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) setPending(null); }}>
        <AlertDialogContent data-testid="network-alerts-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "unfollow" ? `Unfollow ${pending?.name}?` : `Mute ${pending?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "unfollow"
                ? "This updates your follow list on Nostr. You can re-follow anytime."
                : "This adds them to your mute list on Nostr. You can unmute anytime."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); runAction(); }} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pending?.action === "unfollow" ? "Unfollow" : "Mute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report — NIP-56 typed report with an optional note */}
      <AlertDialog open={!!reportTarget} onOpenChange={(o) => { if (!o && !reporting) setReportTarget(null); }}>
        <AlertDialogContent data-testid="network-alerts-report">
          <AlertDialogHeader>
            <AlertDialogTitle>Report {reportTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a public report on Nostr. Pick a reason:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Report reason">
            {REPORT_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={reportType === t.key}
                onClick={() => setReportType(t.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
                  reportType === t.key
                    ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300"
                }`}
                data-testid={`report-type-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={reportNote}
            onChange={(ev) => setReportNote(ev.target.value)}
            placeholder="Add a note (optional)…"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="report-note"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => { ev.preventDefault(); submitReport(); }}
              disabled={reporting || !reportType}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-400"
            >
              {reporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { dismissed, ignored, isHidden, actionsFor, ignoreMany: handleIgnoreMany, dialogs: dialogs as ReactNode };
}

/**
 * Live Network Alerts — the dashboard's trust-&-safety console. Surfaces accounts
 * IN the observer's network that verified people report past threshold (flagged),
 * direct follows first, extended reach second. Fully async (its own query) so the
 * ~10s call never blocks the rest of the dashboard. Client-side deltas mark what's
 * NEW since the last visit. Every flagged row reads as a negative event (red accent
 * + "Reported" chip) and offers ignore / unfollow / mute / report.
 */
export function NetworkAlertsModule({ observer, enabled }: { observer: string; enabled: boolean }) {
  const [, navigate] = useLocation();
  const q = useNetworkAlerts(observer, { enabled });
  const data = q.data?.data;

  const flagged = useMemo(() => selectFlaggedAlerts(data), [data]);
  const direct = useMemo(() => flagged.filter((e) => e.hops <= 1), [flagged]);
  const extended = useMemo(() => flagged.filter((e) => e.hops >= 2), [flagged]);

  // Resolve names/avatars for every flagged account (batched).
  const flaggedPubkeys = useMemo(() => flagged.map((e) => e.pubkey), [flagged]);
  const profilesQuery = useQuery({
    queryKey: ["network-alerts-profiles", flaggedPubkeys.join(",")],
    queryFn: () => fetchProfileMap(flaggedPubkeys),
    enabled: flaggedPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles: Map<string, ProfileLite> = profilesQuery.data ?? new Map();

  // Deltas: compute "new since last visit" once per snapshot; establish a silent
  // baseline on the first-ever visit (nothing is "new" then).
  const [newSet, setNewSet] = useState<Set<string>>(new Set());
  const flaggedSig = flaggedPubkeys.join(",");
  useEffect(() => {
    if (!observer || !data) return;
    const { newPubkeys } = computeNewAlerts(observer, flaggedPubkeys);
    setNewSet(new Set(newPubkeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer, flaggedSig, !!data]);

  const { isHidden, actionsFor, ignoreMany, dialogs } = useAlertActions(observer);
  const [showExtended, setShowExtended] = useState(false);
  const [confirmBulkIgnore, setConfirmBulkIgnore] = useState(false);

  // New-first within each section so a freshly-flagged account jumps to the top
  // (and carries the NEW tag) instead of hiding mid-list or in extended.
  const newFirst = (arr: NetworkAlertEntry[]) =>
    [...arr].sort((a, b) => (newSet.has(b.pubkey) ? 1 : 0) - (newSet.has(a.pubkey) ? 1 : 0));
  const visibleDirect = newFirst(direct.filter((e) => !isHidden(e.pubkey)));
  const visibleExtended = newFirst(extended.filter((e) => !isHidden(e.pubkey)));
  const newCount = [...visibleDirect, ...visibleExtended].filter((e) => newSet.has(e.pubkey)).length;
  const flaggedCount = visibleDirect.length + visibleExtended.length;
  // Extended reach can be large (up to 100). Pin the NEW ones (always visible) and
  // cap the rest behind the toggle so the tile never balloons to a 100-row list.
  const EXT_CAP = 6;
  const newExtended = visibleExtended.filter((e) => newSet.has(e.pubkey));
  const restExtended = visibleExtended.filter((e) => !newSet.has(e.pubkey));

  const nameFor = (pk: string) => profiles.get(pk)?.display_name || profiles.get(pk)?.name || `${npubFromPubkey(pk).slice(0, 12)}…`;

  function markAllSeen() {
    markAlertsSeen(observer, flaggedPubkeys);
    setNewSet(new Set());
  }

  const rowProps = (e: NetworkAlertEntry) => ({
    entry: e,
    name: nameFor(e.pubkey),
    picture: profiles.get(e.pubkey)?.picture,
    isNew: newSet.has(e.pubkey),
    following: e.hops <= 1,
    onDeepDive: () => navigate(`/profile/${npubFromPubkey(e.pubkey)}`),
    onWhy: () => navigate(`/p/${npubFromPubkey(e.pubkey)}/reporters`),
    ...actionsFor(e.pubkey, nameFor(e.pubkey)),
  });

  // ---- states -------------------------------------------------------------
  const header = (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
        <ShieldAlert className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        Network Alerts
      </span>
      {enabled && flaggedCount > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 px-2 py-0.5 text-[11px] font-bold" data-testid="network-alerts-flagged-count">
          <AlertTriangle className="h-3 w-3" />
          {flaggedCount} flagged
        </span>
      )}
      {newCount > 0 && (
        <button type="button" onClick={markAllSeen} className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded" data-testid="network-alerts-mark-seen">
          Mark all seen
        </button>
      )}
    </div>
  );

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 flex flex-col gap-3 h-full" data-testid="card-network-alerts">
      {header}

      {!enabled ? (
        <div className="flex flex-col items-start gap-2 py-2" data-testid="network-alerts-pending">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent/10 border border-brand-accent/20">
            <ShieldCheck className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Your safety radar is warming up</p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            As soon as your trust scores finish calculating, we'll flag anyone in your network that people you trust have reported or muted — so you can act on it right here.
          </p>
        </div>
      ) : q.isLoading ? (
        <div className="space-y-2" data-testid="network-alerts-scanning">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning your network…
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : q.isError ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Couldn't scan your network.{" "}
          <button type="button" onClick={() => q.refetch()} className="font-semibold text-brand-link hover:underline">Try again</button>
        </div>
      ) : visibleDirect.length === 0 && visibleExtended.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" data-testid="network-alerts-clear">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          Your network looks clean — no flagged accounts.
        </div>
      ) : (
        <>
          {visibleDirect.length > 0 && (
            <div className="space-y-1.5" data-testid="network-alerts-direct">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Flagged in your follows ({visibleDirect.length})</p>
              {visibleDirect.map((e) => (
                <AlertRow key={e.pubkey} {...rowProps(e)} />
              ))}
            </div>
          )}

          {visibleExtended.length > 0 && (
            <div data-testid="network-alerts-extended">
              {/* Newly-flagged extended accounts are always shown — never buried. */}
              {newExtended.length > 0 && (
                <div className="space-y-1.5 mb-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">New in your extended reach</p>
                  {newExtended.map((e) => (
                    <AlertRow key={e.pubkey} {...rowProps(e)} />
                  ))}
                </div>
              )}
              {restExtended.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowExtended((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded">
                      <ChevronDown className={`h-3 w-3 transition-transform ${showExtended ? "rotate-180" : ""}`} />
                      Also in your extended reach ({restExtended.length})
                    </button>
                    {/* Extended reach is the high-volume, low-action bucket — clearing
                        it one row at a time is unworkable, so it gets an explicit
                        scoped bulk ignore. Deliberately NOT wired to "Mark all seen":
                        acknowledging badges must never silently empty the queue. */}
                    <button
                      type="button"
                      onClick={() => setConfirmBulkIgnore(true)}
                      className="ml-auto text-[11px] font-semibold text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
                      data-testid="network-alerts-ignore-extended"
                    >
                      Ignore all
                    </button>
                  </div>
                  {showExtended && (
                    <div className="mt-1.5 space-y-1.5">
                      {restExtended.slice(0, EXT_CAP).map((e) => (
                        <AlertRow key={e.pubkey} {...rowProps(e)} />
                      ))}
                      {restExtended.length > EXT_CAP && (
                        <p className="px-1 pt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          +{restExtended.length - EXT_CAP} more flagged in your extended reach
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/alerts")}
            className="mt-1 self-start text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
            data-testid="network-alerts-view-all"
          >
            View all flagged accounts →
          </button>
        </>
      )}

      {/* Bulk ignore confirm — explicit, scoped, and reversible (batch Undo). */}
      <AlertDialog open={confirmBulkIgnore} onOpenChange={setConfirmBulkIgnore}>
        <AlertDialogContent data-testid="network-alerts-bulk-ignore-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Ignore all {restExtended.length} in your extended reach?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be hidden from your alerts. Nothing is published and no one is notified — this
              only affects what you see. Your {visibleDirect.length} flagged {visibleDirect.length === 1 ? "follow" : "follows"} stay in the list, and you can bring
              these back anytime from "Show ignored" on the alerts page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                ignoreMany(restExtended.map((e) => e.pubkey), "accounts in your extended reach");
                setConfirmBulkIgnore(false);
              }}
            >
              Ignore all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dialogs}
    </Card>
  );
}

export function AlertRow({ entry, name, picture, isNew, following, onDeepDive, onWhy, onIgnore, onUnfollow, onMute, onReport }: {
  entry: NetworkAlertEntry; name: string; picture?: string; isNew: boolean; following: boolean;
  onDeepDive: () => void; onWhy: () => void; onIgnore: () => void; onUnfollow: () => void; onMute: () => void; onReport: () => void;
}) {
  const actionBtn = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";
  return (
    // Red left-edge accent + faint wash marks the whole row as a flagged/negative event.
    <div className="flex flex-col gap-2 rounded-lg border border-slate-100 dark:border-slate-800/60 border-l-[3px] border-l-red-500/70 bg-red-500/[0.03] dark:bg-red-500/[0.05] p-2.5" data-testid={`network-alert-row-${entry.pubkey.slice(0, 8)}`}>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={onDeepDive} className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40" aria-label={`View ${name}'s profile`}>
          <Avatar className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-800">
            {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
          </Avatar>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onDeepDive} className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-brand-link focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded">{name}</button>
            {isNew && <span className="shrink-0 rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold leading-none" data-testid="network-alert-new">NEW</span>}
            <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 text-[9px] font-bold" data-testid="network-alert-reported">
              <AlertTriangle className="h-2.5 w-2.5" />Reported · {entry.verifiedReporterCount}
            </span>
            {isWidelyMuted(entry) && <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold"><VolumeX className="h-2.5 w-2.5" />muted</span>}
          </div>
          <button type="button" onClick={onWhy} className="block truncate text-left text-[11px] text-slate-500 dark:text-slate-400 hover:text-brand-link hover:underline" data-testid="network-alert-why">
            {entry.verifiedReporterCount} verified reports{entry.verifiedMuterCount > 0 ? ` · muted by ${entry.verifiedMuterCount}` : ""} · why?
          </button>
        </div>
        <VerificationCoin score01={entry.influence} pov="global" size={22} className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-10">
        <button type="button" onClick={onIgnore} title="Ignore this alert (no changes published)" aria-label={`Ignore ${name}`} className={`${actionBtn} border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200`} data-testid="network-alert-ignore">
          <EyeOff className="h-3 w-3" /> Ignore
        </button>
        {following && (
          <button type="button" onClick={onUnfollow} title="Unfollow" aria-label={`Unfollow ${name}`} className={`${actionBtn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-600`} data-testid="network-alert-unfollow">
            <UserMinus className="h-3 w-3" /> Unfollow
          </button>
        )}
        <button type="button" onClick={onMute} title="Mute" aria-label={`Mute ${name}`} className={`${actionBtn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600`} data-testid="network-alert-mute">
          <VolumeX className="h-3 w-3" /> Mute
        </button>
        <button type="button" onClick={onReport} title="Report (publishes a NIP-56 report)" aria-label={`Report ${name}`} className={`${actionBtn} border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600`} data-testid="network-alert-report">
          <Flag className="h-3 w-3" /> Report
        </button>
        <button type="button" onClick={onDeepDive} title="View profile" aria-label={`View ${name}'s profile`} className={`${actionBtn} ml-auto border-brand-accent/30 bg-brand-accent/[0.06] text-brand-deep dark:text-brand-accent hover:border-brand-accent/50`} data-testid="network-alert-deepdive">
          View <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
