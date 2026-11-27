import { CompromisedWatermark, WATERMARK_HOST } from "@/components/compromised/CompromisedWatermark";
import { useCompromisedRing } from "@/hooks/useCompromised";
import { memo, useMemo, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { revealKeyOf } from "@/lib/nip36";
import { SensitiveRevealBoundary } from "@/components/share/SensitiveMedia";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useTierRing, useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useNip05 } from "@/hooks/useNip05";
import { npubFromPubkey } from "@/lib/shareId";
import { analyzeNote, type MinimalEvent } from "@/lib/noteRefs";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useArticlesByRefs, useLinkedArticles } from "@/hooks/useLinkedArticles";
import { EmbeddedListCard } from "@/components/share/ListPreview";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { useQuotedNotes } from "@/hooks/useQuotedNotes";
import { nip19 } from "nostr-tools";
import { isBlankEvent } from "@/lib/blankEvent";
import { isExpired } from "@/lib/nip40";
import { DeletedStub } from "@/components/share/DeletedStub";
import { describeThing, THING_KINDS, type Thing } from "@/lib/thing";
import { embedShapeOf, type EmbedShape } from "@/lib/embedShape";
import { EmbeddedKindCard, KIND_CARD_SHAPES, type KindCardShape } from "@/components/share/EmbeddedKindCard";
import { EmbeddedAudio, EmbeddedPictures, EmbeddedVideo } from "@/components/share/EmbeddedMedia";
import { contentShape } from "@/lib/contentShape";
import { WEB_BOOKMARK_KIND, webBookmarkOf } from "@/lib/webBookmark";
import { EmbeddedActivity } from "@/components/share/EmbeddedActivity";
import { parseHighlight } from "@/lib/nip84";
import { ChatContextLine } from "@/components/share/ChatContext";
import { CHAT_KINDS } from "@/lib/chatMessage";
import { EmbeddedHighlight } from "@/components/share/embed/EmbeddedHighlight";
import { EmbeddedInlineThing, isInlineThing } from "@/components/share/embed/EmbeddedInlineThing";
import { EmbeddedNoteHeader } from "@/components/share/embed/EmbeddedNoteHeader";
import { EmbeddedSealed, EmbeddedStructural } from "@/components/share/embed/EmbeddedPlaceholders";
import { EmbeddedWords } from "@/components/share/embed/EmbeddedWords";
import { repostedEvent } from "@/components/share/embed/repostedEvent";
import { nameIn } from "@/lib/displayName";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/** What a nested card asks the relays about: nothing. */
const EMPTY_NOTE: MinimalEvent = { id: "", kind: 1, pubkey: "", created_at: 0, content: "", tags: [] };

export type EmbeddedNoteCardProps = {
  event: MinimalEvent;
  author?: ProfileLite;
  profiles?: Map<string, ProfileLite>;
  /** When set, clicking the card (off the inner author link) opens this path. */
  href?: string;
  /** Author's Web-of-Trust score (0–1) — renders a tier pill in the header. */
  trustScore01?: number | null;
  /** Show a "Replying to @…" line when this note is a reply (e.g. in the
   *  "More from" strip, where a bare reply reads as a cryptic standalone post).
   *  Off by default so quoted-note embeds stay uncluttered. */
  showReplyContext?: boolean;
  /** A card shown inside another card: its own quotes and articles stay links — one level, never a stack. */
  nested?: boolean;
};

/**
 * Compact embedded note — the quoted or reposted note shown inside a share-page
 * note card, with its author's avatar + name (Primal-style). Links to the
 * author's share page. Truncates long content.
 *
 * A quoted event is drawn as what it is (lib/embedShape), with the card its
 * kind has elsewhere: a list (bookmarks, a bookmark set — lib/listItems) as
 * the list, an article as its teaser, a thing, a people list, a stream, a
 * dated event, a listing, an app, a repo or a track as its card
 * (EmbeddedKindCard). A video, a picture post or a voice message keeps this
 * card's author line and shows its media. What someone did — a reaction, a
 * zap, a deletion, a report, a vote, a trust score… — is said from its tags as
 * its result row says it, with what it is about one level down
 * (EmbeddedActivity); a highlight is its passage, its source and its authors;
 * a poll its question and options. Anything else is its words, with its kind
 * named when it is not a note.
 *
 * Memoised: it is drawn many to a feed or a results list, and the list re-renders
 * as hits and profiles stream in; a card whose props didn't change is skipped.
 */
export const EmbeddedNoteCard = memo(function EmbeddedNoteCard(props: EmbeddedNoteCardProps) {
  // A quote is its own post: the quoting post's "show" (SensitiveRevealScope) does not show it.
  return (
    <SensitiveRevealBoundary>
      <EmbeddedNoteCardInner {...props} />
    </SensitiveRevealBoundary>
  );
});

