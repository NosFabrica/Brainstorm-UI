import { Check, Loader2, Plus } from "lucide-react";

/**
 * The one-tap vote on a tag page row.
 *
 * Deliberately a single toggle rather than a thumbs-up/thumbs-down pair. The
 * action people need on a list they're reading is "yes, that's right" — and the
 * protocol's withdraw is the same event with the polarity flipped, so one
 * control expresses both honestly:
 *
 *   not voted → "Agree"    (publishes polarity +1)
 *   voted     → "Agreed ✓" (tapping publishes -1, withdrawing your vote)
 *
 * Outright disagreement with a tag you never backed stays on the profile
 * picker. Putting a downvote next to every name on a public list is the
 * pile-on surface we deliberately kept off the profile chips.
 */
export function TagVoteButton({
  agreed,
  pending,
  onToggle,
  testId = "tag-vote",
}: {
  agreed: boolean;
  pending?: boolean;
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={agreed}
      title={agreed ? "You agree — tap to withdraw your vote" : "Agree that this tag fits"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        agreed
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-slate-200 text-slate-500 hover:border-brand-primary hover:text-brand-primary dark:border-slate-700 dark:text-slate-400"
      }`}
      data-testid={testId}
      data-agreed={agreed ? "true" : "false"}
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : agreed ? (
        <Check className="h-3 w-3" />
      ) : (
        <Plus className="h-3 w-3" />
      )}
      {agreed ? "Agreed" : "Agree"}
    </button>
  );
}
