import { useMemo } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useDmStatus } from "@/hooks/useDirectMessages";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useTrustListsStatus } from "@/hooks/useTrustListsStatus";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { knownFollowCount } from "@/lib/followStore";
import { isNip85Activated } from "@/lib/nip85Activation";

/**
 * The account-setup model behind every "Finish setting up your account"
 * surface: the header banner, the /setup checklist page, the dashboard's
 * setup card and the account menu's Account setup row. Three steps — create
 * your account (done the moment you're signed in), create your follow list
 * (feeds the scoring), activate your Brainstorm account (the kind-10040 that
 * lets other apps find the scores). /setup also offers private messages, as an
 * optional extra outside the count (MessagesSetupRow); only the account menu
 * counts what's left of those, and quietly.
 *
 * Two flavours of "not done", deliberately:
 *
 * - `*Done` is the optimistic local answer, for surfaces the user opened on
 *   purpose (the /setup page itself renders a pending row from these).
 * - `*Pending` is the CONFIDENT answer — true only once relays have verified
 *   there is really nothing there. The banner and the dashboard card nag from
 *   these, so a signer user whose kind-3/kind-10040 simply hasn't loaded yet is
 *   never flashed a false "2 steps left".
 */

export interface FinishSetupState {
  /** No signed-in account → every surface hides. */
  signedIn: boolean;
  followDone: boolean;
  /** Relay-verified "this account really follows nobody". */
  followPending: boolean;
  followCount: number;
  activateDone: boolean;
  /** Relay-verified "no kind-10040 names Brainstorm" (or another provider does). */
  activatePending: boolean;
  /**
   * Activated, but they have Trusted Lists their 10040 doesn't name yet: an
   * update to publish (ListsUpdate), NOT a setup step — never counted in
   * `remaining` or `doneCount`, so nothing reads as unfinished or broken.
   */
  listsPending?: boolean;
  /** Confident steps left — what the banner counts. 0 → no nagging. */
  remaining: number;
  /** Steps verifiably complete, of `totalSteps` — what the checklist page renders. */
  doneCount: number;
  /** How many steps are counted: account, follow list, activation — never optional extras. */
  totalSteps: number;
  allDone: boolean;
  /** Optional extras not done yet (messages) — what the account menu's row counts. Never nags. */
  optionalRemaining: number;
}

export function useFinishSetup(): FinishSetupState {
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey;

  const followVerdict = useVerifiedNoFollows(pubkey);
  const historyQuery = useSelfHistory(pubkey);
  const taPubkey = (historyQuery.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
  const providerStatus = useTrustProviderStatus(pubkey, taPubkey).data;
  const locallyActivated = isNip85Activated(pubkey);
  const listsStatus = useTrustListsStatus(pubkey, taPubkey).data?.status;
  const dmStatus = useDmStatus();

  return useMemo(() => {
    const signedIn = !!pubkey;
    const followCount = pubkey ? knownFollowCount(pubkey) : 0;
    const followDone = followCount >= 1 || followVerdict === "has-follows";
    const followPending = signedIn && !followDone && followVerdict === "none";

    const activateDone = locallyActivated || providerStatus === "brainstorm";
    // "other" counts as pending even when the local flag says activated: they
    // declared a different provider from another app, and re-selecting
    // Brainstorm is exactly the remedy (mirrors needsActivationPrompt).
    const activatePending = signedIn && !activateDone && (providerStatus === "none" || providerStatus === "other");
    // Their Trusted Lists exist but the 10040 doesn't name them: an update,
    // flagged apart from the steps.
    const listsPending = signedIn && activateDone && listsStatus === "missing";

    const remaining = (followPending ? 1 : 0) + (activatePending ? 1 : 0);
    // The counted steps: account (done once signed in), follow list, activation.
    const steps = [true, followDone, activateDone];
    const doneCount = steps.filter(Boolean).length;
    // Messages counts once the engine has looked and found no inbox list — when
    // /setup offers "Turn on". Still starting, stopped, or already on: nothing.
    const optionalRemaining = signedIn && dmStatus === "no-inbox" ? 1 : 0;

    return {
      signedIn,
      followDone,
      followPending,
      followCount,
      activateDone,
      activatePending,
      listsPending,
      remaining,
      doneCount,
      totalSteps: steps.length,
      allDone: followDone && activateDone,
      optionalRemaining,
    };
  }, [pubkey, followVerdict, providerStatus, locallyActivated, listsStatus, dmStatus]);
}
