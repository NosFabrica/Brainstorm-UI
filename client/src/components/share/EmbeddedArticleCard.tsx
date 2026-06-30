import { type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { FileText, BadgeCheck, ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initialsFor } from "@/lib/profileDefaults";
import { naddrForEvent } from "@/lib/articleLinks";
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
export function EmbeddedArticleCard({ event, author }: { event: MinimalEvent; author?: ProfileLite }) {
  const title = tagVal(event, "title") || "Untitled article";
  const summary = tagVal(event, "summary") || "";
  const image = tagVal(event, "image");
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
      className={`mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 ${href ? "cursor-pointer hover:border-slate-300 transition-colors" : ""}`}
      data-testid="embedded-article"
      onClick={onCardClick}
    >
      <div className="flex flex-col sm:flex-row">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-40 w-full object-cover sm:h-auto sm:w-32 sm:self-stretch shrink-0"
          />
        ) : (
          <div className="h-24 w-full sm:h-auto sm:w-32 sm:self-stretch shrink-0 bg-indigo-50 border-b sm:border-b-0 sm:border-r border-slate-200 flex items-center justify-center">
            <FileText className="h-7 w-7 text-indigo-400" />
          </div>
        )}

        <div className="min-w-0 flex-1 p-3">
          <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500">
            <FileText className="h-3 w-3" /> Article
          </p>
          <p className="text-sm font-bold text-slate-900 line-clamp-2 mt-0.5">{title}</p>
          {summary && <p className="text-xs text-slate-500 line-clamp-2 mt-1">{summary}</p>}

          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Avatar className="h-4 w-4 rounded-full bg-white border border-slate-200">
              {author?.picture ? <AvatarImage src={author.picture} alt={name} className="object-cover" /> : null}
              <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-bold">{initialsFor(name)}</AvatarFallback>
            </Avatar>
            <span className="font-medium text-slate-600 truncate">{name}</span>
            {author?.nip05 && <BadgeCheck className="h-3 w-3 text-sky-500 shrink-0" />}
            {event.created_at ? <span className="text-slate-400 ml-auto shrink-0">{ago(event.created_at)}</span> : null}
          </div>

          {/* Read the full article on Brainstorm's on-site reader. */}
          {naddr && (
            <div className="mt-2.5">
              <Link
                href={`/a/${naddr}`}
                className="inline-flex items-center gap-1 rounded-lg bg-[#3730a3] hover:bg-[#312e81] px-3 py-1.5 text-xs font-semibold text-white transition-colors"
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
