import { useEventModel } from "applesauce-react/hooks";
import { ProfileModel } from "applesauce-core/models";
import type { ProfileContent } from "applesauce-core/helpers/profile";

/**
 * Somebody's profile, live. A subscription, not a fetch: the store answers for
 * what it holds, its loader gets what it doesn't, and a later kind-0 refreshes
 * every reader.
 *
 * `undefined` means "not known yet", not "has none" — for a guaranteed first
 * frame use the Account display cache (`useActiveAccountDisplay`).
 */
export function useProfile(pubkey?: string | null): ProfileContent | undefined {
  return useEventModel(ProfileModel, pubkey ? [pubkey] : null);
}
