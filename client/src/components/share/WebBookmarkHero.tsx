/**
 * A NIP-B0 web bookmark (kind 39701): the link someone saved — its `d` tag,
 * the URL without its scheme when it is https — named by its `title`, with
 * the saver's words (the content), its topics (`t`) and when it was first
 * published (`published_at`). One link, never a list.
 *
 * `WebBookmarkLink` is the bookmark's own card: the site and the page's name,
 * out to the page. A quoted bookmark draws it above the saver's words
 * (EmbeddedNoteCard); the bookmark's page draws it larger, above the page's
 * own preview.
 */
import { ExternalLink } from "lucide-react";
import { Favicon, LinkPreviewCard } from "@/components/share/LinkPreview";
import { HashtagChips } from "@/components/share/ListPreview";
import { ReadingText } from "@/components/share/ReadingText";
import { contentWarningOf } from "@/lib/nip36";
import type { MinimalEvent } from "@/lib/noteRefs";
import { webBookmarkOf, type WebBookmark } from "@/lib/webBookmark";

export function WebBookmarkLink({
  bookmark,
  large = false,
  className = "",
}: {
  bookmark: WebBookmark;
  large?: boolean;
  className?: string;
}) {
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener"
      onClick={(e) => e.stopPropagation()}
      className={`block rounded-lg border border-slate-200 bg-white no-underline transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 ${large ? "px-4 py-3" : "px-3 py-2"} ${className}`}
      data-testid="embedded-web-bookmark"
    >
      <span
        className={`flex min-w-0 items-center gap-1 text-slate-500 dark:text-slate-400 ${large ? "text-xs" : "text-[11px] leading-4"}`}
      >
        <Favicon host={bookmark.host} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
        <span className="truncate">{bookmark.host}</span>
        <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
      </span>
      <span
        className={`mt-0.5 line-clamp-2 block font-semibold text-slate-900 dark:text-slate-100 ${large ? "text-lg" : "text-sm"}`}
        data-testid="web-bookmark-name"
      >
        {bookmark.title ?? bookmark.url.replace(/^https?:\/\//i, "")}
      </span>
    </a>
  );
}

export function WebBookmarkHero({ event }: { event: MinimalEvent }) {
  const bookmark = webBookmarkOf(event);
  if (!bookmark) return null;
  return (
    <div data-testid="web-bookmark-hero">
      <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        Saved a link
        {bookmark.publishedAt
          ? ` · ${new Date(bookmark.publishedAt * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
          : ""}
      </p>
      <WebBookmarkLink bookmark={bookmark} large />
      {bookmark.description && <ReadingText text={bookmark.description} tags={event.tags} className="mt-4" />}
      {/* The page's own picture and words, as a shared link previews; covered when the saver flagged it. */}
      <LinkPreviewCard url={bookmark.url} sensitive={!!contentWarningOf(event)} />
      {bookmark.topics.length > 0 && (
        <div className="mt-4">
          <HashtagChips hashtags={bookmark.topics} />
        </div>
      )}
    </div>
  );
}
