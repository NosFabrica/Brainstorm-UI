import { useEffect, useState } from "react";
import { peekNip05, verifyNip05, type Nip05Status } from "@/lib/nip05";

/**
 * Whether a profile's claimed `nip05` checks out against its domain
 * (lib/nip05). Starts "unknown" unless the answer is already cached — callers
 * draw a check ONLY on "verified", and may drop the handle on "invalid" (the
 * domain names someone else).
 */
export function useNip05(nip05: string | undefined | null, pubkey: string | undefined | null): Nip05Status {
  const key = nip05 && pubkey ? `${nip05}|${pubkey}` : "";
  const [state, setState] = useState<{ key: string; status: Nip05Status } | null>(null);
  useEffect(() => {
    if (!key || peekNip05(nip05, pubkey) !== undefined) return;
    let alive = true;
    void verifyNip05(nip05, pubkey).then((status) => {
      if (alive) setState({ key, status });
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!key) return "unknown";
  if (state?.key === key) return state.status;
  return peekNip05(nip05, pubkey) ?? "unknown";
}
