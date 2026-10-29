import { useEffect, useState } from "react";
import { handleOwner, peekHandleOwner, peekNip05, verifyNip05, type Nip05Status } from "@/lib/nip05";

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

/**
 * Who a profile's claimed handle belongs to when it isn't this profile — the
 * key its own server names instead (lib/nip05 handleOwner). Null for the
 * owner, while waiting, and on every common failure.
 */
export function useHandleOwner(nip05: string | undefined | null, pubkey: string | undefined | null): string | null {
  const key = nip05 && pubkey ? `${nip05}|${pubkey}` : "";
  const [state, setState] = useState<{ key: string; owner: string | null } | null>(null);
  useEffect(() => {
    if (!key || peekHandleOwner(nip05, pubkey) !== undefined) return;
    let alive = true;
    void handleOwner(nip05, pubkey).then((owner) => {
      if (alive) setState({ key, owner });
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!key) return null;
  if (state?.key === key) return state.owner;
  return peekHandleOwner(nip05, pubkey) ?? null;
}
