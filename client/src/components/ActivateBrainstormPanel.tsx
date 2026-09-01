import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { BrainLogo } from "@/components/BrainLogo";
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
 * - "other" → prompt even when the local flag says activated (they declared a
 *   different provider from another app; re-selecting Brainstorm is exactly
 *   the remedy — and the check already dropped the stale flag).
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
  if (status === "brainstorm") return false;
  if (status === "other") return true;
  return !locallyActivated;
}

/**
 * Full-width dashboard banner prompting the user to activate their Brainstorm
 * account (sign the kind-10040) — the dashboard's on-page echo of the header's
 * finish-setup banner, pointing into the same /setup/activate flow. Uses the
 * design system's `accent` surface. No dismissal by design — it self-hides on
 * activation.
 */
export function ActivateBrainstormPanel({ onActivate }: { onActivate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card accent className="overflow-hidden" data-testid="card-activate-brainstorm">
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-brand-primary shadow-sm shadow-brand-primary/25 flex items-center justify-center shrink-0">
            <BrainLogo mono size={24} className="text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h2
              className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-activate-brainstorm-title"
            >
              Activate your Brainstorm account
            </h2>
            <p
              className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed"
              data-testid="text-activate-brainstorm-subtitle"
            >
              Sign a note that tells other apps where to find your Brainstorm scores.
            </p>
          </div>

          <button
            type="button"
            onClick={onActivate}
            className="w-full sm:w-auto h-11 px-6 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-brand-primary/20 transition-all duration-200 flex items-center justify-center gap-2 shrink-0"
            data-testid="button-activate-brainstorm"
          >
            <BrainLogo mono size={16} className="text-white" />
            Activate Brainstorm
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
