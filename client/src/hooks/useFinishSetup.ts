import { useMemo } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAssistantDutyMenu } from "@/hooks/useAssistantDutyMenu";
import { useDmStatus } from "@/hooks/useDirectMessages";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useTrustListsStatus } from "@/hooks/useTrustListsStatus";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { knownFollowCount } from "@/lib/followStore";
import type { MenuStatus } from "@/lib/dutyMenu";
import { isNip85Activated } from "@/lib/nip85Activation";

/**
 * The account-setup model behind every "Finish setting up your account"
 * surface: the header banner, the /setup checklist page, the dashboard's
 * setup card and the account menu's Account setup row. Three steps — create
 * your account (done the moment you're signed in), create your follow list
 * (feeds the scoring), activate your Brainstorm account (the kind-10040 that
 * lets other apps find the scores). A Treasure Map that already gives the rank
 * duty to another Assistant counts as activated: they chose who publishes their
 * scores, and we don't nag them to choose again.
 *
 * A fourth where the server can publish it: the Brainstorm Assistant's Duty
 * Menu, up to date with what the server offers it (hooks/useAssistantDutyMenu,
 * docs/assistant/DUTY-MENU-ASK.md). A server without the route has no such
 * step: it is neither shown nor counted, so nobody is asked for what they
 * can't do.
 *
 * /setup also offers optional extras outside the count: handing that rank duty
 * to their Brainstorm Assistant, and turning on private messages
 * (MessagesSetupRow). Only the account menu counts what's left of those, and
 * quietly.
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
  /** Brainstorm's Assistant has the rank duty — or another Assistant does (`scoresElsewhere`). */
  activateDone: boolean;
  /** Relay-verified "their Treasure Map gives no Assistant the rank duty". */
  activatePending: boolean;
  /**
   * Their Treasure Map gives the rank duty to another Assistant: the step is
   * done, and handing that duty to their Brainstorm Assistant is an optional extra.
   */
  scoresElsewhere: boolean;
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
  /**
   * The Duty Menu step, where the server supports it: the published menu against
   * the offer, or "checking" while either is read. Undefined: no such step here.
   */
  dutyMenu?: MenuStatus | "checking";
  /** Relay-verified "the Assistant's Duty Menu is missing or out of date". */
  dutyMenuPending?: boolean;
  /** How many steps are counted: account, follow list, activation, the Duty Menu where offered — never optional extras. */
  totalSteps: number;
  allDone: boolean;
  /** Private messages once the engine has looked — "off" is an optional extra. Unknown while it starts. */
  messages?: "on" | "off";
  /** Optional extras not done yet — what the account menu's row counts. Never nags. */
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
  const menu = useAssistantDutyMenu(pubkey);

  return useMemo(() => {
    const signedIn = !!pubkey;
    const followCount = pubkey ? knownFollowCount(pubkey) : 0;
    const followDone = followCount >= 1 || followVerdict === "has-follows";
    const followPending = signedIn && !followDone && followVerdict === "none";

    // Brainstorm's Assistant has the duty, or this browser recorded that it does.
    const brainstormActive = locallyActivated || providerStatus === "brainstorm";
    // Another Assistant has the rank duty: their choice, so the step is done —
    // the same respect the automatic publish shows it (ensureBrainstormTrustAnchor).
    const scoresElsewhere = signedIn && providerStatus === "other";
    const activateDone = brainstormActive || scoresElsewhere;
    const activatePending = signedIn && !activateDone && providerStatus === "none";
    // Their Trusted Lists exist but the 10040 doesn't name them: an update,
    // flagged apart from the steps — only where Brainstorm's Assistant is theirs.
    const listsPending = signedIn && brainstormActive && listsStatus === "missing";

    // The Duty Menu is a step only once the server has said what it offers.
    const menuCounted = signedIn && menu.supported === true;
    const dutyMenu: FinishSetupState["dutyMenu"] = menuCounted ? (menu.status ?? "checking") : undefined;
    const dutyMenuDone = dutyMenu === "current";
    const dutyMenuPending = menuCounted && menu.settled && (dutyMenu === "missing" || dutyMenu === "out-of-date");

    const remaining = (followPending ? 1 : 0) + (activatePending ? 1 : 0) + (dutyMenuPending ? 1 : 0);
    // The counted steps: account (done once signed in), follow list, activation, then the Duty Menu where offered.
    const steps = [true, followDone, activateDone, ...(menuCounted ? [dutyMenuDone] : [])];
    const doneCount = steps.filter(Boolean).length;
    // Messages is known once the engine has looked: no inbox list is "off", when
    // /setup offers "Turn on". Still starting, or stopped: not known, not counted.
    const messages: FinishSetupState["messages"] = !signedIn
      ? undefined
      : dmStatus === "ready"
        ? "on"
        : dmStatus === "no-inbox"
          ? "off"
          : undefined;
    const optionalRemaining = (scoresElsewhere ? 1 : 0) + (messages === "off" ? 1 : 0);

    return {
      signedIn,
      followDone,
      followPending,
      followCount,
      activateDone,
      activatePending,
      scoresElsewhere,
      listsPending,
      dutyMenu,
      dutyMenuPending,
      remaining,
      doneCount,
      totalSteps: steps.length,
      allDone: followDone && activateDone && (!menuCounted || dutyMenuDone),
      messages,
      optionalRemaining,
    };
  }, [
    pubkey,
    followVerdict,
    providerStatus,
    locallyActivated,
    listsStatus,
    dmStatus,
    menu.supported,
    menu.status,
    menu.settled,
  ]);
}
