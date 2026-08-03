import { useState } from "react";

import { BackupReminder } from "@/components/BackupReminder";
import { DeferredSessionCard } from "@/components/DeferredSession";
import { PostSignupCard } from "@/components/PostSignupCard";
import { useDeferredSession } from "@/hooks/useDeferredSession";

/**
 * The account-level card strip: at most one nudge at a time.
 *
 * Priority is unlock → backup → post-signup. Unlock wins because it is blocking
 * data *right now*, where the backup nag is about a future risk and returns in a
 * couple of days regardless. Dismissing it hands the strip back rather than
 * silencing the rest of the chain.
 *
 * The backup and post-signup cards already arbitrate between themselves — the
 * reminder waits for the post-signup card to be dismissed.
 */
export function AccountCards() {
  const deferred = useDeferredSession();
  const [unlockDismissed, setUnlockDismissed] = useState(false);

  if (deferred && !unlockDismissed) {
    return <DeferredSessionCard onDismiss={() => setUnlockDismissed(true)} />;
  }

  return (
    <>
      <PostSignupCard />
      <BackupReminder />
    </>
  );
}
