import { useEffect } from "react";
import { use$, useAccountManager } from "applesauce-react/hooks";
import { getDisplayName, getProfilePicture } from "applesauce-core/helpers/profile";

import { displayStream, rememberProfile, type AccountDisplay } from "@/accounts/display";
import type { BrainstormAccount } from "@/accounts/metadata";
import { useProfile } from "@/hooks/useProfile";

/**
 * The Active Account's display, live: it updates on a switch, when the profile
 * metadata arrives after login, and now when a newer kind-0 turns up from
 * anywhere at all. No setter — signing out removes the Account, and every
 * consumer hears that from here.
 *
 * Two sources, and the order between them is the point:
 *
 * - The **display cache** on `AccountMetadata` is a synchronous first paint. It
 *   is what renders the header and the account picker before any relay has
 *   answered, and it is why switching accounts doesn't flash a placeholder. It
 *   is not a source of truth.
 * - The **`ProfileModel`** is the truth, and it is a subscription. Where both
 *   have an answer the model wins; where only the cache does, the cache renders
 *   until the model has something.
 *
 * The cache is written back from the model so the picker can't sit showing a
 * name the rest of the app has moved past. `rememberProfile` no-ops when nothing
 * changed, so this cannot loop.
 */
export function useActiveAccountDisplay(): AccountDisplay | null {
  const manager = useAccountManager();
  const cached = use$(() => displayStream(manager), [manager]) ?? null;
  const pubkey = cached?.pubkey;
  const live = useProfile(pubkey);

  useEffect(() => {
    if (!live || !pubkey) return;
    // From the manager in context, not the app singleton: this hook is about
    // whichever manager is providing, and the write must land on that Account.
    const account = manager.active as BrainstormAccount | undefined;
    if (!account || account.pubkey !== pubkey) return;
    rememberProfile(account, {
      name: getDisplayName(live) || live.name || live.display_name,
      picture: getProfilePicture(live) || live.picture || live.image,
      nip05: live.nip05,
    });
  }, [live, pubkey, manager]);

  if (!cached) return null;
  // No kind-0 known yet — the cache is all there is, and it is why switching
  // accounts doesn't flash a placeholder.
  if (!live) return cached;
  // Once one exists it is authoritative in full, absences included: a kind-0 is
  // the whole profile document, so a missing picture means the avatar was
  // removed, not that we should keep showing the old one. `rememberProfile`
  // treats it the same way, which is what keeps the two in step.
  return {
    ...cached,
    displayName: getDisplayName(live) || live.name || live.display_name,
    picture: getProfilePicture(live) || live.picture || live.image,
    nip05: live.nip05,
  };
}
