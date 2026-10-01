import { use$, useAccountManager } from "applesauce-react/hooks";

/**
 * Whether there is an Active Account at all, as reactive state — with or
 * without a Session. Paired with `useHasSession()` it tells "signed out" from
 * "signed in, but the Session is missing right now", which are different
 * answers to anything that would otherwise assume a default.
 */
export function useHasAccount(): boolean {
  const manager = useAccountManager();
  return !!use$(() => manager.active$, [manager]);
}
