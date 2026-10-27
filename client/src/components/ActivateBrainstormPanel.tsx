import type { TrustProviderStatus } from "@/services/trustAnchor";

/**
 * Should the dashboard prompt this account to activate — i.e. sign the
 * kind-10040 that tells other apps where to find their Brainstorm scores?
 *
 * Deliberately NOT gated on any calculation state: the failure this prompt
 * fixes is users who left before their scores finished publishing and so never
 * saw the legacy consent card (which waits for publishDone), went to Amethyst
 * or Nostria, and found no trace of their scores. Signing needs only the
 * account's ta_pubkey, which the backend creates during login itself
 * (authChallenge verify), so the action is always performable here.
 *
 * Reads the shared relay verdict (`useTrustProviderStatus` →
 * `checkExistingTrustProvider`, whose bar is the exact rank-pubkey ==
 * this-account's-assistant match):
 * - undefined (not settled) or "unknown" (check errored) → hidden; never
 *   flash the prompt at someone who may already be activated.
 * - In-app-created accounts → hidden; the calculate-step consent card is
 *   their surface, and AutoActivateBrainstorm publishes for them.
 * - "brainstorm" → hidden, they're done.
 * - "other" → hidden: their Treasure Map gives the rank duty to another
 *   Assistant, which is their choice (and "Not visible in apps" would be
 *   untrue). Handing it to Brainstorm is an optional extra on /setup, counted
 *   only in the account menu — never a prompt here.
 * - "none" → prompt only when the account isn't locally marked activated:
 *   absence can be relay lag, and per `nip85Activation.ts` we never downgrade
 *   on a transient miss.
 */
export function needsActivationPrompt(opts: {
  status: TrustProviderStatus | undefined;
  locallyActivated: boolean;
  createdInApp: boolean;
}): boolean {
  const { status, locallyActivated, createdInApp } = opts;
  if (!status || status === "unknown" || createdInApp) return false;
  if (status === "brainstorm" || status === "other") return false;
  return !locallyActivated;
}

// The full-width ActivateBrainstormPanel that lived here is gone: the
// dashboard now carries one prompt line (lib/dashboardPrompt), and the header's
// Finish-setup pill is the other mention. The rule above is what remains.
