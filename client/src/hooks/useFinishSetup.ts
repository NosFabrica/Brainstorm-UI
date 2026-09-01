import { useMemo } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { knownFollowCount } from "@/lib/followStore";
import { isNip85Activated } from "@/lib/nip85Activation";

/**
 * The account-setup model behind every "Finish setting up your account"
 * surface: the header banner, the /setup checklist page and the dashboard's
 * setup card. Three steps — create your account (done the moment you're signed
 * in), create your follow list (feeds the scoring), activate your Brainstorm
 * account (the kind-10040 that lets other apps find the scores).
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
  /** Confident steps left — what the banner counts. 0 → no nagging. */
  remaining: number;
  /** Steps verifiably complete, of 3 — what the checklist page renders. */
  doneCount: number;
  allDone: boolean;
}

export function useFinishSetup(): FinishSetupState {
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey;

  const followVerdict = useVerifiedNoFollows(pubkey);
  const historyQuery = useSelfHistory(pubkey);
  const taPubkey = (historyQuery.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data
    ?.ta_pubkey;
  const providerStatus = useTrustProviderStatus(pubkey, taPubkey).data;
  const locallyActivated = isNip85Activated(pubkey);

  return useMemo(() => {
    const signedIn = !!pubkey;
    const followCount = pubkey ? knownFollowCount(pubkey) : 0;
    const followDone = followCount >= 1 || followVerdict === "has-follows";
    const followPending = signedIn && !followDone && followVerdict === "none";

    const activateDone = locallyActivated || providerStatus === "brainstorm";
    // "other" counts as pending even when the local flag says activated: they
    // declared a different provider from another app, and re-selecting
    // Brainstorm is exactly the remedy (mirrors needsActivationPrompt).
    const activatePending =
      signedIn && !activateDone && (providerStatus === "none" || providerStatus === "other");

    const remaining = (followPending ? 1 : 0) + (activatePending ? 1 : 0);
    const doneCount = 1 + (followDone ? 1 : 0) + (activateDone ? 1 : 0);

    return {
      signedIn,
      followDone,
      followPending,
      followCount,
      activateDone,
      activatePending,
      remaining,
      doneCount,
      allDone: followDone && activateDone,
    };
  }, [pubkey, followVerdict, providerStatus, locallyActivated]);
}
