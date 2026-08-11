export { StanceButtons as TagVoteButton } from "@/components/share/StanceControl";

/**
 * The tag page's per-person vote control.
 *
 * Its implementation moved to `StanceControl` when issue #41 B2 turned out to
 * affect four surfaces rather than one. This file kept its name so the call
 * sites read the same; the behaviour it re-exports differs in one way from what
 * used to live here.
 *
 * What changed: this component already had two buttons, so it was the closest
 * of the four to correct — but each button still toggled against your current
 * stance (`onVote(agreed ? -1 : 1)`) under a tooltip reading "You agree — tap to
 * withdraw". There is no withdraw. That press published a permanent public
 * disagreement, which is the opposite of what the tooltip promised. Pressing the
 * stance you already hold is now inert.
 */