function EmbeddedNoteCardInner(props: EmbeddedNoteCardProps) {
  // Past its NIP-40 expiration, whatever it is: its author meant it gone by now.
  if (isExpired(props.event, Math.floor(Date.now() / 1000)))
    return <DeletedStub expired className="mt-2" testId="embedded-expired" />;
  return <EmbeddedNoteCardShaped {...props} />;
}

function EmbeddedNoteCardShaped(props: EmbeddedNoteCardProps) {
  // A thing is read once here, for the shape, the inline check, the body and the card alike.
  const { shape, thing } = useMemo(() => {
    const read = THING_KINDS.has(props.event.kind) ? describeThing(props.event) : null;
    return { shape: embedShapeOf(props.event, read), thing: read };
  }, [props.event]);
  if (shape === "item-list")
    return <EmbeddedListCard event={props.event} author={props.author} href={props.href} nested={props.nested} />;
  if (shape === "article") return <EmbeddedArticleCard event={props.event} author={props.author} />;
  // A market or ballot keeps its compact drawing in this card (MarketSummary, BallotAnswers).
  if (KIND_CARD_SHAPES.has(shape) && !isInlineThing(props.event, thing))
    return (
      <EmbeddedKindCard
        // A newer version of the same stream or listing keeps the reader's "show".
        key={revealKeyOf(props.event)}
        event={props.event}
        author={props.author}
        shape={shape as KindCardShape}
        thing={thing}
        href={props.href}
        trustScore01={props.trustScore01}
      />
    );
  return <NoteCardBody {...props} shape={shape} thing={thing} />;
}

