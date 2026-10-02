import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasSession } from "@/hooks/useHasSession";
import { useSelfHistory } from "@/hooks/useSelf";
import type { DictionaryReader } from "@/services/dictionary";

/**
 * Who a concept is resolved for: the Active Account and their Tapestry
 * Assistant (lib/conceptResolution's personal and assistant copies). The
 * Assistant comes from `/user/history`, so `settled` waits for it — reading
 * without it would show the community's definition for a concept their
 * Assistant did copy, then flip. With no Session the history is never asked
 * (it is auth-only: a 401 there wipes storage and redirects), so an
 * anonymous or session-less reader is settled at once, with no Assistant.
 */
export function useDictionaryReader(): DictionaryReader & { settled: boolean } {
  const hasSession = useHasSession();
  const pubkey = useActiveAccountDisplay()?.pubkey ?? null;
  const history = useSelfHistory(hasSession ? (pubkey ?? undefined) : undefined);
  const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey ?? null;
  const settled = !(history.isPending && history.fetchStatus !== "idle");
  return { pubkey, taPubkey, settled };
}
