import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { useHasSession } from "@/hooks/useHasSession";

/**
 * `known` once `/user/history` has answered; `isLoading` while it is being asked (not when it
 * can't be: no Session). `hasMywot` is only a default before an answer.
 */
export function useHasMywot(): { hasMywot: boolean; taPubkey: string | null; known: boolean; isLoading: boolean } {
  const user = useActiveAccountDisplay();
  const hasSession = useHasSession();
  // `useSelfHistory` calls `/user/history` via `authenticatedFetch`, which on
  // 401 wipes storage and hard-redirects to "/". An Account can be active with
  // no Session at all (a deferred re-auth), so gating on identity alone would
  // let that redirect hijack anonymous/public flows — require a real token.
  const pubkey = hasSession ? user?.pubkey : undefined;
  const { data, isSuccess, isPending } = useSelfHistory(pubkey);
  const taPubkey: string | null = data?.data?.ta_pubkey ?? null;
  return { hasMywot: !!taPubkey, taPubkey, known: isSuccess, isLoading: !!pubkey && isPending };
}
