import { useActiveAccount } from "applesauce-react/hooks";
import { signerKindOf, type SignerKind } from "@/accounts/picker";

/** How the active account signs — extension, remote signer, Amber, or a key held here — or null when signed out. */
export function useSignerKind(): SignerKind | null {
  const account = useActiveAccount();
  return account ? signerKindOf(account as Parameters<typeof signerKindOf>[0]) : null;
}
