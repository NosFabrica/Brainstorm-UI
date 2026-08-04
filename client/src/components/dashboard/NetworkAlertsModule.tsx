import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, VolumeX, UserMinus, ArrowRight, Loader2, ChevronDown, Eye, EyeOff, Flag, AlertTriangle, X } from "lucide-react";
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
import { ignoredAlertMap, ignoreAlert, unignoreAlert, ignoreMany, unignoreMany, hydrateIgnoredFromNostr, backfillIgnoredBaselines, whenIgnoreSyncSettles, hasEscalated, actedAlertSet, markActed } from "@/lib/networkAlertsIgnored";

// Module scope, not per-hook: the point is to say this ONCE, not once per hook
// instance and certainly not once per ignored account. The likeliest cause (a
// signer that can't do NIP-44) fails on every single write, so a per-action
// warning would fire eight times while someone clears eight alerts.
let warnedLocalOnlyThisSession = false;

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };
type PendingAction = { pubkey: string; name: string; action: "unfollow" | "mute" };
type ReportTarget = { pubkey: string; name: string; picture?: string; nip05?: string };
/** Display bits used to confirm WHO is about to be reported. */
export type ActionProfile = { picture?: string; nip05?: string };

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
export function useAlertActions(observer: string, current?: { pubkey: string; verifiedReporterCount: number }[]) {
  const { toast } = useToast();
  // Persisted so an unfollow/mute/report hides the account on every surface
  // (dashboard + /alerts) and across reloads, not just in this hook instance.
  const [dismissed, setDismissed] = useState<Set<string>>(() => actedAlertSet(observer));
  const [ignored, setIgnored] = useState<Map<string, number | null>>(() => ignoredAlertMap(observer));
  useEffect(() => {
    // Local copy paints immediately; the account's encrypted NIP-78 list merges
    // in when it arrives, so a dismissal made on another device carries over.
    setIgnored(ignoredAlertMap(observer));
    setDismissed(actedAlertSet(observer));
    let live = true;
    void hydrateIgnoredFromNostr(observer).then((merged) => { if (live) setIgnored(merged); }).catch(() => {});
    return () => { live = false; };
  }, [observer]);

  // One-time repair for entries stored before escalation baselines existed: they
  // would otherwise stay hidden at any report count, which would make the
  // "they'll show up again" promise beside the Ignore button a lie. Guarded so it
  // only writes when there's genuinely something to fix — persist() publishes.
  const currentSig = (current ?? []).map((e) => `${e.pubkey}:${e.verifiedReporterCount}`).join(",");
  useEffect(() => {
    if (!observer || !current?.length) return;
    const repaired = backfillIgnoredBaselines(observer, current);
    if (repaired) setIgnored(repaired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer, currentSig]);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportType, setReportType] = useState<string>("");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);

  /**
   * Acted-on accounts stay gone. Ignored ones stay hidden UNTIL their reports
   * materially worsen — ignoring someone at 9 reports shouldn't blind you at 60.
   */
  const isHidden = (pk: string, currentReports: number) => {
    if (dismissed.has(pk)) return true;
    if (!ignored.has(pk)) return false;
    return !hasEscalated(ignored.get(pk) ?? null, currentReports);
  };
  /** True when this row is back only because it got materially worse. */
  const isEscalated = (pk: string, currentReports: number) =>
    ignored.has(pk) && hasEscalated(ignored.get(pk) ?? null, currentReports);
  const ignoredBaseline = (pk: string) => ignored.get(pk) ?? null;

  /**
   * Show the toast immediately, then correct it if the account copy didn't land.
   *
   * Amends the toast already on screen rather than firing a second one: the
   * action itself SUCCEEDED — the row is hidden right here — so a separate red
   * "something went wrong" would misreport it, and would drop a second toast on
   * top of the first a beat after the user moved on. Only the cross-device copy
   * failed, so only that sentence changes.
   */
  function toastWithSync(opts: Parameters<typeof toast>[0], localOnlyDescription: string) {
    const t = toast(opts);
    void whenIgnoreSyncSettles().then((state) => {
      if (state !== "local-only" || warnedLocalOnlyThisSession) return;
      warnedLocalOnlyThisSession = true;
      t.update({ ...opts, id: t.id, description: localOnlyDescription });
    });
    return t;
  }

  function handleIgnore(pubkey: string, name: string, atReports: number) {
    setIgnored(ignoreAlert(observer, pubkey, atReports));
    toastWithSync({
      // The main barrier to using Ignore is fear that it does something public —
      // so the toast leads with what it does NOT do.
      title: `Ignored ${name}`,
      description: "Hidden from your alerts. Nothing was reported, muted, or shared \u2014 and they'll show up again if a lot more people report them.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo ignore" onClick={() => setIgnored(unignoreAlert(observer, pubkey))}>
          Undo
        </ToastAction>
      ),
    }, "Hidden on this device. We couldn't save it to your account, so it won't follow you to your other devices.");
  }


  /**
   * Put an ignored account back in the alerts list.
   *
   * Undo re-ignores at the ORIGINAL baseline, not today's report count: the
   * baseline is what the escalation check measures against, so re-ignoring at a
   * higher number would quietly raise the bar for resurfacing and make Undo
   * lossy. Falls back to the current count for legacy entries with no baseline.
   */
  function handleUnignore(pubkey: string, name: string, currentReports: number) {
    const baseline = ignored.get(pubkey) ?? currentReports;
    setIgnored(unignoreAlert(observer, pubkey));
    toastWithSync({
      title: `Un-ignored ${name}`,
      description: "Back in your alerts. Nothing was reported, muted, or shared.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo un-ignore" onClick={() => setIgnored(ignoreAlert(observer, pubkey, baseline))}>
          Undo
        </ToastAction>
      ),
    }, "Back in your alerts on this device. We couldn't save the change to your account.");
  }

  /** Bulk inverse of `ignoreBatch` — same baseline-preserving Undo. */
  function unignoreBatch(pubkeys: string[], scopeLabel?: string) {
    if (pubkeys.length === 0) return;
    const restore = pubkeys.map((pk) => ({ pubkey: pk, atReports: ignored.get(pk) ?? 0 }));
    setIgnored(unignoreMany(observer, pubkeys));
    toastWithSync({
      title: `Un-ignored ${pubkeys.length} ${pubkeys.length === 1 ? "account" : "accounts"}${scopeLabel ? ` in ${scopeLabel}` : ""}`,
      description: "Back in your alerts. Nothing was reported, muted, or shared.",
      duration: 8000,
      action: (
        <ToastAction altText="Undo un-ignore all" onClick={() => setIgnored(ignoreMany(observer, restore))}>
          Undo
        </ToastAction>
      ),
    }, "Back in your alerts on this device. We couldn't save the change to your account.");
  }

  /**
   * Bulk-ignore a batch (the "Ignore all" action). One persist + one publish,
   * one toast, with a single Undo that un-ignores the whole batch. Callers scope
   * the batch (e.g. everything in extended reach) and pass a label for the toast.
   */
  function ignoreBatch(items: { pubkey: string; atReports: number }[], scopeLabel?: string) {
    if (items.length === 0) return;
    setIgnored(ignoreMany(observer, items));
    const keys = items.map((i) => i.pubkey);
    toastWithSync({
      title: `Ignored ${items.length} ${items.length === 1 ? "account" : "accounts"}${scopeLabel ? ` in ${scopeLabel}` : ""}`,
      description: "Hidden from your alerts. Nothing was reported, muted, or shared — and they'll show up again if a lot more people report them.",
      duration: 8000,
      action: (
        <ToastAction altText="Undo ignore all" onClick={() => setIgnored(unignoreMany(observer, keys))}>
          Undo
        </ToastAction>
      ),
    }, "Hidden on this device. We couldn't save them to your account, so they won't follow you to your other devices.");
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    const { pubkey, name, action } = pending;
    const res = action === "unfollow" ? await unfollowUser(pubkey) : await muteUser(pubkey);
    setBusy(false);
    setPending(null);
    if (res.success) {
      setDismissed(markActed(observer, pubkey));
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
      setDismissed(markActed(observer, pubkey));
      toast({ title: `Reported ${name}`, description: "Your report was published to Nostr.", duration: 4000 });
    } else {
      toast({ title: `Couldn't report ${name}`, description: res.error, variant: "destructive", duration: 6000 });
    }
  }

  const actionsFor = (pubkey: string, name: string, atReports: number, profile?: ActionProfile): RowActions => ({
    onIgnore: () => handleIgnore(pubkey, name, atReports),
    onUnfollow: () => setPending({ pubkey, name, action: "unfollow" }),
    onMute: () => setPending({ pubkey, name, action: "mute" }),
    onReport: () => {
      setReportType("");
      setReportNote("");
      setReportTarget({ pubkey, name, picture: profile?.picture, nip05: profile?.nip05 });
    },
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
            {/* Generic title + an explicit identity row below: reporting publishes a
                public accusation signed with the user's key, so who they're acting
                on must be unmistakable — and the name can be an unresolved npub. */}
            <AlertDialogTitle>Report this account?</AlertDialogTitle>
            <AlertDialogDescription>
              Published publicly on Nostr and signed with your key. You can withdraw it
              later, though copies may remain on relays.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* min-w-0 at BOTH levels: an npub is one unbroken token, so without it
              the flex row refuses to shrink and widens the whole dialog past the
              viewport on mobile. */}
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-2.5" data-testid="report-identity">
            <Avatar className="h-9 w-9 shrink-0 rounded-full border border-slate-200 dark:border-slate-800">
              {reportTarget?.picture ? <AvatarImage src={reportTarget.picture} alt={reportTarget?.name ?? ""} className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{reportTarget?.name}</p>
              {reportTarget?.nip05 ? (
                <p className="truncate text-xs text-brand-primary dark:text-brand-link">{reportTarget.nip05.replace(/^_@/, "")}</p>
              ) : (
                <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  {reportTarget ? npubFromPubkey(reportTarget.pubkey) : ""}
                </p>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">Pick a reason:</p>
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

  return { dismissed, ignored, isHidden, isEscalated, ignoredBaseline, actionsFor, ignoreBatch, handleUnignore, unignoreBatch, dialogs: dialogs as ReactNode };
}

/**
 * Live Network Alerts — the dashboard's trust-&-safety console. Surfaces accounts
 * IN the observer's network that verified people report past threshold (flagged),
 * direct follows first, extended reach second. Fully async (its own query) so the
 * ~10s call never blocks the rest of the dashboard. Client-side deltas mark what's
 * NEW since the last visit. Every flagged row reads as a negative event (red accent
 * + "Reported" chip) and offers ignore / unfollow / mute / report.
 */
export function NetworkAlertsModule({ observer, enabled, onEmptyChange }: {
  observer: string;
  enabled: boolean;
  /** Lets the dashboard reflow: with nothing to act on, alerts shouldn't hold a column. */
  onEmptyChange?: (empty: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const q = useNetworkAlerts(observer, { enabled });
  const data = q.data?.data;

  const flagged = useMemo(() => selectFlaggedAlerts(data), [data]);
  // Follows only. Accounts at 2+ hops are still fetched (the /alerts page reads
  // the same query from cache) but this card never renders or counts them.
  const direct = useMemo(() => flagged.filter((e) => e.hops <= 1), [flagged]);

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

  const { isHidden, isEscalated, ignoredBaseline, actionsFor, dialogs } = useAlertActions(observer, flagged);

  // New-first within each section so a freshly-flagged account jumps to the top
  // (and carries the NEW tag) instead of hiding mid-list or in extended.
  const newFirst = (arr: NetworkAlertEntry[]) =>
    [...arr].sort((a, b) => (newSet.has(b.pubkey) ? 1 : 0) - (newSet.has(a.pubkey) ? 1 : 0));
  const visibleDirect = newFirst(direct.filter((e) => !isHidden(e.pubkey, e.verifiedReporterCount)));
  const newCount = visibleDirect.filter((e) => newSet.has(e.pubkey)).length;
  const flaggedCount = visibleDirect.length;

  const nameFor = (pk: string) => profiles.get(pk)?.display_name || profiles.get(pk)?.name || `${npubFromPubkey(pk).slice(0, 12)}…`;

  // "Nothing needs you" = none of YOUR FOLLOWS are flagged. Extended reach is
  // deliberately not part of this: it can't put the card into a state the user
  // has to deal with, and it can't keep the card on screen after they've
  // dismissed the all-clear. The dismiss stays safe to persist for the reason it
  // always was — the moment one of your follows is flagged this goes false and
  // the card comes back regardless.
  const isEmpty = enabled && !q.isLoading && !q.isError && visibleDirect.length === 0;

  // User can minimize the card to a slim one-row bar; the choice is remembered
  // per account. Collapsing also tells the dashboard to give "Your Network" the
  // full row (same reflow as the all-clear state), so nothing sits half-empty.
  const COLLAPSE_KEY = `brainstorm_alerts_collapsed:${observer}`;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(!!localStorage.getItem(COLLAPSE_KEY)); } catch {}
  }, [COLLAPSE_KEY]);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { next ? localStorage.setItem(COLLAPSE_KEY, "1") : localStorage.removeItem(COLLAPSE_KEY); } catch {}
      return next;
    });
  }

  // "Condensed" (empty OR minimized) is what the dashboard reflows on.
  const condensed = isEmpty || collapsed;
  useEffect(() => { onEmptyChange?.(condensed); }, [condensed, onEmptyChange]);

  // The all-clear can be dismissed. Safe to persist because it ONLY suppresses
  // the empty state — the moment anything is actually flagged, isEmpty goes false
  // and the card renders regardless. So a user can never hide a real alert.
  const CLEAR_KEY = `brainstorm_alerts_clear_dismissed:${observer}`;
  const [clearDismissed, setClearDismissed] = useState(false);
  useEffect(() => {
    try { setClearDismissed(!!localStorage.getItem(CLEAR_KEY)); } catch {}
  }, [CLEAR_KEY]);
  function dismissClear() {
    try { localStorage.setItem(CLEAR_KEY, "1"); } catch {}
    setClearDismissed(true);
  }
  if (isEmpty && clearDismissed) return null;

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
    escalatedFrom: isEscalated(e.pubkey, e.verifiedReporterCount) ? ignoredBaseline(e.pubkey) : null,
    onDeepDive: () => navigate(`/profile/${npubFromPubkey(e.pubkey)}`),
    onWhy: () => navigate(`/p/${npubFromPubkey(e.pubkey)}/reporters`),
    ...actionsFor(e.pubkey, nameFor(e.pubkey), e.verifiedReporterCount, {
      picture: profiles.get(e.pubkey)?.picture,
      nip05: profiles.get(e.pubkey)?.nip05,
    }),
  });

  // The quiet door to /alerts, shown in every state. Deliberately carries NO
  // COUNT: this is the dashboard, and any number attached to "flagged" reads as
  // a queue you're behind on, however gently it's styled. Extended reach — the
  // accounts you don't follow — doesn't appear on this card at all any more. It
  // lives on /alerts behind its own tab, where the count belongs to someone who
  // went looking for it rather than someone who just opened their dashboard.
  const manageLink = (
    <button
      type="button"
      onClick={() => navigate("/alerts")}
      className="mt-1 self-start text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
      data-testid="network-alerts-view-all"
    >
      Manage alerts →
    </button>
  );

  // ---- states -------------------------------------------------------------
  const header = (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
        <ShieldAlert className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        Network Alerts
      </span>
      {/* Counts YOUR FOLLOWS only. It used to be follows + extended, so someone
          whose own follow list was spotless still got a red "100 flagged" — a
          count of strangers, in alert red, at the top of their dashboard. The
          badge is the card's loudest signal; it has to mean "this many things
          need YOU", and nothing in extended reach does. */}
      {enabled && flaggedCount > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 px-2 py-0.5 text-[11px] font-bold" data-testid="network-alerts-flagged-count">
          <AlertTriangle className="h-3 w-3" />
          {flaggedCount} flagged
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {newCount > 0 && !collapsed && (
          <button type="button" onClick={markAllSeen} className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded" data-testid="network-alerts-mark-seen">
            Mark all seen
          </button>
        )}
        {enabled && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand network alerts" : "Minimize network alerts"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand" : "Minimize"}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="network-alerts-collapse"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 flex flex-col gap-3 h-full w-full" data-testid="card-network-alerts">
      {header}

      {/* Body hidden when minimized — the header bar (with the flagged count and
          the expand chevron) is all that remains, and the dashboard reflows so
          "Your Network" takes the full row. */}
      {!collapsed && (!enabled ? (
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
      ) : visibleDirect.length === 0 ? (
        /* All-clear is the steady state, so it gets one line — not half the row.
           Still shown rather than hidden: for a safety feature a missing widget
           is ambiguous ("is it still watching?"), and hiding it would make the
           dashboard reflow every time an alert arrives or clears.

           Gated on YOUR FOLLOWS alone. It used to also require extended reach to
           be empty, so anyone with flagged strangers nearby — the normal case —
           could never be told their own follows were fine, however spotless they
           were. And "Your network looks clean" is scoped to "Everyone you follow"
           for the same reason: extended reach IS your network at 2 hops, so the
           old wording flatly contradicted the footnote sitting under it. */
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" data-testid="network-alerts-clear">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">Everyone you follow looks clean.</span>{" "}
              We're watching in the background.
            </span>
            <button
              type="button"
              onClick={dismissClear}
              aria-label="Hide the all-clear"
              title="Hide this. It comes back the moment something is flagged."
              className="ml-auto shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              data-testid="network-alerts-clear-dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {manageLink}
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

          {/* "Manage" rather than "View all flagged accounts": /alerts now opens
              on your follows, and the dashboard already lists every one of them
              above — so the promise of a bigger list was false. What the page
              actually adds is search, sort, bulk ignore and the ignored list. */}
          {manageLink}
        </>
      ))}

      {dialogs}
    </Card>
  );
}

