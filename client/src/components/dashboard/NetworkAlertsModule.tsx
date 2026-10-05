import { useState, type ReactNode } from "react";
import { VolumeX, UserMinus, ArrowRight, Loader2, Eye, EyeOff, Flag, AlertTriangle } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing, useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { isFlaggedAlert } from "@/services/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import type { NetworkAlertEntry } from "@/services/api";
import { unfollowUser, muteUser, reportUser, unreportUser } from "@/services/socialActions";
import { npubFromPubkey } from "@/lib/shareId";
import {
  ignoreAlert,
  unignoreAlert,
  ignoreMany,
  unignoreMany,
  whenIgnoreSyncSettles,
  hasEscalated,
  markActed,
  unmarkActed,
} from "@/lib/networkAlertsIgnored";
import { useAlertPrefs } from "@/hooks/useAlertPrefs";

// Module scope, not per-hook: the point is to say this ONCE, not once per hook
// instance and certainly not once per ignored account. The likeliest cause (a
// signer that can't do NIP-44) fails on every single write, so a per-action
// warning would fire eight times while someone clears eight alerts.
let warnedLocalOnlyThisSession = false;

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
 * Alert-action state for /alerts: the four row actions (ignore / unfollow / mute / report) plus the confirm
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
  const { dismissed, setDismissed, ignored, setIgnored, isHidden } = useAlertPrefs(observer, current);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportType, setReportType] = useState<string>("");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);

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
    toastWithSync(
      {
        // The main barrier to using Ignore is fear that it does something public —
        // so the toast leads with what it does NOT do.
        title: `Ignored ${name}`,
        description:
          "Hidden from your alerts. Nothing was reported, muted, or shared \u2014 and they'll show up again if a lot more people report them.",
        duration: 6000,
        action: (
          <ToastAction altText="Undo ignore" onClick={() => setIgnored(unignoreAlert(observer, pubkey))}>
            Undo
          </ToastAction>
        ),
      },
      "Hidden on this device. We couldn't save it to your account, so it won't follow you to your other devices.",
    );
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
    toastWithSync(
      {
        title: `Un-ignored ${name}`,
        description: "Back in your alerts. Nothing was reported, muted, or shared.",
        duration: 6000,
        action: (
          <ToastAction altText="Undo un-ignore" onClick={() => setIgnored(ignoreAlert(observer, pubkey, baseline))}>
            Undo
          </ToastAction>
        ),
      },
      "Back in your alerts on this device. We couldn't save the change to your account.",
    );
  }

  /** Bulk inverse of `ignoreBatch` — same baseline-preserving Undo. */
  function unignoreBatch(pubkeys: string[], scopeLabel?: string) {
    if (pubkeys.length === 0) return;
    const restore = pubkeys.map((pk) => ({ pubkey: pk, atReports: ignored.get(pk) ?? 0 }));
    setIgnored(unignoreMany(observer, pubkeys));
    toastWithSync(
      {
        title: `Un-ignored ${pubkeys.length} ${pubkeys.length === 1 ? "account" : "accounts"}${scopeLabel ? ` in ${scopeLabel}` : ""}`,
        description: "Back in your alerts. Nothing was reported, muted, or shared.",
        duration: 8000,
        action: (
          <ToastAction altText="Undo un-ignore all" onClick={() => setIgnored(ignoreMany(observer, restore))}>
            Undo
          </ToastAction>
        ),
      },
      "Back in your alerts on this device. We couldn't save the change to your account.",
    );
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
    toastWithSync(
      {
        title: `Ignored ${items.length} ${items.length === 1 ? "account" : "accounts"}${scopeLabel ? ` in ${scopeLabel}` : ""}`,
        description:
          "Hidden from your alerts. Nothing was reported, muted, or shared — and they'll show up again if a lot more people report them.",
        duration: 8000,
        action: (
          <ToastAction altText="Undo ignore all" onClick={() => setIgnored(unignoreMany(observer, keys))}>
            Undo
          </ToastAction>
        ),
      },
      "Hidden on this device. We couldn't save them to your account, so they won't follow you to your other devices.",
    );
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    const { pubkey, name, action } = pending;
    const res = action === "unfollow" ? await unfollowUser(pubkey) : await muteUser(pubkey);
    setBusy(false);
    setPending(null);
    // A declined unlock is a deliberate no, not a failure — and it carries no
    // `error`, so the destructive branch would toast an empty description.
    if (res.cancelled) return;
    if (res.success) {
      setDismissed(markActed(observer, pubkey));
      toast({ title: action === "unfollow" ? `Unfollowed ${name}` : `Muted ${name}`, duration: 4000 });
    } else {
      toast({ title: `Couldn't ${action} ${name}`, description: res.error, variant: "destructive", duration: 6000 });
    }
  }

  // Deletes the report (NIP-09) and brings the alert back; a failure says so.
  async function undoReport(pubkey: string, name: string) {
    const res = await unreportUser(pubkey);
    if (res.cancelled) return;
    if (res.success) {
      setDismissed(unmarkActed(observer, pubkey));
      toast({ title: `Report on ${name} removed`, duration: 4000 });
    } else {
      toast({
        title: `Couldn't remove the report on ${name}`,
        description: res.error,
        variant: "destructive",
        duration: 6000,
      });
    }
  }

  async function submitReport() {
    if (!reportTarget || !reportType) return;
    setReporting(true);
    const { pubkey, name } = reportTarget;
    const res = await reportUser(pubkey, reportType, reportNote);
    setReporting(false);
    setReportTarget(null);
    if (res.cancelled) return;
    if (res.success) {
      setDismissed(markActed(observer, pubkey));
      toast({
        title: `Reported ${name}`,
        description: "Your report was published to Nostr.",
        duration: 6000,
        action: (
          <ToastAction altText="Undo report" onClick={() => void undoReport(pubkey, name)}>
            Undo
          </ToastAction>
        ),
      });
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
      <AlertDialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o && !busy) setPending(null);
        }}
      >
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
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                runAction();
              }}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : pending?.action === "unfollow" ? (
                "Unfollow"
              ) : (
                "Mute"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report — NIP-56 typed report with an optional note */}
      <AlertDialog
        open={!!reportTarget}
        onOpenChange={(o) => {
          if (!o && !reporting) setReportTarget(null);
        }}
      >
        <AlertDialogContent data-testid="network-alerts-report">
          <AlertDialogHeader>
            {/* Generic title + an explicit identity row below: reporting publishes a
                public accusation signed with the user's key, so who they're acting
                on must be unmistakable — and the name can be an unresolved npub. */}
            <AlertDialogTitle>Report this account?</AlertDialogTitle>
            <AlertDialogDescription>
              Published publicly on Nostr and signed with your key. You can withdraw it later, though copies may remain
              on relays.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* min-w-0 at BOTH levels: an npub is one unbroken token, so without it
              the flex row refuses to shrink and widens the whole dialog past the
              viewport on mobile. */}
          <div
            className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60"
            data-testid="report-identity"
          >
            <Avatar className="h-9 w-9 shrink-0 rounded-full border border-slate-200 dark:border-slate-800">
              {reportTarget?.picture ? (
                <AvatarImage src={reportTarget.picture} alt={reportTarget?.name ?? ""} className="object-cover" />
              ) : null}
              <AvatarFallback className="overflow-hidden rounded-full">
                <DefaultAvatarImg />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{reportTarget?.name}</p>
              {reportTarget?.nip05 ? (
                <p className="truncate text-xs text-brand-primary dark:text-brand-link">
                  {reportTarget.nip05.replace(/^_@/, "")}
                </p>
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
                    : "border-slate-200 text-slate-600 hover:border-red-300 dark:border-slate-700 dark:text-slate-300"
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
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            data-testid="report-note"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                submitReport();
              }}
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

  return {
    dismissed,
    ignored,
    isHidden,
    isEscalated,
    ignoredBaseline,
    actionsFor,
    ignoreBatch,
    handleUnignore,
    unignoreBatch,
    dialogs: dialogs as ReactNode,
  };
}

