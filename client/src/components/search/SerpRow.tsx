/**
 * The compact Google-density result row — news-grade. A news-shaped note
 * (headline + article URL + summary, the shape the news bots publish)
 * renders as a real news card: outlet favicon + domain source line,
 * clickable headline out to the article, two-line summary, thumbnail.
 * Ordinary posts keep the author-line + snippet, with bare URLs upgraded
 * to clickable domain chips. The row body opens the in-app event page —
 * a div-with-navigate, so the external anchors inside stay legal HTML.
 */
import { ListCard } from "@/components/search/cards";
import { TRUSTED_PEOPLE_KIND } from "@/lib/trustedList";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { sourceAppFor } from "@/lib/sourceApp";
import { dlistOfEvent, parseDListMusician, parseDListSong } from "@/lib/dlists";
import { Link, useLocation } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Braces, Lock, Rss, type LucideIcon } from "lucide-react";
import { useTierRing } from "@/components/score/VerificationCoin";
import { isFeedAccount } from "@/lib/feedAccount";
import { nip19 } from "nostr-tools";
import { Favicon, LinkChip, LinkPreviewCard } from "@/components/share/LinkPreview";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { clientRef } from "@/lib/clientLinks";
import { useClientLink } from "@/hooks/useClientLink";
import { parseNoteContent, primaryLink, unwrapMarkdownLinks } from "@/lib/noteContent";
import { TranslateLine } from "@/components/share/TranslateLine";
import { useLightbox } from "@/components/share/Lightbox";
import { eventStore } from "@/lib/eventStore";
import { MentionChip } from "@/components/share/MentionChip";
import { fetchEventsByIds } from "@/services/nostr";
import { highlightTerms } from "@/lib/highlight";
import { linkResultOf, linkResultText } from "@/lib/linkResult";
import { useLinkMetadata } from "@/hooks/useLinkMetadata";
import { wavlakeTrackId } from "@/lib/wavlake";
import { WavlakeTrackCard } from "@/components/share/WavlakeTrackCard";
import { eventPath } from "@/lib/shareId";
import { wikiPlainText } from "@/lib/wiki";
import { describeDesignation } from "@/lib/nip85Declaration";
import { kindLabel } from "@/lib/kindLabel";
import { KindPill } from "@/components/ui/kind-pill";
import { ViaRelay } from "@/components/ui/via-relay";
import { contentShape } from "@/lib/contentShape";
import { describeThing, THING_KINDS } from "@/lib/thing";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { isVideoUrl, mediaPosterOf, mediaUrlOf, tagVal } from "@/components/search/cards";
import { BallotAnswers, MarketSummary } from "@/components/search/thingCards";
import { MediaImg } from "@/components/ui/media-img";
import { VideoFirstFrame } from "@/components/share/VideoFirstFrame";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { CustomEmojiImg, ProfileEmojiText } from "@/components/ui/custom-emoji";
import { splitCustomEmoji } from "@/lib/customEmoji";
import { parseHighlight } from "@/lib/nip84";
import { HighlightQuote, HighlightSourceLine, useHighlightSourceEvent } from "@/components/share/HighlightQuote";

