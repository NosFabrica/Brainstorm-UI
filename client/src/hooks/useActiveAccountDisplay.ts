import { useEffect } from "react";
import { use$, useAccountManager } from "applesauce-react/hooks";
import { getDisplayName, getProfilePicture, getProfileContent, isValidProfile } from "applesauce-core/helpers/profile";

import { displayStream, rememberProfile, type AccountDisplay } from "@/accounts/display";
import type { BrainstormAccount } from "@/accounts/metadata";
import { eventStore } from "@/lib/eventStore";
import { useProfile } from "@/hooks/useProfile";

/**
 * The Active Account's display, live: it updates on a switch, when the profile
 * metadata arrives after login, and now when a newer kind-0 turns up from
 * anywhere at all. No setter — signing out removes the Account, and every
 * consumer hears that from here.
 *
 * Two sources: the display cache on `AccountMetadata` is a synchronous first
 * paint — not a source of truth — and the `ProfileModel` is. Where both answer,
 * the model wins. The cache is written back from it so the picker can't show a
 * name the rest of the app has moved past; `rememberProfile` no-ops on an
 * unchanged profile, so that cannot loop.
 */
export function useActiveAccountDisplay(): AccountDisplay | null {
  const manager = useAccountManager();
  const cached = use$(() => displayStream(manager), [manager]) ?? null;
  const pubkey = cached?.pubkey;

  // Subscribed for the re-render only. Its *value* is a commit behind on a switch
  // — the eager observable state keeps the previous identity's profile until the
  // new subscription emits — and a `ProfileContent` carries no author, so nothing
  // downstream can tell whose it is. Reading the store by pubkey can't mismatch,
  // and this value is written back to metadata: a stale one persists.
  useProfile(pubkey);
  const event = pubkey ? eventStore.getReplaceable(0, pubkey) : undefined;
  const live = event && isValidProfile(event) ? getProfileContent(event) : undefined;

  useEffect(() => {
    if (!live || !pubkey) return;
    // From the manager in context, not the app singleton.
    const account = manager.active as BrainstormAccount | undefined;
    if (!account || account.pubkey !== pubkey) return;
    rememberProfile(account, {
      name: getDisplayName(live) || live.name || live.display_name,
      picture: getProfilePicture(live) || live.picture || live.image,
      nip05: live.nip05,
    });
  }, [live, pubkey, manager]);

  if (!cached) return null;
  if (!live) return cached;
  // Authoritative in full, absences included: a kind-0 is the whole profile
  // document, so a missing picture means the avatar was removed.
  return {
    ...cached,
    displayName: getDisplayName(live) || live.name || live.display_name,
    picture: getProfilePicture(live) || live.picture || live.image,
    nip05: live.nip05,
  };
}
