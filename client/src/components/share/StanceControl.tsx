import { Check, Loader2, Plus, ThumbsDown } from "lucide-react";

/**
 * Agree / Disagree — the one place either stance is expressed.
 *
 * ## Why this exists (issue #41 B2)
 *
 * Four surfaces each grew their own version of this, and three of them had
 * collapsed the two stances into a single toggle:
 *
 *     onSelect={() => setStance(tag, agreed ? -1 : 1)}
 *
 * That has two defects, and the second is worse than the first.
 *
 * 1. **You had to agree before you could disagree.** From neutral the only
 *    reachable action was `+1`. `/tags/mine` — the page built for responding to
 *    what other people say about you — offered a lone "Agree" button under a
 *    header reading "Something here that's wrong? Disagree with it." Confirmed
 *    live on real accounts: three people had applied a **Neurologist** tag, and
 *    the only available response was to agree with it.
 *
 * 2. **Pressing it twice published a public disagreement.** The button read
 *    "Disagree" once you'd agreed, but people read a pressed toggle as "press
 *    again to undo". There is no undo — `buildProfileTagAssertion` accepts
 *    polarity `1` or `-1` and throws on anything else, and there's no deletion
 *    path — so the second press didn't withdraw anything. It published a
 *    permanent, signed, public statement against someone.
 *
 * ## The rule here
 *
 * Two independent controls. Either is reachable from neutral. Each shows your
 * current stance. **Pressing the one you're already on does nothing**, because
 * the only thing it could do is publish the opposite claim, and that is not what
 * "press again" means to anyone.
 *
 *     [ ✓ Agreed ]   [ Disagree ]      ← you agreed
 *     [ Agree ]      [ ✗ Disagreed ]   ← you disagreed
 *     [ Agree ]      [ Disagree ]      ← no vote yet
 *
 * No withdraw is offered anywhere, in any label or tooltip. The previous copy
 * ("You agree — tap to withdraw") promised something the protocol cannot do.
 */

export type Stance = "apply" | "dispute" | undefined;

/** Shared by both shapes: what each control does, given the current stance. */
function actions(stance: Stance) {
  const agreed = stance === "apply";
  const disagreed = stance === "dispute";
  return {
    agreed,
    disagreed,
    agreeLabel: agreed ? "Agreed" : "Agree",
    disagreeLabel: disagreed ? "Disagreed" : "Disagree",
    agreeTitle: agreed ? "You agree with this" : "Agree that this tag fits",
    disagreeTitle: disagreed ? "You disagree with this" : "Disagree that this tag fits",
  };
}

/**
 * Button pair, for list rows — the tag page's per-person control.
 *
 * `onVote` is only called when the stance would actually CHANGE. A no-op press
 * is swallowed here rather than in every caller.
 */
export function StanceButtons({
  stance,
  pending,
  onVote,
  testId = "tag-vote",
}: {
  stance?: Stance;
  pending?: boolean;
  onVote: (next: 1 | -1) => void;
  testId?: string;
}) {
  const a = actions(stance);

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      data-testid={testId}
      data-stance={stance ?? "none"}
    >
      <button
        type="button"
        onClick={() => !a.agreed && onVote(1)}
        disabled={pending || a.agreed}
        aria-pressed={a.agreed}
        title={a.agreeTitle}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-default ${
          a.agreed
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "border-slate-200 text-slate-500 hover:border-brand-primary hover:text-brand-primary disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
        }`}
        data-testid={`${testId}-agree`}
        data-agreed={a.agreed ? "true" : "false"}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : a.agreed ? (
          <Check className="h-3 w-3" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        {a.agreeLabel}
      </button>
      <button
        type="button"
        onClick={() => !a.disagreed && onVote(-1)}
        disabled={pending || a.disagreed}
        aria-pressed={a.disagreed}
        aria-label={a.disagreeTitle}
        title={a.disagreeTitle}
        className={`inline-flex items-center justify-center rounded-full border p-1.5 transition-colors disabled:cursor-default ${
          a.disagreed
            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
            : "border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500"
        }`}
        data-testid={`${testId}-disagree`}
        data-disagreed={a.disagreed ? "true" : "false"}
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * The same two choices inside a `<Command>` menu, where a row IS the control.
 *
 * A menu can't hold a button pair per row without becoming unreadable, so each
 * tag contributes two selectable entries instead — the same rule, expressed in
 * the shape the surface allows. The one matching your current stance renders as
 * state rather than an action, and selecting it does nothing.
 *
 * Returns the parts rather than rendering them, because `CommandItem` has to be
 * a direct child of `CommandGroup` for cmdk's filtering to work.
 */
export function stanceMenuRow(stance: Stance) {
  const a = actions(stance);
  return {
    ...a,
    /** Icon + trailing label for the agree entry. */
    agree: {
      icon: a.agreed ? Check : Plus,
      iconClass: a.agreed ? "text-emerald-500" : "",
      hint: a.agreed ? "Agreed" : "Agree",
      disabled: a.agreed,
      polarity: 1 as const,
    },
    /** Icon + trailing label for the disagree entry. */
    disagree: {
      icon: ThumbsDown,
      iconClass: a.disagreed ? "text-amber-500" : "",
      hint: a.disagreed ? "Disagreed" : "Disagree",
      disabled: a.disagreed,
      polarity: -1 as const,
    },
  };
}
