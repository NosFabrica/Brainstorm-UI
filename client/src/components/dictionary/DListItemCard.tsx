/**
 * A list item as a results card — a GitHub account among search results or
 * in a listing. Drawn from the same view as its page and its popup row
 * (useItemView), so all three agree on title, summary, images and links.
 *
 * The card anatomy the other cards share (search/cards): an image tile, the
 * title with what it is beneath it, a two-line summary, the person who listed
 * it below a hairline; the item's first link is its site's favicon in the
 * corner, outside the card's own link, its name on hover.
 */
import { BookOpen } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { CardShell, CuratorFooter } from "@/components/search/cards";
import { useAuthors } from "@/components/share/things/shared";
import { isReady, useItemView } from "@/hooks/useItemView";
import { avatarSrc } from "@/lib/avatarSrc";
import { eventPath } from "@/lib/shareId";
import { dictionaryRelays } from "@/config/dictionary";
import type { SearchResult } from "@/lib/profileSearch";

export function DListItemCard({
  event,
  author,
  score,
}: {
  event: NostrEvent;
  /** The person who listed it, when the page already has them; fetched otherwise. */
  author?: SearchResult | null;
  score?: number | null;
}) {
  const view = useItemView(event);
  const fetched = useAuthors(author === undefined ? [event.pubkey] : []);
  const who = author ?? fetched.get(event.pubkey) ?? null;
  const href = eventPath(event, dictionaryRelays());

  if (!isReady(view)) {
    return (
      <CardShell event={event} href={href} testId={`dlist-item-card-${event.id}`}>
        <p className="text-sm text-slate-400" data-testid="dlist-item-card-pending">
          {view.pending ? "Reading this list item…" : "A list item whose definition couldn’t be read."}
        </p>
      </CardShell>
    );
  }

  const { resolved: r, shown, links } = view;
  const link = links[0];
  const picture = shown.image ?? shown.listImage;
  return (
    <CardShell
      event={event}
      href={href}
      openInUrl={link?.href}
      openInLabel={link?.label}
      openInHost={link?.host}
      openInPlacement="corner-icon"
      openInTestId={`dlist-item-card-link-${event.id}`}
      testId={`dlist-item-card-${event.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 ${shown.image ? "rounded-full" : "rounded-lg"}`}
        >
          {picture ? (
            <img
              src={avatarSrc(picture, "sm")}
              alt=""
              className={shown.image ? "h-full w-full object-cover" : "h-6 w-6 object-contain"}
              data-testid="dlist-item-card-image"
            />
          ) : (
            <BookOpen className="h-4 w-4 text-slate-400" />
          )}
        </span>
        {/* The corner link is the favicon alone, so the title keeps the width; what the
            item is goes on its own quiet line, the popup row's grey first word. */}
        <div className={`min-w-0 flex-1 ${link ? "pr-7" : ""}`}>
          <p
            className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
            data-testid="dlist-item-card-title"
          >
            {shown.title ?? `Untitled ${r.governing.singular.toLowerCase()}`}
          </p>
          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500" data-testid="dlist-item-card-kind">
            {r.governing.singular}
          </p>
          {shown.summary && (
            <p
              className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
              data-testid="dlist-item-card-summary"
            >
              {shown.summary}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <CuratorFooter kicker="Listed by" author={who} score={score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}
