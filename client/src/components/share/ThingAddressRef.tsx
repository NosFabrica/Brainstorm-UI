/**
 * An `naddr` to a kind-38000 prediction market or ballot, drawn as the thing
 * itself inside the note or article that names it — the question, where it
 * stands and what can be picked, or the ballot's answers — the way a quoted
 * note is drawn. While the lookup runs, or when the address names something
 * else (a mint review, junk on the shared kind), it stays a link.
 */
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { addressLabel, addressLink } from "@/components/share/ReadingText";
import { useFaceProfiles } from "@/components/search/cards";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { describeThing } from "@/lib/thing";
import { eventStore } from "@/lib/eventStore";
import type { AddressRef, MinimalEvent } from "@/lib/noteRefs";

/** The address kinds drawn as a card in place of their link. */
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
  const { articles } = useArticlesByRefs([address]);
  const ev =
    articles[0] ??
    (eventStore.getReplaceable(address.kind, address.pubkey, address.identifier) as MinimalEvent | undefined);
  const type = ev ? describeThing(ev)?.detail.type : undefined;
  const profiles = useFaceProfiles(ev ? [ev.pubkey] : []);
  if (!ev || (type !== "market" && type !== "ballot"))
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