export function AlertRow({ entry, name, picture, isNew, following, escalatedFrom = null, onUnignore, onDeepDive, onWhy, onIgnore, onUnfollow, onMute, onReport }: {
  entry: NetworkAlertEntry; name: string; picture?: string; isNew: boolean; following: boolean;
  /** Reports at the time this was ignored — set only when it came back worse. */
  escalatedFrom?: number | null;
  /**
   * Present only in the Ignored list. Switches the row to its neutral variant:
   * you already decided this account doesn't need you, so re-running the alarm
   * treatment at it is wrong, and its "Ignore" button would be a no-op. The row
   * drops the red accent and wash, mutes the reported chip to context, and
   * offers exactly two things — put it back, or look at who it was.
   */
  onUnignore?: () => void;
  onDeepDive: () => void; onWhy: () => void; onIgnore: () => void; onUnfollow: () => void; onMute: () => void; onReport: () => void;
}) {
  const actionBtn = "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";
  const ignoredView = !!onUnignore;
  return (
    // Red left-edge accent + faint wash marks the whole row as a flagged/negative
    // event — dropped in the ignored view, which is a record, not an alert.
    <div
      className={`flex flex-col gap-2 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800/60 ${
        ignoredView ? "bg-slate-50/60 dark:bg-slate-900/40" : "border-l-[3px] border-l-red-500/70 bg-red-500/[0.03] dark:bg-red-500/[0.05]"
      }`}
      data-testid={`network-alert-row-${entry.pubkey.slice(0, 8)}`}
    >
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
            {escalatedFrom != null && (
              <span className="shrink-0 rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold leading-none" data-testid="network-alert-escalated">WORSE</span>
            )}
            <span
              className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                ignoredView
                  ? "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                  : "bg-red-500/15 text-red-600 dark:text-red-400"
              }`}
              data-testid="network-alert-reported"
            >
              <AlertTriangle className="h-2.5 w-2.5" />Reported · {entry.verifiedReporterCount}
            </span>
            {isWidelyMuted(entry) && <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold"><VolumeX className="h-2.5 w-2.5" />muted</span>}
          </div>
          <button type="button" onClick={onWhy} className="block truncate text-left text-[11px] text-slate-500 dark:text-slate-400 hover:text-brand-link hover:underline" data-testid="network-alert-why">
            {escalatedFrom != null
              ? `You ignored this at ${escalatedFrom} reports — now ${entry.verifiedReporterCount}`
              : `${entry.verifiedReporterCount} verified reports${entry.verifiedMuterCount > 0 ? ` · muted by ${entry.verifiedMuterCount}` : ""}`} · why?
          </button>
        </div>
        <VerificationCoin score01={entry.influence} pov="global" size={22} className="shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-10">
        {ignoredView ? (
          <button type="button" onClick={onUnignore} title="Show this in your alerts again" aria-label={`Un-ignore ${name}`} className={`${actionBtn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-accent/50 hover:text-brand-deep dark:hover:text-white`} data-testid="network-alert-unignore">
            <Eye className="h-3 w-3" /> Un-ignore
          </button>
        ) : (
          <button type="button" onClick={onIgnore} title="Ignore this alert (no changes published)" aria-label={`Ignore ${name}`} className={`${actionBtn} border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200`} data-testid="network-alert-ignore">
            <EyeOff className="h-3 w-3" /> Ignore
          </button>
        )}
        {!ignoredView && following && (
          <button type="button" onClick={onUnfollow} title="Unfollow" aria-label={`Unfollow ${name}`} className={`${actionBtn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-600`} data-testid="network-alert-unfollow">
            <UserMinus className="h-3 w-3" /> Unfollow
          </button>
        )}
        {!ignoredView && (
          <>
            <button type="button" onClick={onMute} title="Mute" aria-label={`Mute ${name}`} className={`${actionBtn} border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600`} data-testid="network-alert-mute">
              <VolumeX className="h-3 w-3" /> Mute
            </button>
            <button type="button" onClick={onReport} title="Report (publishes a NIP-56 report)" aria-label={`Report ${name}`} className={`${actionBtn} border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600`} data-testid="network-alert-report">
              <Flag className="h-3 w-3" /> Report
            </button>
          </>
        )}
        <button type="button" onClick={onDeepDive} title="View profile" aria-label={`View ${name}'s profile`} className={`${actionBtn} ml-auto border-brand-accent/30 bg-brand-accent/[0.06] text-brand-deep dark:text-brand-accent hover:border-brand-accent/50`} data-testid="network-alert-deepdive">
          View <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
