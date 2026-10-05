import { useEffect } from "react";
import { askTrustProviderList, type TrustProviderStatus } from "@/services/trustAnchor";
import { getNip85RelayUrl } from "@/services/nostr";
import { declaresTrustProvider, trustProviderStatusOf } from "@/lib/nip85Declaration";
import { clearNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";

/** Unconfigured is "no relay to match", not a crash in render. */
function nip85Relay(): string {
  try {
    return getNip85RelayUrl();
  } catch {
    return "";
  }
}

/** The user's kind-10040, live from the store; asked relay-first, newest wins. */
export function useTrustProviderList(pubkey: string | null | undefined) {
  return useStoreReplaceable(10040, pubkey, () => askTrustProviderList(pubkey!));
}

/**
 * What the user's on-relay kind-10040 says about their trusted-assertions
 * provider — THE authority every surface must defer to. "brainstorm" also
 * records the local activated flag; "other" (a declaration naming a different
 * assistant — definitive, requires taPubkey) also CLEARS it, so a badge or
 * Settings row can never keep claiming Brainstorm over a foreign declaration.
 * "none" is absence: no downgrade (relays are eventually-consistent; a miss is
 * not a deactivation).
 *
 * Derived from the 10040 in the store, so our own publish shows at once and a
 * lagging relay can't take it back (the store keeps the newest). The flag only
 * moves once the relays have answered: a held copy may be stale.
 */
export function useTrustProviderStatus(
  pubkey: string | null | undefined,
  taPubkey: string | null | undefined,
): { data: TrustProviderStatus | undefined } {
  const enabled = !!pubkey && !!taPubkey;
  const list = useTrustProviderList(enabled ? pubkey : null);
  const data = !enabled
    ? undefined
    : list.event || list.settled
      ? trustProviderStatusOf(list.event, taPubkey, nip85Relay())
      : undefined;

  // Only the exact declaration is recorded as fact.
  const exact = !!list.event && !!taPubkey && declaresTrustProvider(list.event, taPubkey, nip85Relay());
  useEffect(() => {
    if (!pubkey || !list.settled) return;
    if (exact) markNip85Activated(pubkey);
    else if (data === "other") clearNip85Activated(pubkey);
  }, [pubkey, data, exact, list.settled]);

  return { data };
}
