import { useEventModel } from "applesauce-react/hooks";
import { ProfileModel } from "applesauce-core/models";
import type { ProfileContent } from "applesauce-core/helpers/profile";

/**
 * Somebody's profile, live.
 *
 * This reads the EventStore rather than fetching: whatever is already there
 * renders immediately, and the store's own loader goes and gets what isn't
 * (`lib/loaders.ts`). Because it is a subscription and not a fetch, a relay
 * answering late with a newer kind-0 — or the user editing their own — refreshes
 * every component reading this pubkey, with no refetch and no reload.
 *
 * `undefined` means "no profile known yet", not "this person has none". Callers
 * that need a name on the first frame want the Account display cache instead,
 * which is synchronous; see `useActiveAccountDisplay`.
 */
export function useProfile(pubkey?: string | null): ProfileContent | undefined {
  return useEventModel(ProfileModel, pubkey ? [pubkey] : null);
}