function NoteCardBody({
  event,
  author,
  profiles,
  href,
  trustScore01,
  showReplyContext = false,
  nested = false,
  shape,
  thing,
}: EmbeddedNoteCardProps & { shape: EmbedShape; thing: Thing | null }) {
  const tierRing = useTierRing();
  // Deleted by overwriting: a quiet stub in the quote's place, nothing to click.
  const blank = isBlankEvent(event);
  const coinReplaced = useCoinReplacedByRing();
  // Callers that fetched a POV-aware score pass it; everyone else (thread
  // ancestors, more-from-author, quoted embeds) gets the shared house cache,
  // so no embedded note's author sits bare while its neighbours wear rings.
  const fallbackScoreOf = useAuthorScores(trustScore01 == null ? [event.pubkey] : []);
  const effectiveScore01 = trustScore01 ?? fallbackScoreOf(event.pubkey);
  const compromisedRing = useCompromisedRing(event.pubkey, "sm");
  const ring = compromisedRing ?? tierRing(effectiveScore01);
  const [, navigate] = useLocation();
  const nip05Verified = useNip05(author?.nip05, event.pubkey) === "verified";
  // An article the note links is shown as its own card — the note's full
  // page does the same — and not as a bare "📄 article" link.
  // A quoted prediction market or ballot (kind 38000) is drawn as what it is:
  // a market's content is BAO's social post, a ballot's is raw JSON.
  const shaped = thing?.detail.type === "market" || thing?.detail.type === "ballot" ? thing : null;
  // A video, a picture post or a voice message shows its media, not its words.
  const media = shape === "video" || shape === "picture" || shape === "audio" ? shape : null;
  // A web bookmark (NIP-B0) is its link, then its saver's words: never a list of nothing.
  const bookmark = useMemo(() => (event.kind === WEB_BOOKMARK_KIND ? webBookmarkOf(event) : null), [event]);
  // What someone did (a reaction, a zap, a score…) is said from its tags, as its row says it;
  // a highlight is its passage marked and where it is from.
  const activity = shape === "activity";
  const highlight = useMemo(() => (shape === "highlight" ? parseHighlight(event) : null), [shape, event]);
  // Ciphertext (a private follow set, a sealed list) is not for reading: the card says so.
  // JSON (a profile, app data) or nothing at all (a contact list) is not for reading either:
  // one line says what it is — unless it is a zap, said in words above. A repost is the note it
  // reposts — one level down, never deeper.
  const { sealed, structural, reposted } = useMemo(() => {
    const kind = contentShape(event.content).kind;
    const inner = nested ? null : repostedEvent(event);
    return {
      sealed: kind === "encrypted",
      structural: !inner && !bookmark && !activity && !highlight && (kind === "json" || kind === "empty"),
      reposted: inner,
    };
  }, [event, nested, bookmark, activity, highlight]);
  const repostedAuthor = useLiveProfiles(reposted ? [reposted.pubkey] : []).get(reposted?.pubkey ?? "") as
    ProfileLite | undefined;
  // None of these shows its content, so nothing it names is looked up.
  const wordless = !!shaped || !!media || structural || !!reposted || activity || !!highlight;
  const linked = useLinkedArticles(nested || wordless ? EMPTY_NOTE : event);
  // The note read once, for everything below that asks what it names.
  const refs = useMemo(() => analyzeNote(event), [event]);
  // A list it links by address: the list's name and count, one level deep.
  const linkedLists = useArticlesByRefs(
    nested || wordless ? [] : refs.addrs.filter((a) => ITEM_LIST_KINDS.has(a.kind)),
  );
  // Drawn as cards below, so not again as links in the text.
  const cardCoords = useMemo(
    () => (linkedLists.coords.size ? new Set([...linked.coords, ...linkedLists.coords]) : linked.coords),
    [linked.coords, linkedLists.coords],
  );
  // Likewise a note it quotes: the quoted note, with its author, one level deep.
  const quoted = useQuotedNotes(nested || wordless ? [] : refs.quoteIds);
  let npub = "";
  try {
    npub = npubFromPubkey(event.pubkey);
  } catch {
    /* ignore */
  }

  // Reply context (opt-in): names are plain text, not links, so the whole card
  // stays a single click target to open the thread.
  const analysis = showReplyContext ? refs : null;
  const replyTargets = analysis?.isReply ? analysis.replyToPubkeys.filter((pk) => pk !== event.pubkey) : [];

  const onClick = href
    ? (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("a, button, video, [data-noopen]")) return;
        e.stopPropagation();
        navigate(href);
      }
    : undefined;

  if (blank) return <DeletedStub who={nameIn(author)} className="mt-2" testId="embedded-deleted" />;
  return (
    <div
      className={`${WATERMARK_HOST} not-prose mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70 ${href ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-700" : ""}`}
      data-testid="embedded-note"
      onClick={onClick}
    >
      <CompromisedWatermark pubkey={event.pubkey} postedAt={event.created_at} eventId={event.id} />
      <EmbeddedNoteHeader
        event={event}
        author={author}
        npub={npub}
        ring={ring}
        nip05Verified={nip05Verified}
        score01={effectiveScore01}
        coinReplaced={coinReplaced}
        href={href}
        replyTargets={replyTargets}
        profiles={profiles}
      />
      {/* A chat message says where it was said: its channel, its stream, its group. */}
      {!nested && CHAT_KINDS.has(event.kind) && <ChatContextLine event={event} className="mb-1" />}
      {shaped ? (
        <EmbeddedInlineThing thing={shaped} />
      ) : media === "video" ? (
        <EmbeddedVideo key={revealKeyOf(event)} event={event} />
      ) : media === "picture" ? (
        <EmbeddedPictures key={revealKeyOf(event)} event={event} opensThread={!!href} />
      ) : media === "audio" ? (
        <EmbeddedAudio key={revealKeyOf(event)} event={event} artist={nameIn(author)} href={href} />
      ) : activity ? (
        <EmbeddedActivity event={event} nested={nested} />
      ) : highlight ? (
        <EmbeddedHighlight event={event} highlight={highlight} nested={nested} />
      ) : sealed ? (
        <EmbeddedSealed />
      ) : reposted ? (
        <EmbeddedNoteCard
          event={reposted}
          author={repostedAuthor}
          href={`/e/${nip19.neventEncode({ id: reposted.id, author: reposted.pubkey })}`}
          nested
        />
      ) : structural ? (
        <EmbeddedStructural event={event} />
      ) : (
        <EmbeddedWords
          event={event}
          author={author}
          profiles={profiles}
          href={href}
          bookmark={bookmark}
          embeddedCoords={cardCoords}
          embeddedIds={quoted.ids}
        />
      )}
      {quoted.notes.map((q) => (
        <div key={q.event.id} data-testid="embedded-quote">
          <EmbeddedNoteCard
            event={q.event}
            author={q.author}
            profiles={q.profiles}
            href={`/e/${nip19.neventEncode({ id: q.event.id, author: q.event.pubkey })}`}
            nested
          />
        </div>
      ))}
      {linked.articles.map((ae) => (
        <EmbeddedArticleCard
          key={ae.id}
          event={ae}
          author={profiles?.get(ae.pubkey) ?? (ae.pubkey === event.pubkey ? author : undefined)}
        />
      ))}
      {linkedLists.articles.map((le) => (
        <EmbeddedListCard key={le.id} event={le} author={profiles?.get(le.pubkey)} nested />
      ))}
    </div>
  );
}
