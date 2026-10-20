import { useEffect, useState } from "react";
import { verifyNip05 } from "@/lib/nip05";

/**
 * Which of the people have a NIP-05 handle their domain confirms (lib/nip05) —
 * the proofs that rest on a domain need it (lib/githubLink) — and whether
 * every check has answered yet. Cached by lib/nip05, so rows and pages that
 * ask about the same person share one lookup.
 */
export function useVerifiedPeople(people: readonly { pubkey: string; nip05?: string }[]): {
  verified: Set<string>;
  settled: boolean;
} {
  const key = people.map((p) => `${p.pubkey}|${p.nip05 ?? ""}`).join(",");
  const [state, setState] = useState<{ key: string; verified: Set<string> } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all(
      people.map(async (p) => (p.nip05 && (await verifyNip05(p.nip05, p.pubkey)) === "verified" ? p.pubkey : null)),
    ).then((ok) => alive && setState({ key, verified: new Set(ok.filter((p): p is string => !!p)) }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state?.key === key ? { verified: state.verified, settled: true } : { verified: EMPTY, settled: false };
}

const EMPTY = new Set<string>();
