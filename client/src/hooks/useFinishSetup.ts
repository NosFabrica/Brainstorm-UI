import { useMemo } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAssistantDutyMenu } from "@/hooks/useAssistantDutyMenu";
import { useAssistantProfile } from "@/hooks/useAssistantProfile";
import { useAssistantTreasureMap } from "@/hooks/useAssistantTreasureMap";
import { useDmStatus } from "@/hooks/useDirectMessages";
import { useHasSession } from "@/hooks/useHasSession";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useTrustListsStatus } from "@/hooks/useTrustListsStatus";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { knownFollowCount } from "@/lib/followStore";
import { autoSetupTasks } from "@/lib/assistantSetupAuto";
import type { SelfMapStatus } from "@/lib/assistantTreasureMap";
import type { MenuStatus } from "@/lib/dutyMenu";
import { isNip85Activated } from "@/lib/nip85Activation";

/**
 * The account-setup model behind every "Finish setting up your account"
 * surface: the header banner, the /setup checklist page, the dashboard's
 * setup card and the account menu's Account setup row. Three steps — create
 * your account (it comes with its own Brainstorm Assistant: done once that
 * Assistant is live, its profile out), create your follow list
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
 * A fifth, the same way: the Assistant's own Treasure Map, listing exactly the
 * duties that are live now (hooks/useAssistantTreasureMap,
 * docs/assistant/TREASURE-MAP-ASK.md). Nothing live and nothing listed is done,
 * so nobody is asked to publish an empty Map.
 *
 * With a Brainstorm session the app does those two itself, from any page
 * (components/AutoAssistantSetup), and brings the Assistant to life the same
 * way. One it is doing, or about to, is not a step left (`accountAuto` /
 * `dutyMenuAuto` / `treasureMapAuto`): nothing nags about work under way.
 * One whose publish failed, or went through and still reads out of date, is a
 * step again, for /setup to do by hand.
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
  /**
   * Step 1: the account's Brainstorm Assistant is live (its profile out). Done
   * too while the server hasn't named the Assistant — nothing to ask for yet.
   */
  accountDone: boolean;
  /** Relay-verified "the Assistant has no profile", and the app isn't publishing one. */
  accountPending: boolean;
  /** The app is bringing the Assistant to life by itself, or about to. */
  accountAuto: boolean;
  followDone: boolean;
  /** Relay-verified "this account really follows nobody". */
  followPending: boolean;
  followCount: number;
  /**
   * Brainstorm's Assistant has the rank duty and every signal it publishes —
   * or another Assistant has rank (`scoresElsewhere`).
   */
  activateDone: boolean;
  /** Relay-verified "their Treasure Map gives no Assistant the rank duty". */
  activatePending: boolean;
  /**
   * Their Treasure Map gives the rank duty to another Assistant: the step is
   * done, and handing that duty to their Brainstorm Assistant is an optional extra.
   */
  scoresElsewhere: boolean;
  /**
   * Their Treasure Map gives their Brainstorm Assistant the rank duty but not
   * every signal it publishes (#313): the Activate step again, counted in
   * `remaining`, until a re-sign names them all. Never when another Assistant
   * has rank — that Map is theirs to complete.
   */
  signalsPending: boolean;
  /** The `30382:*` signals that re-sign would add; empty when none. */
  missingSignals: string[];
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
  /** Relay-verified "the Assistant's Duty Menu is missing or out of date", and the app isn't publishing it. */
  dutyMenuPending?: boolean;
  /** The app is publishing the Duty Menu by itself, or about to. */
  dutyMenuAuto?: boolean;
  /**
   * The Treasure Map step, where the server supports it: the Assistant's own
   * Treasure Map against the duties live now, or "checking". Undefined: no such step here.
   */
  treasureMap?: SelfMapStatus | "checking";
  /** Relay-verified "the Assistant's Treasure Map is missing or out of date", and the app isn't publishing it. */
  treasureMapPending?: boolean;
  /** The app is publishing the Treasure Map by itself, or about to. */
  treasureMapAuto?: boolean;
  /** How many steps are counted: account, follow list, activation, the Duty Menu and Treasure Map where offered — never optional extras. */
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
  const provider = useTrustProviderStatus(pubkey, taPubkey);
  const providerStatus = provider.data;
  const missing = provider.missingSignals;
  const locallyActivated = isNip85Activated(pubkey);
  const listsStatus = useTrustListsStatus(pubkey, taPubkey).data?.status;
  const dmStatus = useDmStatus();
  const menu = useAssistantDutyMenu(pubkey);
  const selfMap = useAssistantTreasureMap(pubkey);
  const profile = useAssistantProfile(pubkey);
  const hasSession = useHasSession();

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
    // Theirs, but short of a signal: the step comes back until they re-sign.
    // Only once the relays have answered (`missing` defined), never on a guess.
    const missingSignals = signedIn && brainstormActive && !scoresElsewhere ? (missing ?? []) : [];
    const signalsPending = missingSignals.length > 0;
    const activateDone = (brainstormActive && !signalsPending) || scoresElsewhere;
    const activatePending = signedIn && !activateDone && providerStatus === "none";
    // Their Trusted Lists exist but the 10040 doesn't name them: an update,
    // flagged apart from the steps — only where Brainstorm's Assistant is theirs.
    const listsPending = signedIn && brainstormActive && listsStatus === "missing";

    // What the app publishes by itself (AutoAssistantSetup): due, and not yet
    // tried or under way. A failure, or a publish that still reads out of date,
    // hands the step back to /setup.
    const autoDue =
      signedIn && hasSession
        ? autoSetupTasks(
            { supported: menu.supported, status: menu.status, settled: menu.settled },
            {
              supported: selfMap.supported,
              status: selfMap.status,
              settled: selfMap.settled,
              on: selfMap.on,
              published: selfMap.published,
            },
            { taPubkey: profile.taPubkey, settled: profile.settled, live: profile.live },
          )
        : [];
    const handling = (outcome: string | null | undefined) => outcome == null || outcome === "pending";
    const accountAuto = autoDue.includes("assistant-profile") && handling(profile.lastPublish);
    const dutyMenuAuto = autoDue.includes("duty-menu") && handling(menu.lastPublish);
    const treasureMapAuto = autoDue.includes("treasure-map") && handling(selfMap.lastPublish);

    // The Duty Menu is a step only once the server has said what it offers.
    const menuCounted = signedIn && menu.supported === true;
    const dutyMenu: FinishSetupState["dutyMenu"] = menuCounted ? (menu.status ?? "checking") : undefined;
    const dutyMenuDone = dutyMenu === "current";
    const dutyMenuPending =
      menuCounted && menu.settled && (dutyMenu === "missing" || dutyMenu === "out-of-date") && !dutyMenuAuto;

    // The Treasure Map likewise, once the server has said what it should list.
    const mapCounted = signedIn && selfMap.supported === true;
    const treasureMap: FinishSetupState["treasureMap"] = mapCounted ? (selfMap.status ?? "checking") : undefined;
    const treasureMapDone = treasureMap === "current";
    const treasureMapPending =
      mapCounted && selfMap.settled && (treasureMap === "missing" || treasureMap === "out-of-date") && !treasureMapAuto;

    // Step 1: the account's Assistant is live. Nothing to ask for until the
    // server has named it, nor before the relays have answered.
    const accountDone = signedIn && (!profile.taPubkey || profile.live);
    const accountPending = signedIn && !!profile.taPubkey && profile.settled && !profile.live && !accountAuto;

    const remaining =
      (accountPending ? 1 : 0) +
      (followPending ? 1 : 0) +
      (activatePending || signalsPending ? 1 : 0) +
      (dutyMenuPending ? 1 : 0) +
      (treasureMapPending ? 1 : 0);
    // The counted steps: account (its Assistant live), follow list, activation, then the Duty Menu and Treasure Map where offered.
    const steps = [
      accountDone,
      followDone,
      activateDone,
      ...(menuCounted ? [dutyMenuDone] : []),
      ...(mapCounted ? [treasureMapDone] : []),
    ];
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
      accountDone,
      accountPending,
      accountAuto,
      followDone,
      followPending,
      followCount,
      activateDone,
      activatePending,
      scoresElsewhere,
      signalsPending,
      missingSignals,
      listsPending,
      dutyMenu,
      dutyMenuPending,
      dutyMenuAuto,
      treasureMap,
      treasureMapPending,
      treasureMapAuto,
      remaining,
      doneCount,
      totalSteps: steps.length,
      allDone:
        accountDone && followDone && activateDone && (!menuCounted || dutyMenuDone) && (!mapCounted || treasureMapDone),
      messages,
      optionalRemaining,
    };
  }, [
    pubkey,
    followVerdict,
    providerStatus,
    missing,
    locallyActivated,
    listsStatus,
    dmStatus,
    hasSession,
    menu.supported,
    menu.status,
    menu.settled,
    menu.lastPublish,
    selfMap.supported,
    selfMap.status,
    selfMap.settled,
    selfMap.on,
    selfMap.published,
    selfMap.lastPublish,
    profile.taPubkey,
    profile.settled,
    profile.live,
    profile.lastPublish,
  ]);
}
