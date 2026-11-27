import { useState } from "react";
import { Check, Flag, Loader2, UserMinus } from "lucide-react";
import { useRelationshipBadges } from "@/hooks/useRelationshipBadges";
import { useToast } from "@/hooks/use-toast";
import { useUnfollow } from "@/hooks/useUnfollow";
import { cn } from "@/lib/utils";
import { reportUser } from "@/services/socialActions";

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400";
const DONE = "inline-flex items-center gap-1 px-1 py-1.5 text-xs font-medium text-red-800/80 dark:text-red-200/70";

/**
 * What a signed-in reader can do about a Compromised account they know:
 * stop following it, and report it. One click each, no confirm — the page has
 * already said why, and neither is the click people regret here.
 *
 * The report goes out as `impersonation` (NIP-56): whoever posts from this key
 * now is not the person its followers think it is. Nothing for a signed-out
 * reader or the account itself.
 */
export function CompromisedActions({ pubkey, className }: { pubkey: string; className?: string }) {
  const { toast } = useToast();
  const rel = useRelationshipBadges(pubkey);
  const { state: unfollowState, unfollow } = useUnfollow(pubkey);
  const unfollowed = unfollowState === "done";
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const busy = unfollowState === "busy" ? "unfollow" : reporting ? "report" : null;
  if (!rel.enabled) return null;

  const report = async () => {
    setReporting(true);
    const res = await reportUser(pubkey, "impersonation");
    setReporting(false);
    if (res.success) {
      setReported(true);
      toast({ title: "Reported", description: "This lowers its standing in your network." });
    } else if (!res.cancelled) {
      toast({ variant: "destructive", title: "Couldn't report", description: res.error || "Try again." });
    }
  };

  const showUnfollow = rel.isFollowing && !unfollowed;
  const isReported = reported || !!rel.report;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="compromised-actions">
      {showUnfollow && (
        <button
          type="button"
          onClick={() => void unfollow()}
          disabled={busy !== null}
          className={cn(
            BUTTON,
            "border-red-600 bg-red-600 text-white hover:bg-red-700 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-400",
          )}
          data-testid="compromised-unfollow"
        >
          {busy === "unfollow" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserMinus className="h-3.5 w-3.5" />
          )}
          Unfollow this account
        </button>
      )}
      {unfollowed && (
        <span className={DONE} data-testid="compromised-unfollowed">
          <Check className="h-3.5 w-3.5" /> Unfollowed
        </span>
      )}
      {isReported ? (
        <span className={DONE} data-testid="compromised-reported">
          <Check className="h-3.5 w-3.5" /> Reported
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void report()}
          disabled={busy !== null}
          className={cn(
            BUTTON,
            "border-red-300 bg-white text-red-800 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-900/60",
          )}
          data-testid="compromised-report"
        >
          {busy === "report" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
          Report
        </button>
      )}
      {/* One click sends it, so the button says what it sends: a report anyone can see. */}
      {!isReported && (
        <span className="text-[11px] text-red-800/70 dark:text-red-200/60" data-testid="compromised-report-public">
          Reports are public
        </span>
      )}
    </div>
  );
}
