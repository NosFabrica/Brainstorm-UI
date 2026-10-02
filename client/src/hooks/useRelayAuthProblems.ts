/**
 * Relays whose NIP-42 login was refused, and by whom (services/relayAuth) —
 * so Messages can offer "Rejected - Ask again" for a signer's no, and the
 * relay's own reason for a relay's.
 */
import { useSyncExternalStore } from "react";
import { relayAuthProblems, relayAuthProblems$, type RelayAuthProblem } from "@/services/relayAuth";

const subscribe = (onChange: () => void) => {
  const sub = relayAuthProblems$.subscribe(onChange);
  return () => sub.unsubscribe();
};

export function useRelayAuthProblems(): ReadonlyMap<string, RelayAuthProblem> {
  return useSyncExternalStore(subscribe, relayAuthProblems, relayAuthProblems);
}
