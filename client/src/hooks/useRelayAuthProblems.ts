/**
 * Relays whose NIP-42 login didn't happen, and why (services/relayAuth) — so
 * Messages can offer "Rejected - Ask again" for a signer's no, and "Try again"
 * with the reason for anything else.
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
