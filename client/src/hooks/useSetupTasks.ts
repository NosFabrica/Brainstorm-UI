import { useMemo } from "react";
import { useActiveAccount } from "applesauce-react/hooks";

import { canBackUp } from "@/accounts/backup";
import { getMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { knownFollowCount } from "@/lib/followStore";

/**
 * The account-setup checklist, read from LIVE account state.
 *
 * Extracted so the landing page's PostSignupCard and the dashboard's setup card
 * can't disagree about what's left to do — the two surfaces used to be able to
 * show different answers because each recomputed the flags itself.
 *
 * Deliberately not persisted as "progress": every task is derived from the thing
 * it actually asks for (a follow exists, the account has been handed its backup,
 * a picture is on the kind-0), so it can never claim done for something the user
 * undid.
 */

export type SetupTaskKey = "network" | "backup" | "photo";

export interface SetupTask {
  key: SetupTaskKey;
  /** Imperative label — what the user still has to do. */
  label: string;
  /** One line on why it's worth doing. */
  detail: string;
  done: boolean;
}

export interface SetupState {
  tasks: SetupTask[];
  remaining: SetupTask[];
  /** The same answers by name, for a surface that renders one tile per task. */
  done: Record<SetupTaskKey, boolean>;
  doneCount: number;
  allDone: boolean;
  /**
   * Whether a setup checklist should be offered at all.
   *
   * Only for accounts CREATED IN THIS APP whose key this device holds. A
   * returning user who signed in with their own nsec or an extension already owns
   * their profile and their backup, so showing them "back up your account" is both
   * wrong and slightly alarming.
   */
  eligible: boolean;
}

export function useSetupTasks(): SetupState {
  const user = useActiveAccountDisplay();
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const pubkey = user?.pubkey ?? "";
  const picture = user?.picture;
  // The same question the backup chain answers, so the checklist and the nags
  // can't disagree about whether this account still has something to do.
  const backupNeed = useBackupNeed();

  return useMemo(() => {
    const networkStarted = pubkey ? knownFollowCount(pubkey) >= 1 : false;
    const hasPhoto = !!picture;
    const createdInApp = !!account && getMetadata(account).createdInApp === true;

    const tasks: SetupTask[] = [
      {
        key: "network",
        label: "Follow a few accounts",
        detail: "Your Verification Score is built from who you follow.",
        done: networkStarted,
      },
      {
        key: "backup",
        label: "Back up your account",
        detail: "Save your key file — it's the only way back in.",
        done: backupNeed === null,
      },
      {
        key: "photo",
        label: "Add a photo and bio",
        detail: "People decide whether to trust a face, not an npub.",
        done: hasPhoto,
      },
    ];

    const doneCount = tasks.filter((t) => t.done).length;
    return {
      tasks,
      remaining: tasks.filter((t) => !t.done),
      done: { network: networkStarted, backup: backupNeed === null, photo: hasPhoto },
      doneCount,
      allDone: doneCount === tasks.length,
      eligible: !!pubkey && createdInApp && canBackUp(account),
    };
  }, [pubkey, picture, account, backupNeed]);
}
