import { useEffect, useState } from "react";
import type { CompromisedStatus } from "@/lib/compromised";
import { hasSettledCompromised, lookupCompromised, settledCompromised } from "@/services/compromised";

/**
 * Whether this account is Compromised: its status, or null while unanswered
 * and when it isn't marked. Accounts we already know answer on first render;
 * the rest go out in the shared batch (services/compromised).
 */
export function useCompromised(pubkey: string | null | undefined): CompromisedStatus | null {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!pubkey || hasSettledCompromised(pubkey)) return;
    let alive = true;
    void lookupCompromised(pubkey).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [pubkey]);
  return pubkey ? (settledCompromised(pubkey) ?? null) : null;
}
