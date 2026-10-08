import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { useHasSession } from "@/hooks/useHasSession";

/** `known` is false until `/user/history` has answered — `hasMywot` is only a default before that. */
export function useHasMywot(): { hasMywot: boolean; taPubkey: string | null; known: boolean } {
  const user = useActiveAccountDisplay();
  const hasSession = useHasSession();
  // `useSelfHistory` calls `/user/history` via `authenticatedFetch`, which on
  // 401 wipes storage and hard-redirects to "/". An Account can be active with
  // no Session at all (a deferred re-auth), so gating on identity alone would
  // let that redirect hijack anonymous/public flows — require a real token.
  const pubkey = hasSession ? user?.pubkey : undefined;
  const { data, isSuccess } = useSelfHistory(pubkey);
  const taPubkey: string | null = data?.data?.ta_pubkey ?? null;
  return { hasMywot: !!taPubkey, taPubkey, known: isSuccess };
}
