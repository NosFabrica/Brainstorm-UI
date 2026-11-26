/** Query helpers every ask shares: narrowing to members, the lens a read goes out through, and kind 0 as a card. */
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { namesLens, type searchFilters } from "@/lib/searchSyntax";
import { resolveHouseObserver } from "@/services/trustSource";
import type { SearchResult } from "@/lib/profileSearch";
import type { Members, SearchParams } from "./types";

type Filter = ReturnType<typeof searchFilters>[number];

/** `<kind>:<pubkey>:<d>` read apart — the `d` may hold colons of its own. */
function readAddress(address: string): { kind: number; pubkey: string; d: string } | null {
  const [kind, pubkey, ...d] = address.split(":");
  const k = Number(kind);
  return Number.isInteger(k) && pubkey && d.length ? { kind: k, pubkey, d: d.join(":") } : null;
}

/**
 * `filters` asked of `members` alone: each filter once for the people (their profiles), once for
 * the events by id and once for the addressable events — by author and `d`, which also lets in
 * one author's `d` under another's; `isMember` keeps those out. A part none of a filter's kinds
 * fit asks nothing.
 */
export function narrowToMembers(filters: readonly Filter[], members: Members): Filter[] {
  const addresses = members.addresses.map(readAddress).filter((a): a is NonNullable<typeof a> => !!a);
  const unique = <T>(xs: T[]) => [...new Set(xs)];
  const parts: Record<string, string[] | number[]>[] = [];
  if (members.pubkeys.length) parts.push({ kinds: [0], authors: members.pubkeys });
  if (members.ids.length) parts.push({ ids: members.ids });
  if (addresses.length)
    parts.push({
      kinds: unique(addresses.map((a) => a.kind)),
      authors: unique(addresses.map((a) => a.pubkey)),
      "#d": unique(addresses.map((a) => a.d)),
    });
  return filters.flatMap((f) =>
    parts.flatMap((part) => {
      const out: Record<string, unknown> = { ...f };
      for (const [field, wanted] of Object.entries(part)) {
        const had = (f as Record<string, unknown>)[field] as (string | number)[] | undefined;
        const both = had ? had.filter((v) => (wanted as (string | number)[]).includes(v)) : wanted;
        if (!both.length) return [];
        out[field] = both;
      }
      return [out as Filter];
    }),
  );
}

/** Whether an event is one of `members`: a profile by its person, anything else by id or coordinate. */
export function isMember(event: NostrEvent, members: Members): boolean {
  if (event.kind === 0) return members.pubkeys.includes(event.pubkey);
  if (members.ids.includes(event.id)) return true;
  const d = event.tags.find((t) => t[0] === "d")?.[1];
  return d !== undefined && members.addresses.includes(`${event.kind}:${event.pubkey}:${d}`);
}

/** Kind-0 event → the SearchResult currency the whole app renders. */
export function kind0ToSearchResult(event: NostrEvent): SearchResult {
  let meta: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.content);
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
  } catch {
    /* unparseable profile content renders as pubkey-only */
  }
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : undefined);
  let npub = "";
  try {
    npub = nip19.npubEncode(event.pubkey);
  } catch {
    /* malformed pubkey — leave npub empty, card falls back to hex */
  }
  return {
    pubkey: event.pubkey,
    npub,
    name: str("name"),
    displayName: str("display_name") ?? str("displayName"),
    picture: str("picture"),
    about: str("about"),
    nip05: str("nip05"),
    website: str("website"),
    lud16: str("lud16"),
    banner: str("banner"),
    bot: meta.bot === true ? true : undefined,
    createdAt: event.created_at,
    wotRank: null,
    wotFollowers: null,
  };
}

/**
 * What a ranked search answers when it has no Perspective to rank through: the house observer
 * could not be found (trustSource) and the query names no lens of its own. Searching unranked
 * instead (`include:spam`) answers a person search with every impostor copying their name.
 */
export const NO_PERSPECTIVE =
  "Brainstorm's trust perspective couldn't be loaded, so this search wasn't sent. Check your connection and search again in a moment.";

/** Whether a read resolved to `observer` would go out unranked though nobody asked it to. */
export function lacksPerspective(query: string, observer: string | null): boolean {
  return !observer && !namesLens(query);
}

export async function resolveObserver(params: SearchParams): Promise<string | null> {
  if (params.pov === "mywot" && params.userPubkey) return params.userPubkey;
  return resolveHouseObserver();
}