/**
 * One flagged account, as a row of /alerts.
 */
export function AlertRow({
  entry,
  name,
  picture,
  isNew,
  following,
  escalatedFrom = null,
  onUnignore,
  onDeepDive,
  onWhy,
  onIgnore,
  onUnfollow,
  onMute,
  onReport,
}: {
  entry: NetworkAlertEntry;
  name: string;
  picture?: string;
  isNew: boolean;
  following: boolean;
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
  onDeepDive: () => void;
  onWhy: () => void;
  onIgnore: () => void;
  onUnfollow: () => void;
  onMute: () => void;
  onReport: () => void;
}) {
  const actionBtn =
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  // Decision 2: the backend's reporter threshold is the flag.
  const flagged = isFlaggedAlert(entry);
  const ring = tierRing(entry.influence, flagged);
  const ignoredView = !!onUnignore;
  return (
    // Red left-edge accent + faint wash marks the whole row as a flagged/negative
    // event — dropped in the ignored view, which is a record, not an alert.
    <div
      className={`flex flex-col gap-2 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800/60 ${
        ignoredView
          ? "bg-slate-50/60 dark:bg-slate-900/40"
          : "border-l-[3px] border-l-red-500/70 bg-red-500/[0.03] dark:bg-red-500/[0.05]"
      }`}
      data-testid={`network-alert-row-${entry.pubkey.slice(0, 8)}`}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onDeepDive}
          className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          aria-label={`View ${name}'s profile`}
        >
          <Avatar className={`h-8 w-8 rounded-full border border-slate-200 dark:border-slate-800 ${ring ?? ""}`}>
            {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden rounded-full">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onDeepDive}
              className="truncate rounded text-sm font-semibold text-slate-900 hover:text-brand-link focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-100"
            >
              {name}
            </button>
            {isNew && (
              <span
                className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white"
                data-testid="network-alert-new"
              >
                NEW
              </span>
            )}
            {escalatedFrom != null && (
              <span
                className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white"
                data-testid="network-alert-escalated"
              >
                WORSE
              </span>
            )}
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                ignoredView
                  ? "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                  : "bg-red-500/15 text-red-600 dark:text-red-400"
              }`}
              data-testid="network-alert-reported"
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Reported · {entry.verifiedReporterCount}
            </span>
            {isWidelyMuted(entry) && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                <VolumeX className="h-2.5 w-2.5" />
                muted
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onWhy}
            className="block truncate text-left text-[11px] text-slate-500 hover:text-brand-link hover:underline dark:text-slate-400"
            data-testid="network-alert-why"
          >
            {escalatedFrom != null
              ? `You ignored this at ${escalatedFrom} reports — now ${entry.verifiedReporterCount}`
              : `${entry.verifiedReporterCount} verified reports${entry.verifiedMuterCount > 0 ? ` · muted by ${entry.verifiedMuterCount}` : ""}`}{" "}
            · why?
          </button>
        </div>
        <VerificationCoin
          score01={entry.influence}
          flagged={flagged}
          pov="global"
          size={22}
          className={ring && coinReplaced ? "sr-only" : "shrink-0"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-10">
        {ignoredView ? (
          <button
            type="button"
            onClick={onUnignore}
            title="Show this in your alerts again"
            aria-label={`Un-ignore ${name}`}
            className={`${actionBtn} border-slate-200 text-slate-600 hover:border-brand-accent/50 hover:text-brand-deep dark:border-slate-700 dark:text-slate-300 dark:hover:text-white`}
            data-testid="network-alert-unignore"
          >
            <Eye className="h-3 w-3" /> Un-ignore
          </button>
        ) : (
          <button
            type="button"
            onClick={onIgnore}
            title="Ignore this alert (no changes published)"
            aria-label={`Ignore ${name}`}
            className={`${actionBtn} border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200`}
            data-testid="network-alert-ignore"
          >
            <EyeOff className="h-3 w-3" /> Ignore
          </button>
        )}
        {!ignoredView && following && (
          <button
            type="button"
            onClick={onUnfollow}
            title="Unfollow"
            aria-label={`Unfollow ${name}`}
            className={`${actionBtn} border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300`}
            data-testid="network-alert-unfollow"
          >
            <UserMinus className="h-3 w-3" /> Unfollow
          </button>
        )}
        {!ignoredView && (
          <>
            <button
              type="button"
              onClick={onMute}
              title="Mute"
              aria-label={`Mute ${name}`}
              className={`${actionBtn} border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-600 dark:border-slate-700 dark:text-slate-300`}
              data-testid="network-alert-mute"
            >
              <VolumeX className="h-3 w-3" /> Mute
            </button>
            <button
              type="button"
              onClick={onReport}
              title="Report (publishes a NIP-56 report)"
              aria-label={`Report ${name}`}
              className={`${actionBtn} border-red-300 text-red-600 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-red-500/40 dark:text-red-400`}
              data-testid="network-alert-report"
            >
              <Flag className="h-3 w-3" /> Report
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onDeepDive}
          title="View profile"
          aria-label={`View ${name}'s profile`}
          className={`${actionBtn} ml-auto border-brand-accent/30 bg-brand-accent/[0.06] text-brand-deep hover:border-brand-accent/50 dark:text-brand-accent`}
          data-testid="network-alert-deepdive"
        >
          View <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
