import { use$, useAccountManager } from "applesauce-react/hooks";

import { signerUnreachable$ } from "@/accounts/signer-liveness";
import type { BrainstormAccount } from "@/accounts/metadata";

/**
 * The Active Account while its remote signer isn't answering, else null. Null
 * for the first tick too — deciding costs a round trip, and nothing should
 * accuse a signer on a guess.
 */
export function useSignerUnreachable(): BrainstormAccount | null {
  const manager = useAccountManager();
  return use$(() => signerUnreachable$(manager), [manager]) ?? null;
}
