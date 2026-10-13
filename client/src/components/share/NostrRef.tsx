/**
 * A `nostr:` reference in long-form text, rendered as what it names: a
 * person as their mention chip, a quoted event as the card its kind has
 * (EmbeddedNoteCard, by lib/embedShape), an article as the article's card,
 * a bookmark set as the list's card, a stream or a listing named by address
 * as its card — the same things a note renders them as.
 * An article that listed notes by their `nostr:nevent…` strings read as
 * raw data (Benjamin, 2026-09-24). While a lookup runs, or when nothing
 * comes back, the reference stays a link to its page here.
 */
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { MentionChip } from "@/components/share/MentionChip";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { ThingAddressRef } from "@/components/share/ThingAddressRef";
import { ListAddressRef } from "@/components/share/ListPreview";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { addressLabel, addressLink } from "@/components/share/ReadingText";
import { useQuotedNotes } from "@/hooks/useQuotedNotes";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { decodeNostrEntity, type AddressRef } from "@/lib/noteRefs";
import { ADDRESS_CARD_KINDS, ARTICLE_EMBED_KINDS } from "@/lib/embedShape";

function PageLink({ bech32, children }: { bech32: string; children: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(`/e/${bech32}`)}
      className="font-medium text-brand-link hover:underline"
    >
      {children}
    </button>
  );
}

function QuotedNoteRef({ id, bech32 }: { id: string; bech32: string }) {
  const { notes } = useQuotedNotes([id]);
  const q = notes[0];
  if (!q) return <PageLink bech32={bech32}>↳ quoted note</PageLink>;
  return (
    <EmbeddedNoteCard
      event={q.event}
      author={q.author}
      profiles={q.profiles}
      href={`/e/${nip19.neventEncode({ id: q.event.id, author: q.event.pubkey })}`}
      nested
    />
  );
}

function ArticleRef({ address, bech32, url }: { address: AddressRef; bech32: string; url?: string }) {
  // Asked in the page's batch with every other reference in the text.
  const { articles } = useArticlesByRefs([address], { batched: true });
  const ev = articles[0];
  // Not (yet) found: the author's own link around it when they wrote one (a draft's or a
  // publication's reader elsewhere), else its page here.
  if (!ev) return addressLink(bech32, bech32, url) ?? <PageLink bech32={bech32}>{addressLabel(bech32)}</PageLink>;
  return <EmbeddedArticleCard event={ev} />;
}

export function NostrRef({
  bech32,
  url,
}: {
  bech32: string;
  /** The web link the reference was found inside, if any. */ url?: string;
}) {
  const { pubkey, id, address } = decodeNostrEntity(bech32);
  if (pubkey) return <MentionChip uri={`nostr:${bech32}`} />;
  if (id) return <QuotedNoteRef id={id} bech32={bech32} />;
  if (address) {
    // Long-form — articles, drafts, publications and their sections, wiki pages, specs — as the article's card.
    if (ARTICLE_EMBED_KINDS.has(address.kind)) return <ArticleRef address={address} bech32={bech32} url={url} />;
    // Anything with a card of its own (a stream, a listing, a community…) as that card.
    if (ADDRESS_CARD_KINDS.has(address.kind)) return <ThingAddressRef address={address} bech32={bech32} url={url} />;
    if (ITEM_LIST_KINDS.has(address.kind))
      return (
        <ListAddressRef
          address={address}
          bech32={bech32}
          fallback={addressLink(bech32, bech32, url) ?? <PageLink bech32={bech32}>{addressLabel(bech32)}</PageLink>}
        />
      );
    // Any other address opens where every client can show it.
    return addressLink(bech32, bech32, url) ?? <PageLink bech32={bech32}>{addressLabel(bech32)}</PageLink>;
  }
  return <span className="font-medium text-brand-link">{bech32.slice(0, 12)}…</span>;
}
