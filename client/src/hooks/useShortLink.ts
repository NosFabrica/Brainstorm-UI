import { useCallback } from "react";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";

import { addressOf, decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { dedupeRelays } from "@/lib/relayList";
import { DCOSL_RELAY, SEARCH_RELAY } from "@/lib/relays";
import { MAX_SHARE_RELAYS, hashtagKey, isReadableHashtag, shortLinkUrl } from "@/lib/shortLink";
import { publicOrigin } from "@/lib/publicOrigin";
import { apiClient, type ShortLinkEntity } from "@/services/api";

// Relays stay out of the key (the server keeps the first mint's); a failure isn't cached as the fallback.
function shortLinkQuery({ kind, key, relays = [] }: ShortLinkEntity) {
  return {
    queryKey: ["short-link", kind, key],
    queryFn: async () =>
      shortLinkUrl(
        publicOrigin(),
        (await apiClient.createShortUrl({ kind, key, relays: relays.slice(0, MAX_SHARE_RELAYS) })).shortCode,
      ),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  };
}

type ShareableLink = ShortLinkEntity & { canonicalUrl: string };

interface UseShortLinkOptions extends ShareableLink {
  /** Required so no caller mints on render: pass "the share sheet is open". */
  enabled: boolean;
}

/** The short link for an entity once minted, `canonicalUrl` until then or if it fails. */
export function useShortLink({ canonicalUrl, enabled, ...entity }: UseShortLinkOptions): string {
  const { data } = useQuery({
    ...shortLinkQuery(entity),
    enabled: enabled && !!entity.key && !!canonicalUrl,
  });
  return data || canonicalUrl;
}

/** The short URL, minted now (e.g. on a tap) through the hook's cache. Rejects on failure. */
export function mintShortLink(queryClient: QueryClient, entity: ShortLinkEntity): Promise<string> {
  return queryClient.fetchQuery(shortLinkQuery(entity));
}

/** {@link mintShortLink} bound to an entity for a tap; rejects when there is no key. */
export function useMintShortLink({ kind, key, relays }: ShortLinkEntity): () => Promise<string> {
  const queryClient = useQueryClient();
  const joinedRelays = (relays ?? []).join(" ");
  return useCallback(
    () =>
      key
        ? mintShortLink(queryClient, { kind, key, relays: joinedRelays ? joinedRelays.split(" ") : [] })
        : Promise.reject(new Error("nothing to shorten")),
    [queryClient, kind, key, joinedRelays],
  );
}

const canonical = (path: string) => (typeof window !== "undefined" ? `${publicOrigin()}${path}` : "");

// Never the search relay: it refuses outside readers.
const shareHints = (relays: string[]) => dedupeRelays(relays).filter((r) => r !== SEARCH_RELAY);

export function profileShortLink(npub: string, relays: string[] = []): ShareableLink {
  return {
    kind: "profile",
    key: npub ? (decodeShareId(npub)?.pubkey ?? "") : "",
    relays: shareHints(relays),
    canonicalUrl: npub ? canonical(`/p/${npub}`) : "",
  };
}

export function hashtagShortLink(word: string): ShareableLink {
  const key = hashtagKey(word);
  return {
    kind: "hashtag",
    key: isReadableHashtag(key) ? "" : key,
    canonicalUrl: word ? canonical(`/t/${encodeURIComponent(word)}`) : "",
  };
}

export function tagShortLink(authorPubkey: string, slug: string): ShareableLink {
  const hex = authorPubkey.toLowerCase();
  const ok = !!hex && !!slug;
  return {
    kind: "tag",
    key: ok ? `${hex}:${slug}` : "",
    canonicalUrl: ok ? canonical(`/tags/${npubFromPubkey(hex)}/${encodeURIComponent(slug)}`) : "",
  };
}

type ShareableEvent = { id: string; pubkey: string; kind: number; tags: string[][] };

// The server gives a DList address the tag hub; an id says no kind, so the app sends it.
const DLIST_ADDRESS_KINDS = new Set([39998, 39999]);
const DLIST_EVENT_KINDS = new Set([9998, 9999]);

/** Keyed by coordinate when addressable, by id otherwise; `relays` are the page's hints. */
export function eventShortLink(event: ShareableEvent, { relays = [] }: { relays?: string[] } = {}): ShortLinkEntity {
  const address = addressOf(event);
  if (address)
    return {
      kind: "address",
      key: `${address.kind}:${address.pubkey.toLowerCase()}:${address.identifier}`,
      relays: DLIST_ADDRESS_KINDS.has(event.kind) ? [] : shareHints(relays),
    };
  const hints = DLIST_EVENT_KINDS.has(event.kind) ? [DCOSL_RELAY, ...relays] : relays;
  return { kind: "event", key: event.id.toLowerCase(), relays: shareHints(hints) };
}
