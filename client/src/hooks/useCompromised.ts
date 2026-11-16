import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CompromisedStatus } from "@/lib/compromised";
import {
  compromisedVersion,
  hasSettledCompromised,
  lookupCompromised,
  replacedCompromised,
  settledCompromised,
  subscribeCompromised,
} from "@/services/compromised";

/** Re-render when any record lands: one account's record names another's (its successor). */
function useRecords(): number {
  return useSyncExternalStore(subscribeCompromised, compromisedVersion, compromisedVersion);
}

/**
 * Whether this account is Compromised: its status, or null while unanswered
 * and when it isn't marked. Accounts we already know answer on first render;
 * the rest go out in the shared batch (services/compromised).
 */
export function useCompromised(pubkey: string | null | undefined): CompromisedStatus | null {
  useRecords();
  useEffect(() => {
    if (pubkey && !hasSettledCompromised(pubkey)) void lookupCompromised(pubkey);
  }, [pubkey]);
  return pubkey ? (settledCompromised(pubkey) ?? null) : null;
}

/** The Compromised account this one replaces, when it is an owner's new account. */
export function useReplaces(pubkey: string | null | undefined): CompromisedStatus | null {
  useRecords();
  return pubkey ? replacedCompromised(pubkey) : null;
}

/** Which of these accounts are Compromised, in the order given. */
export function useCompromisedAmong(pubkeys: string[]): CompromisedStatus[] {
  const records = useRecords();
  const key = pubkeys.join(",");
  useEffect(() => {
    for (const pk of pubkeys) if (!hasSettledCompromised(pk)) void lookupCompromised(pk);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(
    () => pubkeys.flatMap((pk) => settledCompromised(pk) ?? []),
    [key, records], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/**
 * The red ring a Compromised account's avatar wears, or null for anyone else.
 *
 * Not a trust ring: it ignores the score display setting, quiet search chrome
 * and the tier, because it isn't an opinion about the account. Call sites put
 * it ahead of the tier ring: `useCompromisedRing(pk) ?? tierRing(score) ?? ""`.
 * Literal class strings, as Tailwind needs; the inner step is the page surface.
 */
const RING = {
  md: "shadow-[0_0_0_2px_#ffffff,0_0_0_5px_#dc2626] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_5px_#ef4444]",
  sm: "shadow-[0_0_0_1px_#ffffff,0_0_0_3px_#dc2626] dark:shadow-[0_0_0_1px_#0f172a,0_0_0_3px_#ef4444]",
};

export function useCompromisedRing(pubkey: string | null | undefined, size: "md" | "sm" = "md"): string | null {
  return useCompromised(pubkey) ? RING[size] : null;
}

/** The same ring for a list's rows, where a hook per row can't be called: `ringOf(pubkey)`. */
export function useCompromisedRingOf(pubkeys: string[], size: "md" | "sm" = "md"): (pubkey: string) => string | null {
  const found = useCompromisedAmong(pubkeys);
  const marked = useMemo(() => new Set(found.map((s) => s.pubkey)), [found]);
  return (pubkey) => (pubkey && marked.has(pubkey.toLowerCase()) ? RING[size] : null);
}
