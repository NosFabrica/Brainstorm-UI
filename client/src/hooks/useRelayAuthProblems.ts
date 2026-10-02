/**
 * What services/relayAuth knows, for the screens that show it: which relays'
 * logins didn't happen and why — so Messages can offer "Rejected - Ask again"
 * for a signer's no, and the relay's own reason for a relay's — and which
 * relays are the reader's own, signed in to without asking.
 */
import { useSyncExternalStore } from "react";
import type { Observable } from "rxjs";
import {
  ownRelays$,
  ownRelaysNow,
  relayAuthProblems,
  relayAuthProblems$,
  type RelayAuthProblem,
} from "@/services/relayAuth";

const subscribeTo = (source: Observable<unknown>) => (onChange: () => void) => {
  const sub = source.subscribe(onChange);
  return () => sub.unsubscribe();
};
const subscribeProblems = subscribeTo(relayAuthProblems$);
const subscribeOwn = subscribeTo(ownRelays$);

export function useRelayAuthProblems(): ReadonlyMap<string, RelayAuthProblem> {
  return useSyncExternalStore(subscribeProblems, relayAuthProblems, relayAuthProblems);
}

/** The active account's own relays, normalized — re-rendering when their lists change. */
export function useOwnRelays(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeOwn, ownRelaysNow, ownRelaysNow);
}
