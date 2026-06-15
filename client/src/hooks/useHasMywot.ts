import { hasSessionToken } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";
import { useSelfHistory } from "@/hooks/useSelf";

export function useHasMywot(): { hasMywot: boolean; taPubkey: string | null } {
  const user = getCurrentUser();
  // `useSelfHistory` calls `/user/history` via `authenticatedFetch`, which on
  // 401 wipes storage and hard-redirects to "/". Gating on a stale
  // `nostr_user` alone (which `getCurrentUser()` accepts) would let that
  // redirect hijack anonymous/public flows when the token is missing or
  // expired, so we require a real session token before fetching.
  const pubkey = hasSessionToken() ? user?.pubkey : undefined;
  const { data } = useSelfHistory(pubkey);
  const taPubkey: string | null = data?.data?.ta_pubkey ?? null;
  return { hasMywot: !!taPubkey, taPubkey };
}
