import { useQuery } from "@tanstack/react-query";

import { decodeShareId } from "@/lib/shareId";
import { MAX_SHARE_RELAYS, shortLinkUrl } from "@/lib/shortLink";
import { apiClient } from "@/services/api";

interface UseShareUrlOptions {
  /** The profile being shared. */
  npub: string;
  /** Relay hints to carry in the link, if the caller has any. */
  relays?: string[];
  /** Usually "the share sheet is open" — don't mint a link nobody asked for. */
  enabled?: boolean;
}

/**
 * The URL to hand someone for a profile: short when the shortener obliges,
 * the canonical `/p/:npub` otherwise.
 *
 * Every share entry point uses this, so they can't drift into offering
 * different links for the same profile.
 *
 * Minting is best-effort and never blocks: the canonical URL is returned
 * immediately and the short one swaps in when it arrives. Failure is left as a
 * failure rather than resolved to the fallback — resolving would let
 * `staleTime: Infinity` cache a blip (a 429 from the server's 1 req/s limit,
 * say) and pin the long URL for the rest of the session.
 */
export function useShareUrl({ npub, relays = [], enabled = true }: UseShareUrlOptions): string {
  const canonicalUrl =
    typeof window !== "undefined" && npub ? `${window.location.origin}/p/${npub}` : "";

  // The API takes hex; callers hold an npub because that's what they display.
  const pubkey = npub ? decodeShareId(npub)?.pubkey ?? "" : "";
  const hints = relays.slice(0, MAX_SHARE_RELAYS);

  const { data } = useQuery({
    queryKey: ["share-url", pubkey, hints],
    queryFn: async () =>
      shortLinkUrl(window.location.origin, await apiClient.createShortUrl(pubkey, hints)),
    enabled: enabled && !!pubkey && !!canonicalUrl,
    staleTime: Infinity,
    retry: 1,
  });

  return data || canonicalUrl;
}
