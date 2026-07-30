import { useMemo } from "react";
import { getCurrentUser, hasPersistentKey } from "@/services/nostr";
import { knownFollowCount } from "@/lib/followStore";

/**
 * The account-setup checklist, read from LIVE account state.
 *
 * Extracted so the landing page's PostSignupCard and the dashboard's setup card
 * can't disagree about what's left to do — the two surfaces used to be able to
 * show different answers because each recomputed the flags itself.
 *
 * Deliberately not persisted as "progress": every task is derived from the thing
 * it actually asks for (a follow exists, a backup flag is set, a picture is on the
 * kind-0), so it can never claim done for something the user undid.
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
  doneCount: number;
  allDone: boolean;
  /**
   * Whether a setup checklist should be offered at all.
   *
   * Only for accounts CREATED IN THIS APP that still hold a persistent key. A
   * returning user who signed in with their own nsec or an extension already owns
   * their profile and their backup, so showing them "back up your account" is both
   * wrong and slightly alarming.
   */
  eligible: boolean;
}

export function useSetupTasks(): SetupState {
  const user = getCurrentUser();
  const pubkey = user?.pubkey ?? "";
  const picture = user?.picture;

  return useMemo(() => {
    const read = (k: string) => {
      try { return !!k && localStorage.getItem(k) === "true"; } catch { return false; }
    };

    const networkStarted = pubkey ? knownFollowCount(pubkey) >= 1 : false;
    const backedUp = read(pubkey ? `brainstorm_backup_done:${pubkey}` : "");
    const hasPhoto = !!picture;
    const createdInApp = read(pubkey ? `brainstorm_created_inapp:${pubkey}` : "");

    const tasks: SetupTask[] = [
      {
        key: "network",
        label: "Follow a few accounts",
        detail: "Your trust scores are built from who you follow.",
        done: networkStarted,
      },
      {
        key: "backup",
        label: "Back up your account",
        detail: "Save your key file — it's the only way back in.",
        done: backedUp,
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
      doneCount,
      allDone: doneCount === tasks.length,
      eligible: !!pubkey && createdInApp && hasPersistentKey(),
    };
  }, [pubkey, picture]);
}
