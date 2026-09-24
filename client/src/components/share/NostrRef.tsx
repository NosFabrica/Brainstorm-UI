/**
 * A `nostr:` reference in long-form text, rendered as what it names: a
 * person as their mention chip, a note as the quoted note's card, an
 * article as the article's card — the same things a note renders them as.
 * An article that listed notes by their `nostr:nevent…` strings read as
 * raw data (Benjamin, 2026-09-24). While a lookup runs, or when nothing
 * comes back, the reference stays a link to its page here.
 */
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { MentionChip } from "@/components/share/MentionChip";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { addressLabel, addressLink } from "@/components/share/ReadingText";
import { useQuotedNotes } from "@/hooks/useQuotedNotes";
import { READER_KINDS, useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { decodeNostrEntity, type AddressRef } from "@/lib/noteRefs";

function PageLink({ bech32, children }: { bech32: string; children: string }) {
  const [, navigate] = useLocation();
  return (
    <button type="button" onClick={() => navigate(`/e/${bech32}`)} className="font-medium text-brand-link hover:underline">
      {children}
    </button>
  );
}

function QuotedNoteRef({ id, bech32 }: { id: string; bech32: string }) {
  const { notes } = useQuotedNotes([id]);
  const q = notes[0];
  if (!q) return <PageLink bech32={bech32}>↳ quoted note</PageLink>;
  return <EmbeddedNoteCard event={q.event} author={q.author} profiles={q.profiles} href={`/e/${nip19.neventEncode({ id: q.event.id, author: q.event.pubkey })}`} nested />;
}

function ArticleRef({ address, bech32 }: { address: AddressRef; bech32: string }) {
  const { articles } = useArticlesByRefs([address]);
  const ev = articles[0];
  if (!ev) return <PageLink bech32={bech32}>{addressLabel(bech32)}</PageLink>;
  return <EmbeddedArticleCard event={ev} />;
}

export function NostrRef({ bech32, url }: { bech32: string; /** The web link the reference was found inside, if any. */ url?: string }) {
  const { pubkey, id, address } = decodeNostrEntity(bech32);
  if (pubkey) return <MentionChip uri={`nostr:${bech32}`} />;
  if (id) return <QuotedNoteRef id={id} bech32={bech32} />;
  if (address) {
    if (READER_KINDS.has(address.kind)) return <ArticleRef address={address} bech32={bech32} />;
    // Only articles, wiki pages and specs have a reader here; any other
    // address opens where every client can show it.
    return addressLink(bech32, bech32, url) ?? <PageLink bech32={bech32}>{addressLabel(bech32)}</PageLink>;
  }
  return <span className="font-medium text-brand-link">{bech32.slice(0, 12)}…</span>;
}
