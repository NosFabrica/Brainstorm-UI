import { useMemo, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { BadgeCheck, MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { NoteContent } from "@/components/share/NoteContent";
import { VerificationCoin, useTierRing, useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useNip05 } from "@/hooks/useNip05";
import { npubFromPubkey } from "@/lib/shareId";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { analyzeNote, type MinimalEvent } from "@/lib/noteRefs";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useArticlesByRefs, useLinkedArticles } from "@/hooks/useLinkedArticles";
import { EmbeddedListCard } from "@/components/share/ListPreview";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { useQuotedNotes } from "@/hooks/useQuotedNotes";
import { nip19 } from "nostr-tools";
import { isBlankEvent } from "@/lib/blankEvent";
import { DeletedStub } from "@/components/share/DeletedStub";
import { BallotAnswers, MarketSummary } from "@/components/search/thingCards";
import { describeThing, THING_KINDS } from "@/lib/thing";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/** What a nested card asks the relays about: nothing. */
const EMPTY_NOTE: MinimalEvent = { id: "", kind: 1, pubkey: "", created_at: 0, content: "", tags: [] };

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 2592000)}mo`;
}

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
 * A quoted event that is a list (bookmarks, a bookmark set — lib/listItems)
 * has no words of its own: it is drawn as the list, not as an empty note.
 */
export function EmbeddedNoteCard(props: EmbeddedNoteCardProps) {
  if (ITEM_LIST_KINDS.has(props.event.kind))
    return <EmbeddedListCard event={props.event} author={props.author} href={props.href} nested={props.nested} />;
  return <NoteCardBody {...props} />;
}

function NoteCardBody({
  event,
  author,
  profiles,
  href,
  trustScore01,
  showReplyContext = false,
  nested = false,
}: EmbeddedNoteCardProps) {
  const tierRing = useTierRing();
  // Deleted by overwriting: a quiet stub in the quote's place, nothing to click.
  const blank = isBlankEvent(event);
  const coinReplaced = useCoinReplacedByRing();
  // Callers that fetched a POV-aware score pass it; everyone else (thread
  // ancestors, more-from-author, quoted embeds) gets the shared house cache,
  // so no embedded note's author sits bare while its neighbours wear rings.
  const fallbackScoreOf = useAuthorScores(trustScore01 == null ? [event.pubkey] : []);
  const effectiveScore01 = trustScore01 ?? fallbackScoreOf(event.pubkey);
  const ring = tierRing(effectiveScore01);
  const [, navigate] = useLocation();
  const name = author?.display_name || author?.name || "Unknown";
  const nip05Verified = useNip05(author?.nip05, event.pubkey) === "verified";
  // An article the note links is shown as its own card — the note's full
  // page does the same — and not as a bare "📄 article" link.
  // A quoted prediction market or ballot (kind 38000) is drawn as what it is:
  // a market's content is BAO's social post, a ballot's is raw JSON.
  const thing = THING_KINDS.has(event.kind) ? describeThing(event) : null;
  const shaped = thing?.detail.type === "market" || thing?.detail.type === "ballot" ? thing : null;
  // Neither shows its content, so nothing it names is looked up.
  const linked = useLinkedArticles(nested || shaped ? EMPTY_NOTE : event);
  // The note read once, for everything below that asks what it names.
  const refs = useMemo(() => analyzeNote(event), [event]);
  // A list it links by address: the list's name and count, one level deep.
  const linkedLists = useArticlesByRefs(nested || shaped ? [] : refs.addrs.filter((a) => ITEM_LIST_KINDS.has(a.kind)));
  // Drawn as cards below, so not again as links in the text.
  const cardCoords = useMemo(
    () => (linkedLists.coords.size ? new Set([...linked.coords, ...linkedLists.coords]) : linked.coords),
    [linked.coords, linkedLists.coords],
  );
  // Likewise a note it quotes: the quoted note, with its author, one level deep.
  const quoted = useQuotedNotes(nested || shaped ? [] : refs.quoteIds);
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

  if (blank)
    return <DeletedStub who={author?.display_name || author?.name} className="mt-2" testId="embedded-deleted" />;
  return (
    <div
      className={`not-prose mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70 ${href ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-700" : ""}`}
      data-testid="embedded-note"
      onClick={onClick}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <a href={npub ? `/p/${npub}` : undefined} className="flex min-w-0 items-center gap-2 hover:opacity-80">
          <Avatar
            className={`h-6 w-6 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${ring ?? ""}`}
          >
            {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden rounded-full">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ProfileEmojiText pubkey={event.pubkey} text={name} />
          </span>
          {nip05Verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
        </a>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {typeof effectiveScore01 === "number" && Number.isFinite(effectiveScore01) && (
            <VerificationCoin
              score01={effectiveScore01}
              pov="global"
              size={22}
              className={ring && coinReplaced ? "sr-only" : ""}
            />
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">{ago(event.created_at)}</span>
        </div>
      </div>
      {replyTargets.length > 0 && (
        <p
          className="mb-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400"
          data-testid="embedded-reply-context"
        >
          <MessageSquare className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
          <span>Replying to</span>
          {replyTargets.slice(0, 2).map((pk) => {
            const p = profiles?.get(pk);
            return (
              <span key={pk} className="font-medium text-brand-link">
                @{p?.display_name || p?.name || "someone"}
              </span>
            );
          })}
          {replyTargets.length > 2 && <span>+{replyTargets.length - 2}</span>}
        </p>
      )}
      {shaped ? (
        <div data-testid="embedded-thing">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
            {shaped.title}
          </p>
          {shaped.detail.type === "market" && shaped.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{shaped.description}</p>
          )}
          <div className="mt-2">
            {shaped.detail.type === "market" ? (
              <MarketSummary detail={shaped.detail} link={shaped.link} />
            ) : shaped.detail.type === "ballot" ? (
              <BallotAnswers detail={shaped.detail} />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="line-clamp-5 text-[14px]">
          <NoteContent
            content={event.content}
            compact
            profiles={profiles}
            imageOpensThread={!!href}
            tags={event.tags}
            authorName={author?.display_name || author?.name}
            embeddedCoords={cardCoords}
            embeddedIds={quoted.ids}
          />
        </div>
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
