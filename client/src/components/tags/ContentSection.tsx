import { useState } from "react";
import {
  AppWindow,
  Box,
  CalendarDays,
  CircleDot,
  FileText,
  FolderGit2,
  GitPullRequest,
  HandCoins,
  Image as ImageIcon,
  List as ListIcon,
  MessageSquare,
  Music,
  Radio,
  ScrollText,
  ShoppingBag,
  Star,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { isReady, useItemView } from "@/hooks/useItemView";
import { proxiedSrc } from "@/lib/imageProxy";
import type { KindEvent } from "@/lib/kindLabel";
import type { TaggableType } from "@/lib/taggable";

/**
 * A section of tagged content, headed by what it holds: "Events 2", "Apps 1".
 * One heading for Your tags and for a tag's own page, so the two file content
 * the same way and say it in the same words (lib/taggable).
 */

/** Stands in for a thing that isn't a list's item, so a heading asks for one view whatever it marks. */
const NO_ITEM = { kind: 0, tags: [] as string[][] };

/** A section's mark, by its key (lib/taggable): the same sense as the filter it is named for. */
export const SECTION_ICON: Record<string, LucideIcon> = {
  "filter:notes": MessageSquare,
  "filter:articles": FileText,
  "filter:recipes": UtensilsCrossed,
  "filter:nips": ScrollText,
  "filter:music": Music,
  "filter:events": CalendarDays,
  "filter:live": Radio,
  "filter:apps": AppWindow,
  "filter:repos": FolderGit2,
  "filter:issues": CircleDot,
  "filter:prs": GitPullRequest,
  "filter:communities": Users,
  "filter:fundraisers": HandCoins,
  "filter:reviews": Star,
  "filter:lists": ListIcon,
  "filter:shop": ShoppingBag,
  "filter:media": ImageIcon,
};

/**
 * The mark beside a content section's heading: the one its rows fall back to;
 * for a Dictionary list no filter is named for, the list's own mark.
 */
function SectionMark({ type, event, testId }: { type: TaggableType; event?: KindEvent; testId: string }) {
  const view = useItemView(type.key.startsWith("list:") && event ? event : NO_ITEM);
  const listImage = isReady(view) ? view.shown.listImage : null;
  const [broken, setBroken] = useState<string | null>(null);
  if (listImage && broken !== listImage) {
    return (
      <img
        src={proxiedSrc(listImage, "avatar_sm")}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(listImage)}
        className="h-4 w-4 shrink-0 rounded object-cover"
        data-testid={`${testId}-mark`}
      />
    );
  }
  const Icon = SECTION_ICON[type.key] ?? Box;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />;
}

/** The heading itself: the mark, the name the filter has, how many. `testId` names the section's parts. */
export function ContentSectionHeading({
  type,
  count,
  event,
  testId,
}: {
  type: TaggableType;
  count: number;
  /** One of the section's things: a Dictionary list's section wears that list's mark. */
  event?: KindEvent;
  testId: string;
}) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
      <SectionMark type={type} event={event} testId={testId} />
      <span data-testid={`${testId}-name`}>{type.plural}</span>
      <span
        className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500"
        data-testid={`${testId}-count`}
      >
        {count}
      </span>
    </h4>
  );
}