function ago(created_at: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - created_at);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(created_at * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;
// Splits out both web links and nostr mention URIs so each renders as its
// clickable self — a domain chip, or the mentioned PERSON.
const TOKEN_SPLIT_RE = /(https?:\/\/\S+|nostr:n(?:pub|profile|event|ote)1[02-9ac-hj-np-z]+)/gi;
const EVENT_REF_RE = /^nostr:n(?:event|ote)1/i;

/**
 * The first `max` characters of a note, never cutting through a link or a
 * nostr: token — half a token is raw text nothing can render, and that is
 * how "nostr:nprofile1qqsgqke57…" reached a row.
 */
function clipAtToken(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = max;
  for (const m of text.matchAll(/https?:\/\/\S+|nostr:n(?:pub|profile|event|ote)1[02-9ac-hj-np-z]+/gi)) {
    const start = m.index ?? 0;
    if (start >= max) break;
    if (start + m[0].length > max) {
      cut = start;
      break;
    }
  }
  return text.slice(0, cut).trimEnd();
}

/** The events a text quotes — `nostr:nevent1…` / `nostr:note1…` — by id. */
function quotedIn(text: string): { id: string; uri: string }[] {
  const out: { id: string; uri: string }[] = [];
  for (const uri of text.match(/nostr:n(?:event|ote)1[02-9ac-hj-np-z]+/gi) ?? []) {
    try {
      const d = nip19.decode(uri.slice("nostr:".length).toLowerCase());
      const id = d.type === "note" ? (d.data as string) : d.type === "nevent" ? (d.data as { id: string }).id : null;
      if (id && !out.some((q) => q.id === id)) out.push({ id, uri });
    } catch {
      /* not decodable — stays as typed */
    }
  }
  return out;
}

/**
 * What this result calls itself, when the app that published it has a better
 * word than the kind's: a kind-30023 on zap.cooking is a "Recipe".
 */
export function typeLabelFor(event: {
  kind: number;
  tags: string[][];
  pubkey: string;
  id: string;
  content: string;
  created_at: number;
}): string {
  return dlistTypeFor(event)?.label ?? sourceAppFor(event)?.noun ?? kindLabel(event);
}

/**
 * A D-list event's word and icon (the team, 2026-09-24: associate the
 * musician/songs D-list event ids with the music icon): a header is a
 * "Music list", an item the song or musician it is.
 */
export function dlistTypeFor(event: {
  kind: number;
  tags: string[][];
  pubkey: string;
  id: string;
  content: string;
  created_at: number;
}): { label: string; icon: LucideIcon } | null {
  const list = dlistOfEvent(event);
  if (!list) return null;
  const category = list.category.charAt(0).toUpperCase() + list.category.slice(1);
  if (event.kind === 39998) return { label: `${category} list`, icon: list.icon };
  if (parseDListSong(event)) return { label: "Song", icon: list.icon };
  if (parseDListMusician(event)) return { label: "Musician", icon: list.icon };
  return { label: `${category} list item`, icon: list.icon };
}

/**
 * A headline is words: a mentioned person by name (no second anchor inside
 * the story's link), and no addresses — the picture is the thumbnail, the
 * story is the link. Benjamin, over "GTAing with nostr:npub1de6l09… is Live!
 * https://i.nostr.build/….png": never the raw id form.
 */
/** A headline's text with its people named and its links and event keys
 *  dropped — the story tiles and media captions use it too. */
export function Headline({ text, query, tags }: { text: string; query: string; tags?: string[][] }) {
  const parts = text.split(TOKEN_SPLIT_RE).filter((p) => !/^https?:\/\//i.test(p) && !EVENT_REF_RE.test(p));
  return (
    <>
      {parts.map((part, i) =>
        /^nostr:/i.test(part) ? (
          <MentionChip key={i} uri={part} plain />
        ) : (
          <Marked key={i} text={part.replace(/\s{2,}/g, " ")} query={query} tags={tags} />
        ),
      )}
    </>
  );
}

/** Bold the query terms in a run of plain text, its NIP-30 emoji drawn when the event has tags for them. */
function Marked({ text, query, tags }: { text: string; query: string; tags?: string[][] }) {
  const pieces = tags ? splitCustomEmoji(text, tags) : [{ type: "text" as const, value: text }];
  return (
    <>
      {pieces.map((p, j) =>
        p.type === "emoji" ? (
          <CustomEmojiImg key={j} code={p.code} url={p.url} />
        ) : (
          highlightTerms(p.value, query).map((seg, i) =>
            seg.hit ? (
              <mark key={`${j}.${i}`} className="bg-transparent font-semibold text-slate-900 dark:text-white">
                {seg.text}
              </mark>
            ) : (
              <span key={`${j}.${i}`}>{seg.text}</span>
            ),
          )
        ),
      )}
    </>
  );
}

/** The row's media square: a poster/image that HIDES itself if the URL is
 *  dead (expired signed thumbs must not render as broken glass), or a
 *  metadata-only <video> first frame when only the video itself exists. */
/** What the row's media square shows — one decision, shared by the square and
 *  the snippet (which leaves out the chip for the picture shown beside it). */
function rowThumbMedia(event: NostrEvent): { url: string | null; poster: string | null; isVideo: boolean } {
  const url = mediaUrlOf(event);
  const isImage = !!url && IMAGE_RE.test(url);
  return {
    url,
    poster: isImage ? url : (mediaPosterOf(event) ?? null),
    isVideo: !!url && !isImage && isVideoUrl(event, url),
  };
}

function RowThumb({
  event,
  author,
  score,
  onFail,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  onFail?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const openLightbox = useLightbox();
  // The full view is told whose media it is and where the post lives.
  const context = {
    author: author
      ? {
          name: getDisplayLabel(author),
          npub: author.npub,
          picture: author.picture,
          score01: score ?? author.wotRank ?? null,
        }
      : null,
    postHref: eventPath(event),
  };
  const { url, poster, isVideo } = rowThumbMedia(event);
  // Google's result thumbnail is a 92px square; a 64px one undersold every picture.
  const cls = "h-[92px] w-[92px] shrink-0 rounded-xl object-cover bg-slate-100 dark:bg-slate-800";
  // The thumbnail IS the media: a tap opens it full view (a clip plays), not
  // the post — the rest of the row still opens the post.
  const openMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVideo && url) openLightbox([{ url, kind: "video", poster }], 0, context);
    else if (poster) openLightbox([{ url: poster, kind: "image" }], 0, context);
  };
  if (poster && !failed) {
    return (
      <MediaImg
        src={poster}
        preset="media_320"
        alt=""
        loading="lazy"
        onError={() => {
          setFailed(true);
          onFail?.();
        }}
        onClick={openMedia}
        className={`${cls} cursor-zoom-in`}
        data-testid="serp-thumb"
      />
    );
  }
  if (isVideo && url) {
    return (
      <VideoFirstFrame src={url} onClick={openMedia} className={`cursor-pointer ${cls}`} testId="serp-video-thumb" />
    );
  }
  return null;
}

/** Snippet where bare URLs become clickable domain chips. `hide` is a URL
 *  the row already shows another way (its thumbnail), so no chip for it. */
export function Snippet({
  text,
  query,
  lines = 3,
  hide,
  tags,
}: {
  text: string;
  query: string;
  lines?: 2 | 3;
  hide?: string | null;
  /** The event's tags: its NIP-30 emoji are drawn. */
  tags?: string[][];
}) {
  const parts = unwrapMarkdownLinks(text).split(TOKEN_SPLIT_RE);
  return (
    <p
      className={`break-words text-sm leading-[1.58] text-slate-700 dark:text-slate-200 ${lines === 2 ? "line-clamp-2" : "line-clamp-3"}`}
    >
      {parts.map((part, i) => {
        if (/^https?:\/\//i.test(part)) {
          if (hide && part === hide) return null;
          // Chips are real external links — clicks belong to them, not the row.
          return (
            <span key={i} onClick={(e) => e.stopPropagation()}>
              <LinkChip url={part} />
            </span>
          );
        }
        // A quoted event renders as the post beneath the row, not as its key.
        if (EVENT_REF_RE.test(part)) return null;
        if (/^nostr:/i.test(part)) return <MentionChip key={i} uri={part} />;
        return <Marked key={i} text={part} query={query} tags={tags} />;
      })}
    </p>
  );
}

/**
 * The post a row quotes, beneath the row — like the first web link's card.
 * Store-first (search results are stored on arrival), one relay fallback;
 * the person via the same chip the snippet uses. Until it arrives, nothing;
 * if it never does, a small link to the event so the quote is never lost.
 */
function QuotedNoteCard({ id, uri, query }: { id: string; uri: string; query: string }) {
  const [, navigate] = useLocation();
  const held = !!eventStore.getEvent(id);
  const lookup = useStoreEvents(held ? null : `quoted:${id}`, [{ ids: [id] }], () => fetchEventsByIds([id]));
  const quoted = (lookup.events[0] as NostrEvent | undefined) ?? null;
  const missing = !quoted && lookup.settled;
  if (missing) {
    return (
      <Link
        href={`/e/${uri.slice("nostr:".length)}`}
        className="mt-1.5 inline-flex items-center text-xs font-medium text-brand-link hover:underline"
        data-testid="serp-quote-link"
      >
        ↳ quoted note
      </Link>
    );
  }
  if (!quoted) return null;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(eventPath(quoted))}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(eventPath(quoted));
      }}
      className="mt-2 cursor-pointer rounded-xl border border-slate-200 bg-white/70 px-3 py-2 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
      data-testid="serp-quote"
    >
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <MentionChip uri={`nostr:${nip19.npubEncode(quoted.pubkey)}`} />
      </div>
      <div className="mt-0.5 text-[13px] [&>p]:text-slate-600 dark:[&>p]:text-slate-300">
        <Snippet text={quoted.content.slice(0, 240)} query={query} lines={2} tags={quoted.tags} />
      </div>
    </div>
  );
}

