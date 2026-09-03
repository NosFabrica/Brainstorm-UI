import { use$, useAccountManager } from "applesauce-react/hooks";

import { activeHasSession$ } from "@/accounts/session";

/**
 * Whether the Active Account holds a Session, as reactive state.
 *
 * Use this — not `activeHasSession()` — anywhere the answer gates a query.
 * The plain call is read during render and the component is never told when it
 * changes, so a query gated on it stays disabled after the Session is minted,
 * and `invalidateQueries` will not refetch a disabled query.
 */
export function useHasSession(): boolean {
  const manager = useAccountManager();
  return use$(() => activeHasSession$(manager), [manager]) ?? false;
}
