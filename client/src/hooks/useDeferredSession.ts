import { use$, useAccountManager } from "applesauce-react/hooks";

import { deferredSession$ } from "@/accounts/deferred-session";
import type { BrainstormAccount } from "@/accounts/metadata";

/**
 * The Active Account while its Session is deferred, else null — including for
 * the first tick, since deciding costs one silent unlock attempt and nothing
 * should render on a guess.
 */
export function useDeferredSession(): BrainstormAccount | null {
  const manager = useAccountManager();
  return use$(() => deferredSession$(manager), [manager]) ?? null;
}