function AuthorLine({
  author,
  score,
  created_at,
  type,
  typeOf,
  typeIcon: TypeIcon,
  feed = false,
  children,
}: {
  author: SearchResult | null;
  score?: number | null;
  created_at: number;
  type?: string;
  /** The event the type describes — the pill names only a spec by default. */
  typeOf?: NostrEvent;
  /** A D-list event's icon: its word always shows, beside the icon, whatever the technical view says. */
  typeIcon?: LucideIcon;
  /** An automated feed account — said quietly, so a reader knows the voice. */
  feed?: boolean;
  /** Trailing meta (a news row's outlet) — rides the same baseline. */
  children?: ReactNode;
}) {
  const tierRing = useTierRing();
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar
        className={`h-6 w-6 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}
      >
        {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      {/* Name (14px, Google's source line) and the 12px meta share one baseline —
          centring boxes of two font sizes leaves the meta riding high. */}
      <div className="flex min-w-0 items-baseline gap-1.5 leading-5">
        <span className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">
          {author ? <ProfileEmojiText pubkey={author.pubkey} text={getDisplayLabel(author)} /> : "Unknown"}
        </span>
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">· {ago(created_at)}</span>
        {type && TypeIcon ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400 dark:text-slate-500"
            data-testid="serp-type"
          >
            · <TypeIcon className="h-3 w-3" />
            {type}
          </span>
        ) : (
          type && <KindPill event={typeOf} label={type} className="self-center" />
        )}
        {typeOf && <ViaRelay event={typeOf} />}
        {feed && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-xs text-slate-400 dark:text-slate-500"
            title="An automated feed account"
            data-testid="serp-feed"
          >
            · <Rss className="h-3 w-3" /> feed
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

/** "⚡ 12 · 4 replies" — quiet, and silent at zero. */
export function EngagementLine({ zaps, replies, testId }: { zaps: number; replies: number; testId?: string }) {
  if (zaps <= 0 && replies <= 0) return null;
  const parts: string[] = [];
  if (zaps > 0) parts.push(`⚡ ${zaps}`);
  if (replies > 0) parts.push(`${replies} ${replies === 1 ? "reply" : "replies"}`);
  return (
    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500" data-testid={testId}>
      {parts.join(" · ")}
    </p>
  );
}

type SerpRowProps = {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  query: string;
  /** Zap / reply counts when the caller fetched them (the home feed does). */
  engagement?: { zaps: number; replies: number };
  /** "· Note", "· Event" — only worth saying where kinds mix. */
  showType?: boolean;
};

/** The row is a link to the event's page — a div that navigates, so the anchors inside stay legal HTML. */
function rowPropsFor(event: NostrEvent, open: () => void) {
  return {
    role: "link" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
    className:
      "group flex cursor-pointer items-start gap-4 rounded-lg px-2 py-3.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
    "data-testid": `serp-row-${event.id}`,
  };
}

export function SerpRow(props: SerpRowProps) {
  // A Trusted List's content is its members again, as JSON: the row would say
  // "Structured data". It is a people list — drawn as one, with its scores.
  // A bookmark set has no words of its own, or only sealed ones: its card
  // says what it holds and shows the first few.
  if (props.event.kind === TRUSTED_PEOPLE_KIND || ITEM_LIST_KINDS.has(props.event.kind))
    return <ListCard event={props.event} author={props.author} score={props.score} />;
  return props.event.kind === 9802 && parseHighlight(props.event) ? (
    <HighlightRow {...props} />
  ) : (
    <NoteRow {...props} />
  );
}

/**
 * A NIP-84 highlight: what its highlighter said, the passage in a
 * highlighter's colour, and the text it is from — the article by title and
 * author, the page by name and site — with that text's picture on the right.
 */
function HighlightRow({ event, author, score, query, engagement, showType = true }: SerpRowProps) {
  const [, setLocation] = useLocation();
  const open = useCallback(() => setLocation(eventPath(event)), [event, setLocation]);
  const hl = useMemo(() => parseHighlight(event)!, [event]);
  const sourceEvent = useHighlightSourceEvent(hl.source.ref);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const meta = useLinkMetadata(hl.source.ref ? null : hl.source.url, rowRef);
  const cover = sourceEvent ? tagVal(sourceEvent, "image") : meta?.image;
  const thumb = cover && /^https?:\/\//i.test(cover) ? cover : null;
  return (
    <div {...rowPropsFor(event, open)} ref={rowRef}>
      <div className="min-w-0 flex-1">
        <AuthorLine
          author={author}
          score={score}
          created_at={event.created_at}
          type={showType ? typeLabelFor(event) : undefined}
          typeOf={event}
          feed={isFeedAccount(author)}
        />
        {hl.comment && (
          <div className="mt-2" data-testid="serp-highlight-comment">
            <Snippet text={hl.comment} query={query} lines={2} tags={event.tags} />
          </div>
        )}
        <div className="mt-2">
          <HighlightQuote lines={hl.comment ? 3 : 4} testId="serp-highlight-passage">
            <Headline text={hl.passage} query={query} tags={event.tags} />
          </HighlightQuote>
        </div>
        <HighlightSourceLine
          source={hl.source}
          sourceEvent={sourceEvent}
          pageTitle={meta?.title}
          testId="serp-highlight-source"
        />
        {engagement && <EngagementLine zaps={engagement.zaps} replies={engagement.replies} testId="serp-engagement" />}
      </div>
      {thumb && (
        <MediaImg
          src={thumb}
          preset="media_320"
          alt=""
          loading="lazy"
          className="h-[92px] w-[92px] shrink-0 rounded-xl bg-slate-100 object-cover dark:bg-slate-800"
          data-testid="serp-highlight-thumb"
        />
      )}
    </div>
  );
}

function NoteRow({ event, author, score, query, engagement, showType = true }: SerpRowProps) {
  const [, setLocation] = useLocation();
  const open = useCallback(() => setLocation(eventPath(event)), [event, setLocation]);
  // Dead news thumbs (expired signed URLs) vanish rather than render broken.
  const [newsThumbFailed, setNewsThumbFailed] = useState(false);
  // A dead row thumbnail gives its picture's chip back to the text.
  const [thumbFailed, setThumbFailed] = useState(false);

  // Communities, stalls, handlers, reviews and the rest read through lib/thing:
  // several keep their name in JSON content, where the row would say "Structured data".
  const thing = THING_KINDS.has(event.kind) ? describeThing(event) : null;
  const title = thing?.title ?? tagVal(event, "title") ?? tagVal(event, "name");
  // The link is the point (a share, or a feed's headline-link-summary): the
  // row shows the page the way a search engine does, not a note with a URL.
  // A Primal/Habla/… link names a Nostr thing and resolves natively below, so it is never a page result.
  const feed = isFeedAccount(author);
  const shared = !title && event.content ? linkResultOf(event.content, { feedAccount: feed }) : null;
  const news = shared && !clientRef(shared.url) ? shared : null;
  // The page's own title, description and picture — asked once the row is near.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const linkMeta = useLinkMetadata(news?.url ?? null, rowRef);

  // A wiki page is AsciiDoc; the row shows its words, not "[[comedian]]".
  // A designation is its rows, read for people; anything else with no
  // content gets the author's own NIP-31 `alt` line, when they wrote one.
  // Ciphertext and JSON are not for reading: the row says what they are.
  // A news or song row returns before any of this is shown, so it reads nothing.
  const shape = news || thing || event.kind === 10040 || event.kind === 30818 ? null : contentShape(event.content);
  const opaque = shape?.kind === "encrypted" || shape?.kind === "json";
  const body = news
    ? ""
    : thing
      ? thing.detail.type === "ballot"
        ? "" // its answers draw below, row by row
        : (thing.description ?? "")
      : opaque
        ? tagVal(event, "alt") || ""
        : event.kind === 10040
          ? describeDesignation(event).summary
          : (event.kind === 30818 ? wikiPlainText(event.content) : event.content) ||
            tagVal(event, "summary") ||
            tagVal(event, "description") ||
            tagVal(event, "alt") ||
            "";
  const shapeLine =
    shape?.kind === "encrypted"
      ? "Encrypted — only its owner can read it"
      : shape?.kind === "json"
        ? `Structured data · ${shape.fields} ${shape.fields === 1 ? "field" : "fields"}`
        : null;
  // Same link a feed would card for this note, so the two never disagree.
  const cardLink = body ? primaryLink(parseNoteContent(body)) : null;
  // A Primal link names a Nostr thing: an article is its card, the way the
  // note card on a profile shows it (Benjamin, 2026-09-25: megistus's row
  // said "primal.net" where the profile showed White Noise's "We're back").
  // Asked on every render, above the news and song returns: a row turns into
  // a news card when a feed author loads, and the hook count must not move.
  // A news row has no body, so it asks about nothing.
  const cardRef = cardLink ? clientRef(cardLink) : null;
  const cardEntity = useClientLink(cardRef);
  const linkedArticle =
    cardEntity.status === "done" && cardEntity.entity?.kind === "article" ? cardEntity.entity : null;
  // While a Primal link resolves, no metadata card either: it would flash and go.
  const plainCardLink =
    cardLink && !cardRef
      ? cardLink
      : cardLink && cardEntity.status === "done" && cardEntity.entity === null
        ? cardLink
        : null;

  const rowProps = rowPropsFor(event, open);

  if (news && wavlakeTrackId(news.url)) {
    // The link IS a song (Wavlake, or a StableKraft storefront on its
    // catalogue): play it here, in the row, instead of pointing at the page.
    return (
      <div {...rowProps}>
        <div className="min-w-0 flex-1">
          <div className="min-w-0" data-testid="news-source">
            <AuthorLine author={author} score={score} created_at={event.created_at}>
              <span className="hidden min-w-0 items-center gap-1 text-xs text-slate-400 dark:text-slate-500 sm:inline-flex">
                ·
                <Favicon host={news.domain} className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain" />
                <span className="truncate">{news.domain}</span>
              </span>
            </AuthorLine>
          </div>
          {/* The poster's words — the headline was only ever the note's text. */}
          <div className="mt-1.5 [&>p]:text-slate-700 dark:[&>p]:text-slate-200">
            <Snippet text={[news.headline, news.words].filter(Boolean).join(" ")} query={query} lines={2} />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <WavlakeTrackCard url={news.url} />
          </div>
          {engagement && (
            <EngagementLine zaps={engagement.zaps} replies={engagement.replies} testId="serp-engagement" />
          )}
        </div>
      </div>
    );
  }

  if (news) {
    // A link result, the way Google shows a page: who shared it, the source
    // line (site name, domain), the page's title, a description, a picture.
    // Title, source and picture open the page; the rest of the row opens the note.
    const text = linkResultText(news, linkMeta);
    const siteName =
      linkMeta?.siteName && linkMeta.siteName.toLowerCase() !== news.domain.toLowerCase() ? linkMeta.siteName : null;
    const thumb = news.imageUrl ?? linkMeta?.image ?? null;
    const out = {
      href: news.url,
      target: "_blank",
      rel: "noopener",
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
    };
    return (
      <div {...rowProps} ref={rowRef}>
        <div className="min-w-0 flex-1">
          <AuthorLine
            author={author}
            score={score}
            created_at={event.created_at}
            type={feed || news.headline ? "News" : undefined}
            typeOf={event}
            feed={feed}
          />
          <a
            {...out}
            className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-slate-500 hover:text-brand-primary dark:text-slate-400"
            data-testid="news-source"
          >
            <Favicon host={news.domain} className="h-4 w-4 shrink-0 rounded-sm object-contain" />
            <span className="truncate font-medium text-slate-600 dark:text-slate-300">{siteName ?? news.domain}</span>
            {/* The domain beside the name from `sm:` up; a phone shows the name alone. */}
            {siteName && (
              <span className="hidden truncate text-slate-400 dark:text-slate-500 sm:inline">· {news.domain}</span>
            )}
          </a>
          {text.title && (
            <a
              {...out}
              className="mt-1 line-clamp-2 block break-words text-lg font-semibold leading-[1.3] text-slate-900 transition-colors hover:text-brand-primary hover:underline dark:text-slate-100 sm:text-xl"
              data-testid="news-headline"
            >
              <Headline text={text.title} query={query} />
            </a>
          )}
          {text.description && (
            <div className="mt-1.5 [&>p]:text-slate-600 dark:[&>p]:text-slate-300">
              <Snippet text={text.description} query={query} lines={2} />
            </div>
          )}
          <TranslateLine text={`${text.title ?? ""}\n${text.description ?? ""}`.trim()} />
          {engagement && (
            <EngagementLine zaps={engagement.zaps} replies={engagement.replies} testId="serp-engagement" />
          )}
        </div>
        {thumb && !newsThumbFailed && (
          <a {...out} className="shrink-0" tabIndex={-1}>
            <img
              src={thumb}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setNewsThumbFailed(true)}
              className="h-[92px] w-[92px] rounded-xl bg-slate-100 object-cover shadow-sm dark:bg-slate-800"
              data-testid="news-thumb"
            />
          </a>
        )}
      </div>
    );
  }

  // The picture on the right is this URL; a chip for it in the text is the
  // same picture's address, said again.
  const thumb = rowThumbMedia(event);
  const thumbUrl = !thumbFailed && (thumb.poster === thumb.url || thumb.isVideo) ? thumb.url : null;
  // What the row actually shows — text past the clip isn't on screen.
  const shown = clipAtToken(body, 300);
  return (
    <div {...rowProps}>
      <div className="min-w-0 flex-1">
        <AuthorLine
          author={author}
          score={score}
          created_at={event.created_at}
          type={showType ? typeLabelFor(event) : undefined}
          typeIcon={showType ? dlistTypeFor(event)?.icon : undefined}
          typeOf={event}
          feed={isFeedAccount(author)}
        />
        {title && (
          <div className="mt-1.5 text-lg font-semibold leading-[1.3] text-slate-900 transition-colors group-hover:text-brand-primary dark:text-slate-100 sm:text-xl [&>p]:text-lg [&>p]:font-semibold [&>p]:leading-[1.3] sm:[&>p]:text-xl">
            <Snippet text={title} query={query} lines={2} tags={event.tags} />
          </div>
        )}
        {shapeLine && (
          <p
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"
            data-testid="serp-content-shape"
          >
            {shape?.kind === "encrypted" ? <Lock className="h-3 w-3" /> : <Braces className="h-3 w-3" />} {shapeLine}
          </p>
        )}
        {body && (
          <div className={title ? "mt-1.5" : "mt-2"}>
            <Snippet
              text={shown}
              query={query}
              lines={title ? 2 : 3}
              hide={linkedArticle ? cardLink : thumbUrl}
              tags={event.tags}
            />
            {/* X's "Translate post" for text in another language — on-device, quiet. */}
            <TranslateLine text={body.slice(0, 1000)} />
          </div>
        )}
        {thing?.detail.type === "market" && (
          <div className="mt-2.5 max-w-md">
            <MarketSummary detail={thing.detail} link={thing.link} testId={`serp-market-${event.id}`} />
          </div>
        )}
        {thing?.detail.type === "ballot" && (
          <div className="mt-2.5 max-w-md">
            <BallotAnswers detail={thing.detail} testId={`serp-ballot-${event.id}`} />
          </div>
        )}
        {linkedArticle && (
          <div onClick={(e) => e.stopPropagation()}>
            <EmbeddedArticleCard event={linkedArticle.event} author={linkedArticle.author} />
          </div>
        )}
        {plainCardLink && (
          <div onClick={(e) => e.stopPropagation()}>
            <LinkPreviewCard
              url={plainCardLink}
              showImage={!thumb.url}
              context={[title, shown].filter(Boolean).join("\n")}
            />
          </div>
        )}
        {quotedIn(body)
          .slice(0, 1)
          .map((q) => (
            <div key={q.id} onClick={(e) => e.stopPropagation()}>
              <QuotedNoteCard id={q.id} uri={q.uri} query={query} />
            </div>
          ))}
        {engagement && <EngagementLine zaps={engagement.zaps} replies={engagement.replies} testId="serp-engagement" />}
      </div>
      <RowThumb event={event} author={author} score={score} onFail={() => setThumbFailed(true)} />
    </div>
  );
}
