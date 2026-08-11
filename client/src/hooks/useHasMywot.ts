import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { activeHasSession } from "@/accounts/session";

export function useHasMywot(): { hasMywot: boolean; taPubkey: string | null } {
  const user = useActiveAccountDisplay();
  // `useSelfHistory` calls `/user/history` via `authenticatedFetch`, which on
  // 401 wipes storage and hard-redirects to "/". An Account can be active with
  // no Session at all (a deferred re-auth), so gating on identity alone would
  // let that redirect hijack anonymous/public flows — require a real token.
  const pubkey = activeHasSession() ? user?.pubkey : undefined;
  const { data } = useSelfHistory(pubkey);
  const taPubkey: string | null = data?.data?.ta_pubkey ?? null;
  return { hasMywot: !!taPubkey, taPubkey };
}
