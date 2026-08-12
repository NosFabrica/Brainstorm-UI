import { useState } from "react";

import { BackupReminder } from "@/components/BackupReminder";
import { DeferredSessionCard } from "@/components/DeferredSession";
import { PostSignupCard } from "@/components/PostSignupCard";
import { SignerUnreachableCard } from "@/components/SignerUnreachableCard";
import { useDeferredSession } from "@/hooks/useDeferredSession";
import { useSignerUnreachable } from "@/hooks/useSignerUnreachable";

/**
 * The account-level card strip: at most one nudge at a time.
 *
 * Priority is unlock → signer → backup → post-signup. The first two win because
 * they are blocking signing *right now*, where the backup nag is about a future
 * risk and returns in a couple of days regardless. Dismissing the unlock card
 * hands the strip back rather than silencing the rest of the chain.
 *
 * Unlock outranks the signer because it is the cheaper ask: a password this
 * device can already answer, against going to find another device. Both at once
 * is barely reachable anyway — a remote Account has no local key to unlock — so
 * this is about the order being defined rather than a case anyone will hit.
 *
 * The order below is the order of that priority, not a rendering detail. The two
 * lower cards do also arbitrate between themselves — the reminder waits while the
 * post-signup card is offering the same backup — but a strip that reads
 * bottom-to-top only holds while both of those gates stay correct, and a reader
 * checking the rule against the source shouldn't have to prove that first.
 */
export function AccountCards() {
  const deferred = useDeferredSession();
  const signerUnreachable = useSignerUnreachable();
  const [unlockDismissed, setUnlockDismissed] = useState(false);

  if (deferred && !unlockDismissed) {
    return <DeferredSessionCard onDismiss={() => setUnlockDismissed(true)} />;
  }

  // Gates itself on whether the signer is answering, so the strip only has to
  // know where it sits in the order.
  if (signerUnreachable) return <SignerUnreachableCard />;

  return (
    <>
      <BackupReminder />
      <PostSignupCard />
    </>
  );
}
