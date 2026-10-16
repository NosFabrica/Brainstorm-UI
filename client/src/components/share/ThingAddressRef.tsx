/**
 * An `naddr` to something with a card of its own — a prediction market or a
 * ballot, a community, a listing, a stream, a dated event, a people list, a
 * track, a video (lib/embedShape's ADDRESS_CARD_KINDS) — drawn as that card
 * inside the note or article that names it, the way a quoted note is drawn.
 * While the lookup runs, or when the address holds something the card cannot
 * read (junk on a shared kind), it stays a link.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { addressLabel, addressLink } from "@/components/share/ReadingText";
import { useFaceProfiles } from "@/components/search/cards";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { embedShapeOf } from "@/lib/embedShape";
import { eventStore } from "@/lib/eventStore";
import type { AddressRef, MinimalEvent } from "@/lib/noteRefs";

/**
 * The address kinds a note's own words draw as a card in place of their link
 * (NoteContent's `embedThings`). The feed card draws every other address it
 * resolves below the note (EmbeddedArticleCard, which reads the kind), so
 * only kind 38000 — a market, a ballot, a mint review — is drawn where it is named.
 */
export const EMBEDDED_THING_KINDS: ReadonlySet<number> = new Set([38000]);

export function ThingAddressRef({
  address,
  bech32,
  url,
}: {
  address: AddressRef;
  bech32: string;
  /** The author's own link around the reference, kept when it is not drawn as a card. */
  url?: string;
}) {
  const [, navigate] = useLocation();
  // The resolver is the articles' one — one ask per coordinate, kept — whatever the kind.
  // A copy the store already holds (a feed fetched it) draws at once; the ask only replaces it.
  // Asked in the page's batch: an article naming dozens of these makes one ask, not one each.
  const { articles } = useArticlesByRefs([address], { batched: true });
  const ev =
    articles[0] ??
    (eventStore.getReplaceable(address.kind, address.pubkey, address.identifier) as MinimalEvent | undefined);
  // Read once per event, not on every render while the profiles land.
  const shape = useMemo(() => (ev ? embedShapeOf(ev) : null), [ev]);
  const profiles = useFaceProfiles(ev ? [ev.pubkey] : []);
  if (!ev || shape === "note")
    return (
      addressLink(bech32, bech32, url) ?? (
        <button
          type="button"
          onClick={() => navigate(`/e/${bech32}`)}
          className="font-medium text-brand-link hover:underline"
        >
          {addressLabel(bech32)}
        </button>
      )
    );
  return (
    <EmbeddedNoteCard
      event={ev}
      author={profiles.get(ev.pubkey)}
      href={`/e/${nip19.naddrEncode({ kind: address.kind, pubkey: address.pubkey, identifier: address.identifier })}`}
      nested
    />
  );
}
