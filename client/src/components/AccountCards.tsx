import { useState } from "react";

import { BackupReminder } from "@/components/BackupReminder";
import { DeferredSessionCard } from "@/components/DeferredSession";
import { useActiveAccount } from "applesauce-react/hooks";

import { useDeferredSession } from "@/hooks/useDeferredSession";

/** Keyed on the Account: the strip's per-account state must not outlive it. */
export function AccountCards() {
  const account = useActiveAccount();
  return <AccountCardsFor key={account?.id ?? "anon"} />;
}

/**
 * At most one nudge. Unlock wins because it blocks data now, where the backup nag
 * is about future risk and returns in a couple of days regardless.
 */
function AccountCardsFor() {
  const deferred = useDeferredSession();
  const [unlockDismissed, setUnlockDismissed] = useState(false);

  if (deferred && !unlockDismissed) {
    return <DeferredSessionCard onDismiss={() => setUnlockDismissed(true)} />;
  }

  // The post-signup setup card used to render here too — the header's
  // FinishSetupBanner and the /setup checklist replaced every nudge it made,
  // so nothing setup-shaped sits under the search bar anymore.
  return <BackupReminder />;
}
