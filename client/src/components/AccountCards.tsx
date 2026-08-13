import { useState } from "react";

import { BackupReminder } from "@/components/BackupReminder";
import { DeferredSessionCard } from "@/components/DeferredSession";
import { PostSignupCard } from "@/components/PostSignupCard";
import { useActiveAccount } from "applesauce-react/hooks";

import { useDeferredSession } from "@/hooks/useDeferredSession";

/**
 * The account-level card strip: at most one nudge at a time.
 *
 * Priority is unlock → backup → post-signup. Unlock wins because it is blocking
 * data *right now*, where the backup nag is about a future risk and returns in a
 * couple of days regardless. Dismissing it hands the strip back rather than
 * silencing the rest of the chain.
 *
 * The order below is the order of that priority, not a rendering detail. The two
 * lower cards do also arbitrate between themselves — the reminder waits while the
 * post-signup card is offering the same backup — but a strip that reads
 * bottom-to-top only holds while both of those gates stay correct, and a reader
 * checking the rule against the source shouldn't have to prove that first.
 */
/**
 * Keyed on the Account, so switching starts the whole strip again.
 *
 * Everything below holds per-account answers in component state — a dismissal, a
 * snooze, a delivered backup and its credential. None of it resets on its own,
 * because switching accounts in-app no longer unmounts anything, so each of
 * those went on describing whoever was active when it was set. The worst was
 * `BackupPrompt`, which kept the *previous* Account's `ncryptsec` behind a
 * "Download again" button labelled with the new one.
 *
 * A key rather than five resets: the bug is "state about an Account outlived the
 * Account", and remounting answers all of it, including the next piece someone
 * adds. It lives here rather than at the call site so no caller can forget it.
 */
export function AccountCards() {
  const account = useActiveAccount();
  return <AccountCardsFor key={account?.id ?? "anon"} />;
}

function AccountCardsFor() {
  const deferred = useDeferredSession();
  const [unlockDismissed, setUnlockDismissed] = useState(false);

  if (deferred && !unlockDismissed) {
    return <DeferredSessionCard onDismiss={() => setUnlockDismissed(true)} />;
  }

  return (
    <>
      <BackupReminder />
      <PostSignupCard />
    </>
  );
}
