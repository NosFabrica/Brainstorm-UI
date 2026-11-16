import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useNip05 } from "@/hooks/useNip05";
import { parseNip05 } from "@/lib/nip05";

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
