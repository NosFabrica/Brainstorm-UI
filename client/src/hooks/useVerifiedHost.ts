import { useEffect, useState } from "react";
import { useLiveProfile, useLiveProfiles } from "@/hooks/useLiveProfile";
import { useNip05 } from "@/hooks/useNip05";
import { parseNip05, peekNip05, verifyNip05 } from "@/lib/nip05";

/**
 * Which site an Assistant belongs to, proven rather than claimed: the host of
 * its NIP-05, once that NIP-05 verifies for its key; null until then, and
 * whenever it doesn't. A Brainstorm Assistant's NIP-05 names its deployment
 * (`…@brainstorm-staging.nosfabrica.com`); its profile `website` is only a claim,
 * so it is never read here.
 */
export function useVerifiedHost(pubkey: string | null | undefined): string | null {
  const nip05 = useLiveProfile(pubkey ?? undefined).profile?.nip05;
  const handle = typeof nip05 === "string" ? nip05.trim() : "";
  const status = useNip05(handle || null, pubkey ?? null);
  if (!pubkey || !handle || status !== "verified") return null;
  // The domain that was verified: parsed as the check itself parses it.
  return parseNip05(handle)?.domain ?? null;
}

const handleOf = (nip05: unknown) => (typeof nip05 === "string" ? nip05.trim() : "");

/**
 * `useVerifiedHost` for a list: the site each of these keys belongs to, proven
 * the same way, as a lookup. For as many Assistants as a Treasure Map names —
 * a hook call a key can't follow a list that grows.
 */
export function useVerifiedHosts(pubkeys: string[]): (pubkey: string) => string | null {
  const profiles = useLiveProfiles(pubkeys);
  const claims = pubkeys
    .map((pubkey) => ({ pubkey, handle: handleOf(profiles.get(pubkey)?.nip05) }))
    .filter((claim) => claim.handle);
  const key = claims.map((claim) => `${claim.handle}|${claim.pubkey}`).join(",");
  // The answers live in lib/nip05's cache; this only redraws when one arrives.
  const [, redraw] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const { pubkey, handle } of claims) {
      if (peekNip05(handle, pubkey) !== undefined) continue;
      void verifyNip05(handle, pubkey).then(() => {
        if (alive) redraw((n) => n + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (pubkey) => {
    const handle = handleOf(profiles.get(pubkey)?.nip05);
    if (!handle || peekNip05(handle, pubkey) !== "verified") return null;
    return parseNip05(handle)?.domain ?? null;
  };
}
