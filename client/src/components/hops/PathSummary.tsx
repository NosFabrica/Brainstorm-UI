/**
 * The Connection page's quiet pieces around the path card. Quiet by default,
 * loud only for risk (Benjamin, 2026-09-24: "a more subtle, cleaner way"):
 *
 * - `PathRiskLine` — one line above the card per kind of risk, only when a
 *   checked path runs through a flagged or unverified account, with a "Show
 *   it" link that narrows the page to those paths.
 * - `PathStepper` — "Path 2 of 7 · Next" in the card's corner, only when
 *   there is more than one path to step through.
 * - `PathFootnote` — "Checked 7 of 130 paths." under the card, muted: the
 *   honest count of what was judged, out of the reader's way.
 *
 * A visitor to a clean connection sees the sentence, the card and the
 * stepper, nothing else.
 */
import { ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import type { PathRisk } from "@/lib/hopsPaths";

export type PathGroupKey = Exclude<PathRisk, "checking">;

export function PathRiskLine({
  kind,
  count,
  checked,
  complete,
  pressed,
  onToggle,
}: {
  kind: "flagged" | "unverified";
  count: number;
  /** Distinct paths judged so far. */
  checked: number;
  /** Every path is in hand, so "the N paths" needs no "we checked". */
  complete: boolean;
  pressed: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  const one = count === 1;
  const account = kind === "flagged" ? (one ? "a flagged account" : "flagged accounts") : (one ? "an unverified account" : "unverified accounts");
  return (
    <Alert
      variant={kind === "flagged" ? "destructive" : "warning"}
      className="mt-4 py-2.5 pl-3 pr-3 text-sm [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6"
      data-testid={`hops-risk-${kind}`}
    >
      <ShieldAlert className="h-4 w-4" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>
          <span className="font-semibold">{count}</span> of the {checked} paths{complete ? "" : " we checked"} {one ? "runs" : "run"} through {account}
        </span>
        <button
          type="button"
          aria-pressed={pressed}
          onClick={onToggle}
          className="font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current/40 rounded"
          data-testid={`hops-group-${kind}`}
        >
          {pressed ? "Show all" : one ? "Show it" : "Show them"}
        </button>
      </div>
    </Alert>
  );
}

export function PathStepper({ position, total, onNext }: { position: number; total: number; onNext: () => void }) {
  if (total <= 1) return null;
  return (
    <button
      type="button"
      onClick={onNext}
      className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
      title="Show the next path"
      data-testid="hops-next"
    >
      <span className="tabular-nums">Path {position} of {total}</span>
      <span aria-hidden>·</span>
      <span className="font-semibold text-brand-link">Next</span>
      <ChevronRight className="h-3.5 w-3.5 text-brand-link" />
    </button>
  );
}

export function PathFootnote({
  pathCount,
  pathCountCapped,
  checked,
  complete,
  checking,
}: {
  pathCount: number;
  pathCountCapped: boolean;
  checked: number;
  complete: boolean;
  checking: boolean;
}) {
  if (pathCount <= 1) return null;
  const countWord = `${pathCount.toLocaleString()}${pathCountCapped ? "+" : ""}`;
  return (
    <p className="mt-2 px-1 text-xs text-slate-400 dark:text-slate-500 tabular-nums" data-testid="hops-checked">
      {checking ? (
        <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Checking who's on these paths…</span>
      ) : complete ? (
        <>Checked all {countWord} paths.</>
      ) : (
        <>Checked {checked} of {countWord} paths.</>
      )}
    </p>
  );
}
