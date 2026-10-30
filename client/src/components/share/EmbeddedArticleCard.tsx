import { useMemo, useState, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { BadgeCheck, ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useNip05 } from "@/hooks/useNip05";
import { naddrForEvent } from "@/lib/articleLinks";
import { articleBrief } from "@/lib/wiki";
import { BOOKSHELF_KIND, publicationTitle, PUBLICATION_KINDS, shelfLine } from "@/lib/publication";
import articleDefault from "@/assets/article-default.webp";
import specCover from "@/assets/nostr-implementation-decentralized-network-specs-cover.webp";
import recipeCover from "@/assets/cooking-recipe-easy-recipe-steps-cover.webp";

/** What the default covers show — for search engines and screen readers alike. */
export const SPEC_COVER_ALT = "Nostr Implementation — decentralized network specs";
export const RECIPE_COVER_ALT = "Cooking Recipe — easy recipe steps";
import type { MinimalEvent } from "@/lib/noteRefs";
import { isBlankEvent } from "@/lib/blankEvent";
import { DeletedStub } from "@/components/share/DeletedStub";
import { SensitiveTile } from "@/components/share/SensitiveMedia";
import { contentWarningOf } from "@/lib/nip36";
import { sourceAppFor } from "@/lib/sourceApp";
import { specKindTags } from "@/lib/kindLabel";
import { KindPill } from "@/components/ui/kind-pill";
import { ViaRelay } from "@/components/ui/via-relay";
import { EmojiText, ProfileEmojiText } from "@/components/ui/custom-emoji";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { ARTICLE_EMBED_KINDS, embedShapeOf } from "@/lib/embedShape";
import { nip19 } from "nostr-tools";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

function tagVal(ev: MinimalEvent, key: string): string | undefined {
  return ev.tags.find((t) => t[0] === key)?.[1] || undefined;
}

function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 2592000)}mo ago`;
}

/**
 * A long-form article (NIP-23 kind-30023) teaser: cover image, title, a short
 * brief, and the author — with a "Read article" web-reader link and an
 * "Open in app" handoff. Responsive to its OWN width, not the viewport's: the
 * cover stacks on top when the card is narrow and sits to the left when it
 * has room. A viewport breakpoint put a card inside a two-column grid on a
 * desktop side by side at 280px — the title in a 90px column and the
 * button wrapping (Benjamin, 2026-09-24: "this looks bad"). Replaces an
 * ugly raw `naddr`/article URL.
 */
/** How many of a spec's kinds a card shows; the spec page has them all. */
const KIND_CHIPS_SHOWN = 6;

type EmbeddedArticleCardProps = {
  trustScore01?: number | null;
  event: MinimalEvent;
  author?: ProfileLite;
  /** The kinds the search asked for — shown first, so a reader sees why the card matched. */
  leadKinds?: string[];
  /** Whether the surface mixes kinds. The Recipes and NIPs tabs hold one and say so; the pill stays away there. */
  mixed?: boolean;
};

/** An address names a replaceable or addressable event; anything else is opened by its id. */
const isAddressable = (kind: number) =>
  kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000) || (kind >= 30000 && kind < 40000);

/** The event's page here: by its address when it has one, else by its id. */
function eventHref(event: MinimalEvent): string | undefined {
  if (isAddressable(event.kind)) {
    const naddr = naddrForEvent(event);
    return naddr ? `/e/${naddr}` : undefined;
  }
  try {
    return `/e/${nip19.neventEncode({ id: event.id, author: event.pubkey })}`;
  } catch {
    return undefined;
  }
}

/**
 * Callers hand this card whatever a note links by address — a stream, a
 * listing, a video, a list, a web bookmark, junk on a shared kind — not only
 * articles. Those are drawn as what they are (EmbeddedNoteCard, by
 * lib/embedShape), opening their own page, never as an "Untitled article"
 * with the default cover. EmbeddedNoteCard sends articles back here, so the
 * two never pass an event between them twice.
 */
export function EmbeddedArticleCard(props: EmbeddedArticleCardProps) {
  const shape = useMemo(() => embedShapeOf(props.event), [props.event]);
  // An article, or one overwritten to nothing (the article's own deleted stub).
  if (shape === "article" || (shape === "note" && ARTICLE_EMBED_KINDS.has(props.event.kind)))
    return <ArticleCardBody {...props} />;
  return <EmbeddedNoteCard event={props.event} author={props.author} href={eventHref(props.event)} nested />;
}

/** The card's way in, named for what it opens: "Read spec", "Read section", "Open bookshelf". */
function readLabel(event: MinimalEvent, isSpec: boolean, isWiki: boolean): string {
  if (event.kind === BOOKSHELF_KIND) return "Open bookshelf";
  if (event.kind === 30040) return "Read publication";
  if (event.kind === 30041) return "Read section";
  return `Read ${isSpec ? "spec" : isWiki ? "wiki" : (sourceAppFor(event)?.noun ?? "article").toLowerCase()}`;
}

function ArticleCardBody({ event, author, trustScore01, leadKinds = [], mixed = true }: EmbeddedArticleCardProps) {
  // Deleted by overwriting: a quiet stub in the card's place, nothing to click.
  // The hooks still run for it — an article overwritten while its card is on
  // screen turns blank on a later render, and the hook count must not move —
  // but they ask about nothing: a stub shows no score and no verified badge.
  const blank = isBlankEvent(event);
  const tierRing = useTierRing();
  // Callers that fetched a score pass it (dashboard/reading cards); the
  // profile's article list doesn't — self-serve from the shared house cache.
  const fallbackScoreOf = useAuthorScores(trustScore01 == null && !blank ? [event.pubkey] : []);
  // Fall back to the branded Brainstorm cover when an article has no image or
  // its image URL fails to load (dead host, hotlink block, etc.).
  const [imgBroken, setImgBroken] = useState(false);
  const nip05Verified = useNip05(blank ? undefined : author?.nip05, event.pubkey) === "verified";
  const [, navigate] = useLocation();
  if (blank)
    return <DeletedStub who={author?.display_name || author?.name} className="mt-2" testId="embedded-deleted" />;

  const effectiveScore01 = trustScore01 ?? fallbackScoreOf(event.pubkey);
  // A publication's or a section's title is often missing; its `d` is a readable slug.
  const title =
    tagVal(event, "title") || (PUBLICATION_KINDS.has(event.kind) ? publicationTitle(event) : "") || "Untitled article";
  // A wiki page (NIP-54) has no summary tag; its opening words stand in.
  const isWiki = event.kind === 30818;
  // A spec (kind 30817) says which event kinds it covers in `k` tags.
  const isSpec = event.kind === 30817;
  // Each is the NIPs tab's filter: the specs that cover that kind. In order.
  // Each with the name its author gave it: with no NIP number to lean on, the
  // kind's own name is what tells a reader what the chip means.
  const allKinds = isSpec ? specKindTags(event) : [];
  // A capability profile lists forty kinds; six keep every card the same
  // height, the searched kind leading, the rest counted.
  const lead = allKinds.filter((k) => leadKinds.includes(k.kind));
  const coveredKinds = [...lead, ...allKinds.filter((k) => !lead.includes(k))].slice(0, KIND_CHIPS_SHOWN);
  const moreKinds = allKinds.length - coveredKinds.length;
  // A shelf has no words of its own; what it holds says what it is.
  const summary = articleBrief(event) || (event.kind === BOOKSHELF_KIND ? shelfLine(event) : "");
  const image = tagVal(event, "image");
  // Whatever its kind, one its creator marked sensitive (NIP-36) shows no cover picture: its page asks first.
  const sensitive = !!contentWarningOf(event);
  // A spec wears the NIP cover, a recipe the recipe cover, the rest the article one.
  const fallbackCover = isSpec ? specCover : sourceAppFor(event)?.noun === "Recipe" ? recipeCover : articleDefault;
  const coverSrc = !image || imgBroken ? fallbackCover : image;
  // A book's cover is a portrait jacket: shown whole, not cropped to its middle by the 16:9 frame.
  const jacket = event.kind === 30040 && coverSrc === image;
  const coverAlt = coverSrc === specCover ? SPEC_COVER_ALT : coverSrc === recipeCover ? RECIPE_COVER_ALT : "";
  const name = author?.display_name || author?.name || "Unknown";
  const naddr = naddrForEvent(event);
  const href = naddr ? `/e/${naddr}` : undefined;

  // Whole card is clickable (matches EmbeddedNoteCard). Clicks on the inner
  // "Read article" link / author link keep their own behavior, and
  // stopPropagation keeps it safe when embedded inside a clickable note card.
  const onCardClick = href
    ? (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("a, button, video, [data-noopen]")) return;
        e.stopPropagation();
        navigate(href);
      }
    : undefined;

  return (
    <div
      className={`not-prose mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 @container dark:border-slate-800 dark:bg-slate-900/70 ${href ? "cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-700" : ""}`}
      data-testid="embedded-article"
      onClick={onCardClick}
    >
      {/* `@[26rem]`: the card's own width at which the cover moves beside the
          text — the 11rem cover, its margins, and room for a title. Written
          out in full: Tailwind only sees class names it can read whole. */}
      <div className="flex flex-col @[26rem]:flex-row">
        {/* One shape for every card — 16:9, the shape covers are — so the
            same cover never crops differently from card to card, and a
            banner shows edge to edge. Dimensions declared: no jump on load. */}
        {sensitive ? (
          <SensitiveTile className="aspect-video w-full shrink-0 @[26rem]:m-3 @[26rem]:w-44 @[26rem]:self-start @[26rem]:rounded-lg" />
        ) : (
          <img
            src={coverSrc}
            alt={coverAlt}
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            onError={() => setImgBroken(true)}
            className={`aspect-video w-full shrink-0 bg-slate-100 @[26rem]:m-3 @[26rem]:w-44 @[26rem]:self-start @[26rem]:rounded-lg dark:bg-slate-800 ${jacket ? "object-contain" : "object-cover"}`}
            data-cover-fit={jacket ? "contain" : "cover"}
          />
        )}

        <div className="min-w-0 flex-1 p-3">
          <KindPill event={event} mixed={mixed} />
          <p className="mt-0.5 line-clamp-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <EmojiText text={title} tags={event} />
          </p>
          {summary && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
              <EmojiText text={summary} tags={event} />
            </p>
          )}
          {coveredKinds.length > 0 && (
            <p
              className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500"
              data-testid="article-kinds"
            >
              {coveredKinds.map(({ kind, label }) => (
                <Link
                  key={kind}
                  href={`/?t=nips&q=${encodeURIComponent(`kind:${kind}`)}`}
                  title={label ? `${label} — specs that cover kind ${kind}` : `Specs that cover kind ${kind}`}
                  className="inline-flex max-w-full items-center rounded bg-slate-100 px-1 py-0.5 transition-colors hover:text-brand-deep dark:bg-slate-800 dark:hover:text-brand-link"
                >
                  {kind}
                  {label && (
                    <span className="max-w-[10rem] truncate text-slate-500 dark:text-slate-400"> · {label}</span>
                  )}
                </Link>
              ))}
              {moreKinds > 0 && (
                <span className="px-1 py-0.5 text-slate-400 dark:text-slate-500" data-testid="article-kinds-more">
                  +{moreKinds} more
                </span>
              )}
            </p>
          )}

          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Avatar
              className={`h-4 w-4 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${tierRing(effectiveScore01, false, "sm", true) ?? ""}`}
            >
              {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden rounded-full">
                <DefaultAvatarImg />
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium text-slate-600 dark:text-slate-300">
              <ProfileEmojiText pubkey={event.pubkey} text={name} />
            </span>
            {nip05Verified && <BadgeCheck className="h-3 w-3 shrink-0 text-sky-500" />}
            {event.created_at ? (
              <span className="ml-auto shrink-0 text-slate-400 dark:text-slate-500">{ago(event.created_at)}</span>
            ) : null}
            <ViaRelay event={event} />
          </div>

          {/* Read the full article on Brainstorm's on-site reader. */}
          {naddr && (
            <div className="mt-2.5">
              <Link
                href={`/e/${naddr}`}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                data-testid="article-read"
              >
                {readLabel(event, isSpec, isWiki)} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
