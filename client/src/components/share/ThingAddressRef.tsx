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
import { addressLabel } from "@/components/share/ReadingText";
import { useFaceProfiles } from "@/components/search/cards";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { describeThing } from "@/lib/thing";
import type { AddressRef } from "@/lib/noteRefs";

/** The address kinds drawn as a card in place of their link. */
export const EMBEDDED_THING_KINDS: ReadonlySet<number> = new Set([38000]);

export function ThingAddressRef({ address, bech32 }: { address: AddressRef; bech32: string }) {
  const [, navigate] = useLocation();
  // The resolver is the articles' one — one ask per coordinate, kept — whatever the kind.
  const { articles } = useArticlesByRefs([address]);
  const ev = articles[0];
  const type = ev ? describeThing(ev)?.detail.type : undefined;
  const profiles = useFaceProfiles(ev ? [ev.pubkey] : []);
  if (!ev || (type !== "market" && type !== "ballot"))
    return (
      <button
        type="button"
        onClick={() => navigate(`/e/${bech32}`)}
        className="font-medium text-brand-link hover:underline"
      >
        {addressLabel(bech32)}
      </button>
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
