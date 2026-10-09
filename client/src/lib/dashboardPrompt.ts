/**
 * Which ONE prompt the dashboard carries, as a line in the status strip.
 *
 * The header's Finish-setup pill already lists every step still owed, so the
 * dashboard body doesn't repeat them as panels: a returning user used to meet
 * the pill, a "Not visible in apps yet" status AND a full Activate panel — one
 * task, three mentions, most of the first screen on a phone — with the invite
 * card underneath. One line, the most important thing first:
 *
 *  1. activate — sign the kind-10040; until then no other app can find the
 *     scores, so it outranks everything (see needsActivationPrompt).
 *  2. consent  — the post-cooldown re-ask for in-app accounts that declined
 *     the consent card (the legacy "Select Brainstorm" card's cohort).
 *  3. invite   — scores just went live; the once-per-account invite beat.
 *  4. assistant — activated, but their assistant isn't published: a nicety
 *     (it used to live inside the "Your network · Active" fold), so last.
 */
export type DashboardPromptKey = "activate" | "consent" | "invite" | "assistant";

export interface DashboardPrompt {
  key: DashboardPromptKey;
  /** What's true right now, in the reader's words. */
  label: string;
  /** The one action, as its button reads. */
  action: string;
}

export function dashboardPrompt({
  activatePending,
  consentDue,
  inviteDue,
  assistantDue = false,
}: {
  activatePending: boolean;
  consentDue: boolean;
  inviteDue: boolean;
  assistantDue?: boolean;
}): DashboardPrompt | null {
  if (activatePending) return { key: "activate", label: "Not visible in apps yet", action: "Activate Brainstorm" };
  if (consentDue) return { key: "consent", label: "Use your scores in other apps", action: "Select Brainstorm" };
  if (inviteDue) return { key: "invite", label: "Your network is live", action: "Invite friends" };
  if (assistantDue)
    return { key: "assistant", label: "Your assistant isn't published yet", action: "Publish assistant" };
  return null;
}
