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
 * The order below is the order of that priority, not a rendering detail. The two
 * lower cards do also arbitrate between themselves — the reminder waits while the
 * post-signup card is offering the same backup — but a strip that reads
 * bottom-to-top only holds while both of those gates stay correct, and a reader
 * checking the rule against the source shouldn't have to prove that first.
 */
export function AccountCards() {
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
