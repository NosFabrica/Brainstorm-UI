import { Check, Loader2, Plus, ThumbsDown } from "lucide-react";

/**
 * The vote control on a tag page row: agree, or disagree.
 *
 * This began as an agree-only toggle, on the reasoning that a downvote beside
 * every name is a pile-on surface. That was half right and half wrong. It's a
 * fair reason to keep the *count* of disagreement off a profile chip — but on
 * the tag page it left people able to endorse a claim and unable to reject one,
 * which is not a neutral list, it's a ratchet. Both directions live here now.
 *
 * Each is a toggle against your own latest stance, because that's exactly what
 * the protocol stores: one assertion per (tag, target, asserter), replaced in
 * place. Tapping the state you're already in withdraws it.
 */
export function TagVoteButton({
  stance,
  pending,
  onVote,
  testId = "tag-vote",
}: {
  stance?: "apply" | "dispute";
  pending?: boolean;
  /** `null` withdraws — publishing the opposite polarity, the only "undo" there is. */
  onVote: (next: 1 | -1) => void;
  testId?: string;
}) {
  const agreed = stance === "apply";
  const disagreed = stance === "dispute";

  return (
    <div className="flex shrink-0 items-center gap-1" data-testid={testId} data-stance={stance ?? "none"}>
      <button
        type="button"
        onClick={() => onVote(agreed ? -1 : 1)}
        disabled={pending}
        aria-pressed={agreed}
        title={agreed ? "You agree — tap to withdraw" : "Agree that this tag fits"}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
          agreed
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "border-slate-200 text-slate-500 hover:border-brand-primary hover:text-brand-primary dark:border-slate-700 dark:text-slate-400"
        }`}
        data-testid={`${testId}-agree`}
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
      <button
        type="button"
        onClick={() => onVote(disagreed ? 1 : -1)}
        disabled={pending}
        aria-pressed={disagreed}
        aria-label={disagreed ? "You disagree — tap to undo" : "Disagree that this tag fits"}
        title={disagreed ? "You disagree — tap to undo" : "Disagree that this tag fits"}
        className={`inline-flex items-center justify-center rounded-full border p-1.5 transition-colors disabled:opacity-50 ${
          disagreed
            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
            : "border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-600 dark:border-slate-700 dark:text-slate-500"
        }`}
        data-testid={`${testId}-disagree`}
        data-disagreed={disagreed ? "true" : "false"}
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
    </div>
  );
}
