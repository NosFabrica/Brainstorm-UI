/**
 * The Connection page's quiet pieces around the path card — quiet by default,
 * loud only for risk:
 *
 * - `PathRiskLine` — one line above the card per kind of risk, only when a
 *   connector is flagged or unverified: the accounts and the paths through
 *   them, with a "Show them" link that steps through those accounts.
 * - `PathStepper` — "‹ Path 2 of 7 · Next ›" in the card's corner, only when
 *   there is more than one thing to step through.
 * - `PathChecking` — a muted line while the accounts are still being judged.
 *
 * A visitor to a clean connection sees the sentence, the card and the
 * stepper, nothing else.
 */
import { ChevronLeft, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import type { RiskKind } from "@/lib/hopsPaths";

export function PathRiskLine({
  kind,
  accountCount,
  paths,
  total,
  pressed,
  onToggle,
}: {
  kind: RiskKind;
  accountCount: number;
  /** Paths through any of these accounts. */
  paths: number;
  total: number;
  pressed: boolean;
  onToggle: () => void;
}) {
  if (accountCount === 0) return null;
  const one = accountCount === 1;
  const on = total === 1 ? "on the only path" : `on ${paths.toLocaleString()} of the ${total.toLocaleString()} paths`;
  return (
    <Alert
      variant={kind === "flagged" ? "destructive" : "warning"}
      className="mt-4 py-2.5 pl-3 pr-3 text-sm [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6"
      data-testid={`hops-risk-${kind}`}
    >
      <ShieldAlert className="h-4 w-4" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>
          <span className="font-semibold">{accountCount}</span> {kind} {one ? "account" : "accounts"}, {on}
        </span>
        <button
          type="button"
          aria-pressed={pressed}
          onClick={onToggle}
          className="focus-visible:ring-current/40 rounded font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2"
          data-testid={`hops-group-${kind}`}
        >
          {pressed ? "Show all" : one ? "Show it" : "Show them"}
        </button>
      </div>
    </Alert>
  );
}

const stepCls =
  "inline-flex items-center gap-1 rounded text-xs text-slate-500 transition-colors hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-400 dark:hover:text-slate-200";

export function PathStepper({
  label,
  position,
  total,
  onPrevious,
  onNext,
}: {
  /** What is being stepped through: "Path", "Flagged account"… */
  label: string;
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrevious} className={stepCls} title="Previous" data-testid="hops-prev">
        <ChevronLeft className="h-3.5 w-3.5 text-brand-link" />
        <span className="sr-only">Previous</span>
      </button>
      <button type="button" onClick={onNext} className={stepCls} title="Next" data-testid="hops-next">
        <span className="tabular-nums">
          {label} {position.toLocaleString()} of {total.toLocaleString()}
        </span>
        <span aria-hidden>·</span>
        <span className="font-semibold text-brand-link">Next</span>
        <ChevronRight className="h-3.5 w-3.5 text-brand-link" />
      </button>
    </div>
  );
}

export function PathChecking() {
  return (
    <p className="mt-2 px-1 text-xs text-slate-400 dark:text-slate-500" data-testid="hops-checking">
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking who's on these paths…
      </span>
    </p>
  );
}
