import { useMemo, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { BadgeCheck, ExternalLink, MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { NoteContent } from "@/components/share/NoteContent";
import { contentWarningOf, revealKeyOf } from "@/lib/nip36";
import { SensitiveRevealBoundary } from "@/components/share/SensitiveMedia";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
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
import { describeThing, THING_KINDS, type Thing } from "@/lib/thing";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import { Chip } from "@/components/ui/chip";
import { embedShapeOf, namesItsKind, type EmbedShape } from "@/lib/embedShape";
import { kindLabel } from "@/lib/kindLabel";
import { EmbeddedKindCard, KIND_CARD_SHAPES, type KindCardShape } from "@/components/share/EmbeddedKindCard";
import { EmbeddedAudio, EmbeddedPictures, EmbeddedVideo } from "@/components/share/EmbeddedMedia";
import { Favicon } from "@/components/share/LinkPreview";
import { contentShape } from "@/lib/contentShape";
import { WEB_BOOKMARK_KIND, webBookmarkOf } from "@/lib/webBookmark";
import { ZAP_KINDS } from "@/lib/activity";
import { readKind, who } from "@/lib/resultReaders";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/** What a nested card asks the relays about: nothing. */
const EMPTY_NOTE: MinimalEvent = { id: "", kind: 1, pubkey: "", created_at: 0, content: "", tags: [] };

/** NIP-31: what a client that cannot read the kind should say it is. */
const altOf = (event: MinimalEvent) => event.tags.find((t) => t[0] === "alt")?.[1]?.trim() || undefined;

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
 * A quoted event is drawn as what it is (lib/embedShape), with the card its
 * kind has elsewhere: a list (bookmarks, a bookmark set — lib/listItems) as
 * the list, an article as its teaser, a thing, a people list, a stream, a
 * dated event, a listing, an app, a repo or a track as its card
 * (EmbeddedKindCard). A video, a picture post or a voice message keeps this
 * card's author line and shows its media; anything else its words, with its
 * kind named when it is not a note — a quoted zap or reaction is no mystery.
 */
export function EmbeddedNoteCard(props: EmbeddedNoteCardProps) {
  // A quote is its own post: the quoting post's "show" (SensitiveRevealScope) does not show it.
  return (
    <SensitiveRevealBoundary>
      <EmbeddedNoteCardInner {...props} />
    </SensitiveRevealBoundary>
  );
}

function EmbeddedNoteCardInner(props: EmbeddedNoteCardProps) {
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

/** Reposts (NIP-18): their content is the reposted event, as JSON. */
const REPOST_KINDS: ReadonlySet<number> = new Set([6, 16]);

/** The event a repost carries in its content, when it is one. */
function repostedEvent(event: MinimalEvent): MinimalEvent | null {
  if (!REPOST_KINDS.has(event.kind)) return null;
  try {
    const raw: unknown = JSON.parse(event.content);
    if (!raw || typeof raw !== "object") return null;
    const e = raw as Partial<MinimalEvent>;
    const ok =
      typeof e.id === "string" &&
      /^[0-9a-f]{64}$/i.test(e.id) &&
      typeof e.pubkey === "string" &&
      /^[0-9a-f]{64}$/i.test(e.pubkey) &&
      typeof e.kind === "number" &&
      typeof e.content === "string" &&
      typeof e.created_at === "number" &&
      Array.isArray(e.tags) &&
      e.tags.every((t) => Array.isArray(t) && t.every((v) => typeof v === "string"));
    return ok
      ? { id: e.id!, pubkey: e.pubkey!, kind: e.kind!, content: e.content!, created_at: e.created_at!, tags: e.tags! }
      : null;
  } catch {
    return null;
  }
}

/** A kind-38000 prediction market or ballot: drawn in the note card itself, its question and where it stands. */
function isInlineThing(event: MinimalEvent, thing: Thing | null): boolean {
  if (event.kind !== 38000) return false;
  const type = thing?.detail.type;
  return type === "market" || type === "ballot";
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
  const ring = tierRing(effectiveScore01);
  const [, navigate] = useLocation();
  const name = author?.display_name || author?.name || "Unknown";
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
  // A zap receipt's own content is empty — the amount, the people and the comment are in its
  // tags — so a quoted zap is said as the All tab's row says it: "⚡ 21 sats to @alice", from
  // its payer once their signed request vouches for them (lib/resultReaders), then the comment.
  const zapWords = useMemo(() => {
    if (!ZAP_KINDS.has(event.kind) || event.content.trim()) return null;
    const read = readKind(event);
    if (!read?.title) return null;
    return [read.by ? `${read.title} from ${who(read.by)}` : read.title, read.body].filter(Boolean).join("\n\n");
  }, [event]);
  // Ciphertext (a private follow set, a sealed list) is not for reading: the card says so.
  // JSON (a profile, app data) or nothing at all (a contact list) is not for reading either:
  // one line says what it is — unless it is a zap, said in words above. A repost is the note it
  // reposts — one level down, never deeper.
  const { sealed, structural, reposted } = useMemo(() => {
    const kind = contentShape(event.content).kind;
    const inner = nested ? null : repostedEvent(event);
    return {
      sealed: kind === "encrypted",
      structural: !inner && !bookmark && !zapWords && (kind === "json" || kind === "empty"),
      reposted: inner,
    };
  }, [event, nested, bookmark, zapWords]);
  const repostedAuthor = useLiveProfiles(reposted ? [reposted.pubkey] : []).get(reposted?.pubkey ?? "") as
    ProfileLite | undefined;
  // None of these shows its content, so nothing it names is looked up.
  const wordless = !!shaped || !!media || structural || !!reposted;
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
          {namesItsKind(event.kind) && (
            <Chip tone="slate" size="sm" className="shrink-0" data-testid="embedded-kind">
              {kindLabel(event)}
            </Chip>
          )}
          {typeof effectiveScore01 === "number" && Number.isFinite(effectiveScore01) && (
            <VerificationCoin
              score01={effectiveScore01}
              pov="global"
              size={22}
              className={ring && coinReplaced ? "sr-only" : ""}
            />
          )}
          {href ? (
            // The card's way to its page from the keyboard: a link of its own, never one around the card's links.
            <Link
              href={href}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              aria-label={`Open this ${kindLabel(event).toLowerCase()}`}
              className="rounded text-xs text-slate-400 hover:text-slate-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-500 dark:hover:text-slate-300"
              data-testid="embedded-open"
            >
              {ago(event.created_at) || "Open"}
            </Link>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">{ago(event.created_at)}</span>
          )}
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
      ) : media === "video" ? (
        <EmbeddedVideo key={revealKeyOf(event)} event={event} />
      ) : media === "picture" ? (
        <EmbeddedPictures key={revealKeyOf(event)} event={event} opensThread={!!href} />
      ) : media === "audio" ? (
        <EmbeddedAudio
          key={revealKeyOf(event)}
          event={event}
          artist={author?.display_name || author?.name}
          href={href}
        />
      ) : sealed ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400" data-testid="embedded-sealed">
          Encrypted — only its owner can read it
        </p>
      ) : reposted ? (
        <EmbeddedNoteCard
          event={reposted}
          author={repostedAuthor}
          href={`/e/${nip19.neventEncode({ id: reposted.id, author: reposted.pubkey })}`}
          nested
        />
      ) : structural ? (
        <p className="truncate text-sm text-slate-500 dark:text-slate-400" data-testid="embedded-structural">
          {kindLabel(event)}
          {altOf(event) ? ` — ${altOf(event)}` : ""}
        </p>
      ) : (
        <div className="line-clamp-5 text-[14px]">
          {bookmark && (
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              className="mb-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 no-underline transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              data-testid="embedded-web-bookmark"
            >
              <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                <Favicon host={bookmark.host} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
                <span className="truncate">{bookmark.host}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                {bookmark.title ?? bookmark.url.replace(/^https?:\/\//i, "")}
              </span>
            </a>
          )}
          <NoteContent
            key={revealKeyOf(event)}
            content={zapWords ?? event.content}
            compact
            profiles={profiles}
            imageOpensThread={!!href}
            tags={event.tags}
            contentWarning={contentWarningOf(event)}
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
