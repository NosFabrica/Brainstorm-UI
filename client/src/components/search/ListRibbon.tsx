/**
 * The ribbon over the All tab's results (hooks/useListRibbon): a square per
 * Dictionary list the words find items on — its image, its name, how many —
 * in the People strip's shape on Top. Pressing one narrows All to that list's
 * items; pressing it again lets go. ListNarrowing heads the narrowed page.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, List } from "lucide-react";
import { avatarSrc } from "@/lib/avatarSrc";
import { parseCoordinate } from "@/lib/dlistFields";
import type { RibbonList } from "@/hooks/useListRibbon";

/** "12", or "50+" when the relay stopped at its cap. */
export const countOf = (list: RibbonList) => `${list.hits.length}${list.more ? "+" : ""}`;

export function ListRibbon({
  lists,
  pressed,
  onPress,
}: {
  lists: readonly RibbonList[];
  /** The list All is narrowed to, by its coordinate. */
  pressed: string | null;
  onPress: (coordinate: string | null) => void;
}) {
  if (lists.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Lists the words find"
      className="-mx-1 mb-3 flex gap-2.5 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="list-ribbon"
    >
      {lists.map((list) => (
        <ListTile
          key={list.coordinate}
          list={list}
          pressed={pressed === list.coordinate}
          onPress={() => onPress(pressed === list.coordinate ? null : list.coordinate)}
        />
      ))}
    </div>
  );
}

function ListTile({ list, pressed, onPress }: { list: RibbonList; pressed: boolean; onPress: () => void }) {
  const [failed, setFailed] = useState<string | null>(null);
  const count = countOf(list);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      title={`${list.name}: ${count} found`}
      className={`flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-xl border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
        pressed
          ? "border-brand-primary bg-brand-primary/10 dark:border-brand-accent/25 dark:bg-brand-primary/[0.15]"
          : "border-slate-100 bg-white/70 hover:border-slate-200 hover:shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:hover:border-slate-800"
      }`}
      data-testid={`list-tile-${parseCoordinate(list.coordinate)?.d ?? list.coordinate}`}
    >
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        {list.image && failed !== list.image ? (
          <img
            src={avatarSrc(list.image, "sm")}
            onError={() => setFailed(list.image)}
            alt=""
            className="h-full w-full bg-white object-contain"
          />
        ) : (
          <List className="h-5 w-5" />
        )}
      </span>
      <span className="line-clamp-2 w-full text-center text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100">
        {list.name}
      </span>
      <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{count}</span>
    </button>
  );
}

/**
 * Above All's results while a list narrows them: how many of its items the
 * words find, and "See all", the list's own page. Not a kind's page in search
 * (hooks/useListKinds): those match within the items the Dictionary reads, a
 * few hundred, so one could say none match where this found some.
 */
export function ListNarrowing({ list }: { list: RibbonList }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 px-1" data-testid="list-narrowing">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {countOf(list)} found in {list.name}
      </p>
      <Link
        href={list.href}
        className="inline-flex shrink-0 items-center gap-1 rounded text-[13px] font-medium text-slate-500 hover:text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-400"
        data-testid="list-see-all"
      >
        See all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
