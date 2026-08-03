import { use$, useAccountManager } from "applesauce-react/hooks";

import { displayStream, type AccountDisplay } from "@/accounts/display";

/**
 * The Active Account's display, live: it updates on a switch *and* when the
 * profile metadata arrives after login. No setter — signing out removes the
 * Account, and every consumer hears that from here.
 */
export function useActiveAccountDisplay(): AccountDisplay | null {
  const manager = useAccountManager();
  return use$(() => displayStream(manager), [manager]) ?? null;
}
