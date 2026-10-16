import { useEffect, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { handleOwner } from "@/lib/nip05";
import { accountsHandlesPointTo } from "@/lib/handlePointers";
import type { SearchResult } from "@/lib/profileSearch";
import { fetchPillProfiles } from "@/services/searchFaces";

type HitLike = { event: NostrEvent; author: SearchResult | null; rank: number | null };

/** An account the search's handles point at, as a kind-0 hit the People list scores and filters like any other. */
export type PointedHit = { event: NostrEvent; author: SearchResult; rank: null };

const NONE: { hits: PointedHit[]; namesOf: Map<string, string[]> } = { hits: [], namesOf: new Map() };

/**
 * Who a people search is about when the person's own profile doesn't carry
 * the words (lib/handlePointers): the accounts that the matched profiles'
 * handles belong to, as the handles' own servers answer (lib/nip05
 * handleOwner) — fed the hits before any floor, since the profiles pointing
 * are often copies below it. One lookup per distinct handle, shared with the
 * check marks; the accounts' faces from the shared face cache.
 */
export function useHandlePointers(hits: readonly HitLike[]): { hits: PointedHit[]; namesOf: Map<string, string[]> } {
  const matched = hits
    .filter((h) => h.event.kind === 0 && h.author)
    .map((h) => ({
      pubkey: h.event.pubkey,
      name: h.author!.name,
      display_name: h.author!.displayName,
      nip05: h.author!.nip05,
    }));
  // The matched profiles as one key: their handles and names decide the answer.
  const key = matched
    .filter((p) => p.nip05)
    .map((p) => `${p.nip05}|${p.pubkey}|${p.display_name ?? p.name ?? ""}`)
    .sort()
    .join("\n");
  const [state, setState] = useState<{ key: string; value: typeof NONE } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void (async () => {
      const owners = new Map<string, string | null>();
      await Promise.all(
        matched
          .filter((p) => p.nip05)
          .map(async (p) => owners.set(`${p.nip05}|${p.pubkey}`, await handleOwner(p.nip05, p.pubkey))),
      );
      const pointed = accountsHandlesPointTo(matched, (nip05, pk) => owners.get(`${nip05}|${pk}`) ?? null);
      let value = NONE;
      if (pointed.length > 0) {
        const profiles = await fetchPillProfiles(pointed.map((p) => p.pubkey));
        const found = pointed.filter((p) => profiles.has(p.pubkey));
        value = {
          hits: found.map((p) => toPointedHit(profiles.get(p.pubkey)!)),
          namesOf: new Map(found.map((p) => [p.pubkey, p.names])),
        };
      }
      if (alive) setState({ key, value });
    })();
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return key && state?.key === key ? state.value : NONE;
}

function toPointedHit(author: SearchResult): PointedHit {
  return {
    event: {
      id: `handle-owner:${author.pubkey}`,
      kind: 0,
      pubkey: author.pubkey,
      created_at: 0,
      tags: [],
      content: "",
      sig: "",
    },
    author,
    rank: null,
  };
}

/** The pointed-at accounts first, then the list without them (a person already found keeps the relay's row). */
export function mergePointedHits<H extends HitLike>(base: readonly H[], pointed: readonly PointedHit[]): H[] {
  if (pointed.length === 0) return [...base];
  const present = new Set(base.filter((h) => h.event.kind === 0).map((h) => h.event.pubkey));
  return [...(pointed.filter((p) => !present.has(p.author.pubkey)) as unknown as H[]), ...base];
}
