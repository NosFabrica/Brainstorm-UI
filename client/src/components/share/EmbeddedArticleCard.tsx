import { useState, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { FileText, BadgeCheck, ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { naddrForEvent } from "@/lib/articleLinks";
import articleDefault from "@/assets/article-default.webp";
import type { MinimalEvent } from "@/lib/noteRefs";

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
 * "Open in app" handoff. Responsive: image stacks on top on mobile, sits to the
 * left on desktop. Replaces an ugly raw `naddr`/article URL.
 */
export function EmbeddedArticleCard({ event, author , trustScore01 }: { trustScore01?: number | null; event: MinimalEvent; author?: ProfileLite }) {
  const tierRing = useTierRing();
  // Callers that fetched a score pass it (dashboard/reading cards); the
  // profile's article list doesn't — self-serve from the shared house cache.
  const fallbackScoreOf = useAuthorScores(trustScore01 == null ? [event.pubkey] : []);
  const effectiveScore01 = trustScore01 ?? fallbackScoreOf(event.pubkey);
  const title = tagVal(event, "title") || "Untitled article";
  const summary = tagVal(event, "summary") || "";
  const image = tagVal(event, "image");
  // Fall back to the branded Brainstorm cover when an article has no image or
  // its image URL fails to load (dead host, hotlink block, etc.).
  const [imgBroken, setImgBroken] = useState(false);
  const coverSrc = !image || imgBroken ? articleDefault : image;
  const name = author?.display_name || author?.name || "Unknown";
  const naddr = naddrForEvent(event);
  const href = naddr ? `/a/${naddr}` : undefined;
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
      className={`mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 ${href ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors" : ""}`}
      data-testid="embedded-article"
      onClick={onCardClick}
    >
      <div className="flex flex-col sm:flex-row">
        <img
          src={coverSrc}
          alt=""
          loading="lazy"
          onError={() => setImgBroken(true)}
          className="h-40 w-full object-cover sm:h-auto sm:w-32 sm:self-stretch shrink-0 bg-slate-100 dark:bg-slate-800"
        />

        <div className="min-w-0 flex-1 p-3">
          <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand-primary">
            <FileText className="h-3 w-3" /> Article
          </p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2 mt-0.5">{title}</p>
          {summary && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{summary}</p>}

          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Avatar className={`h-4 w-4 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${tierRing(effectiveScore01, false, "sm", true) ?? ""}`}>
              {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
            </Avatar>
            <span className="font-medium text-slate-600 dark:text-slate-300 truncate">{name}</span>
            {author?.nip05 && <BadgeCheck className="h-3 w-3 text-sky-500 shrink-0" />}
            {event.created_at ? <span className="text-slate-400 dark:text-slate-500 ml-auto shrink-0">{ago(event.created_at)}</span> : null}
          </div>

          {/* Read the full article on Brainstorm's on-site reader. */}
          {naddr && (
            <div className="mt-2.5">
              <Link
                href={`/a/${naddr}`}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                data-testid="article-read"
              >
                Read article <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
