import { useState, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { BadgeCheck, ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useNip05 } from "@/hooks/useNip05";
import { naddrForEvent } from "@/lib/articleLinks";
import { articleBrief } from "@/lib/wiki";
import articleDefault from "@/assets/article-default.webp";
import specCover from "@/assets/nostr-implementation-decentralized-network-specs-cover.webp";
import recipeCover from "@/assets/cooking-recipe-easy-recipe-steps-cover.webp";

/** What the default covers show — for search engines and screen readers alike. */
export const SPEC_COVER_ALT = "Nostr Implementation — decentralized network specs";
export const RECIPE_COVER_ALT = "Cooking Recipe — easy recipe steps";
import type { MinimalEvent } from "@/lib/noteRefs";
import { sourceAppFor } from "@/lib/sourceApp";
import { specKindTags } from "@/lib/kindLabel";
import { KindPill } from "@/components/ui/kind-pill";
import { ViaRelay } from "@/components/ui/via-relay";

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

export function EmbeddedArticleCard({ event, author, trustScore01, leadKinds = [], mixed = true }: {
  trustScore01?: number | null;
  event: MinimalEvent;
  author?: ProfileLite;
  /** The kinds the search asked for — shown first, so a reader sees why the card matched. */
  leadKinds?: string[];
  /** Whether the surface mixes kinds. The Recipes and NIPs tabs hold one and say so; the pill stays away there. */
  mixed?: boolean;
}) {
  const tierRing = useTierRing();
  // Callers that fetched a score pass it (dashboard/reading cards); the
  // profile's article list doesn't — self-serve from the shared house cache.
  const fallbackScoreOf = useAuthorScores(trustScore01 == null ? [event.pubkey] : []);
  const effectiveScore01 = trustScore01 ?? fallbackScoreOf(event.pubkey);
  const title = tagVal(event, "title") || "Untitled article";
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
  const summary = articleBrief(event);
  const image = tagVal(event, "image");
  // Fall back to the branded Brainstorm cover when an article has no image or
  // its image URL fails to load (dead host, hotlink block, etc.).
  const [imgBroken, setImgBroken] = useState(false);
  // A spec wears the NIP cover, a recipe the recipe cover, the rest the article one.
  const fallbackCover = isSpec ? specCover : sourceAppFor(event)?.noun === "Recipe" ? recipeCover : articleDefault;
  const coverSrc = !image || imgBroken ? fallbackCover : image;
  const coverAlt = coverSrc === specCover ? SPEC_COVER_ALT : coverSrc === recipeCover ? RECIPE_COVER_ALT : "";
  const name = author?.display_name || author?.name || "Unknown";
  const nip05Verified = useNip05(author?.nip05, event.pubkey) === "verified";
  const naddr = naddrForEvent(event);
  const href = naddr ? `/e/${naddr}` : undefined;
  const [, navigate] = useLocation();

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
      className={`not-prose mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 @container ${href ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors" : ""}`}
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
        <img
          src={coverSrc}
          alt={coverAlt}
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          onError={() => setImgBroken(true)}
          className="aspect-video w-full object-cover shrink-0 bg-slate-100 dark:bg-slate-800 @[26rem]:m-3 @[26rem]:w-44 @[26rem]:self-start @[26rem]:rounded-lg"
        />

        <div className="min-w-0 flex-1 p-3">
          <KindPill event={event} mixed={mixed} />
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2 mt-0.5">{title}</p>
          {summary && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{summary}</p>}
          {coveredKinds.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500" data-testid="article-kinds">
              {coveredKinds.map(({ kind, label }) => (
                <Link
                  key={kind}
                  href={`/?t=nips&q=${encodeURIComponent(`kind:${kind}`)}`}
                  title={label ? `${label} — specs that cover kind ${kind}` : `Specs that cover kind ${kind}`}
                  className="inline-flex max-w-full items-center rounded bg-slate-100 px-1 py-0.5 transition-colors hover:text-brand-deep dark:bg-slate-800 dark:hover:text-brand-link"
                >
                  {kind}
                  {label && <span className="truncate max-w-[10rem] text-slate-500 dark:text-slate-400"> · {label}</span>}
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
            <Avatar className={`h-4 w-4 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${tierRing(effectiveScore01, false, "sm", true) ?? ""}`}>
              {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
            </Avatar>
            <span className="font-medium text-slate-600 dark:text-slate-300 truncate">{name}</span>
            {nip05Verified && <BadgeCheck className="h-3 w-3 text-sky-500 shrink-0" />}
            {event.created_at ? <span className="text-slate-400 dark:text-slate-500 ml-auto shrink-0">{ago(event.created_at)}</span> : null}
            <ViaRelay event={event} />
          </div>

          {/* Read the full article on Brainstorm's on-site reader. */}
          {naddr && (
            <div className="mt-2.5">
              <Link
                href={`/e/${naddr}`}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                data-testid="article-read"
              >
                Read {isSpec ? "spec" : isWiki ? "wiki" : (sourceAppFor(event)?.noun ?? "article").toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
