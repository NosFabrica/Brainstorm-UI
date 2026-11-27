/** The typeahead's asks: people and products, a stream turned into one answer. */
import type { SearchResult } from "@/lib/profileSearch";
import { typeaheadWords } from "@/lib/searchSyntax";
import { isListed, parseListing } from "@/lib/listing";
import { familyOf } from "@/lib/listingVariants";
import type { SearchHandle, SearchHit, SearchParams } from "./types";
import { searchStream } from "./stream";

/**
 * Cheap kind-0 typeahead: resolves at EOSE or the deadline with whatever
 * arrived — never rejects (a silent suggest beats a broken one).
 */
export function suggestProfiles(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<SearchResult[]> {
  return suggestProfileHits(query, params, opts).then((hits) =>
    hits.map((hit) => hit.author).filter((author): author is SearchResult => !!author),
  );
}

/**
 * The same suggestions, as the hits they arrived as.
 *
 * The typeahead shows people; the People section then shows the same people,
 * asked the same way. Keeping the events means a submit can seed that section
 * with what is already on screen instead of asking for it again.
 */
export function suggestProfileHits(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<SearchHit[]> {
  return collectHits(query, { ...params, tab: "people" }, opts, (hit) => (hit.author ? hit.event.pubkey : null));
}

/**
 * Product titles in the typeahead — "Satoshi Smiley T-shirt", straight to
 * the listing. Only listings for sale now, only titles with a word that
 * starts with each typed word, one row per product (a seller's same-title copies count
 * once). A query with no plain words asks nothing.
 */
export function suggestListings(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<SearchHit[]> {
  const words = (typeaheadWords(query) ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return Promise.resolve([]);
  return collectHits(query, { ...params, tab: "shop" }, { limit: 3, ...opts }, (hit) => {
    const l = parseListing(hit.event);
    if (!l || !isListed(l)) return null;
    const title = l.title.toLowerCase();
    // A typed word names a title word from its start: "hon" is "Honey", not "Phone".
    const titleWords = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!words.every((w) => titleWords.some((t) => t.startsWith(w)))) return null;
    // One product is one: its sizes share the family their seller declared.
    return familyOf(l) ?? `${hit.event.pubkey}|${title.replace(/\s+/g, " ").trim()}`;
  });
}

/**
 * A stream turned into one answer: the first hit per key, in arrival order,
 * resolved at EOSE or the deadline with whatever arrived — never rejects (a
 * silent suggest beats a broken one). `keyOf` says which hits count and
 * which are the same one.
 */
function collectHits(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey" | "tab">,
  opts: { limit?: number; timeoutMs?: number; signal?: AbortSignal } | undefined,
  keyOf: (hit: SearchHit) => string | null,
): Promise<SearchHit[]> {
  const limit = opts?.limit ?? 10;
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const signal = opts?.signal;
  if (signal?.aborted) return Promise.resolve([]);
  return new Promise((resolve) => {
    const seen = new Map<string, SearchHit>();
    // Declared before the stream opens. A stream that answers synchronously — an unconfigured
    // relay emits its error on the spot — calls `finish` while these are still being
    // assigned, and a `const` would be in its dead zone (a ReferenceError, not a result).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: SearchHandle | undefined;
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      cancel?.();
      resolve([...seen.values()].slice(0, limit));
    }
    cancel = searchStream(
      query,
      { tab: params.tab, pov: params.pov, userPubkey: params.userPubkey, limit },
      (snapshot) => {
        for (const hit of snapshot.hits) {
          const key = keyOf(hit);
          if (key !== null && !seen.has(key)) seen.set(key, hit);
        }
        if (snapshot.eose || snapshot.error) finish();
      },
    );
    if (done) {
      cancel();
      return;
    }
    timer = setTimeout(finish, timeoutMs);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
