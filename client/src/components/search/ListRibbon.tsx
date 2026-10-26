/**
 * The ribbon over the All tab's results (hooks/useListRibbon): a square per
 * Dictionary list the words find items on — its image, its name, how many —
 * in the People strip's shape on Top, then one per kind on All's page
 * (lib/kindTiles): "Videos", "Articles". Pressing one narrows All to that
 * list's items or that kind's rows; pressing it again lets go. ListNarrowing
 * heads the narrowed page.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AppWindow,
  ArrowRight,
  Calendar,
  ClipboardList,
  Code,
  FileText,
  Heart,
  Image,
  List,
  MessageSquare,
  Shapes,
  ShoppingBag,
  Users,
} from "lucide-react";
import { avatarSrc } from "@/lib/avatarSrc";
import { parseCoordinate } from "@/lib/dlistFields";
import { kindFamily, type KindFamily } from "@/lib/kindFamily";
import type { KindTile } from "@/lib/kindTiles";
import { tone } from "@/lib/tones";
import type { RibbonList } from "@/hooks/useListRibbon";

/** "12", or "50+" when the relay stopped at its cap. */
export const countOf = (list: RibbonList) => `${list.hits.length}${list.more ? "+" : ""}`;

const FAMILY_ICON: Record<KindFamily, ComponentType<{ className?: string }>> = {
  people: Users,
  note: MessageSquare,
  social: Heart,
  article: FileText,
  media: Image,
  code: Code,
  live: Calendar,
  market: ShoppingBag,
  apps: AppWindow,
  record: ClipboardList,
  list: List,
};

export function ListRibbon({
  lists,
  kinds,
  pressed,
  onPress,
}: {
  lists: readonly RibbonList[];
  kinds: readonly KindTile[];
  /** The tile All is narrowed to: a list's coordinate, or a kind's key. */
  pressed: string | null;
  onPress: (key: string | null) => void;
}) {
  if (lists.length === 0 && kinds.length === 0) return null;
  const press = (key: string) => () => onPress(pressed === key ? null : key);
  return (
    <div
      role="group"
      aria-label="Lists and kinds the words find"
      className="-mx-1 mb-3 flex gap-2.5 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="list-ribbon"
    >
      {lists.map((list) => (
        <Tile
          key={list.coordinate}
          name={list.name}
          count={countOf(list)}
          picture={<ListPicture image={list.image} />}
          pressed={pressed === list.coordinate}
          onPress={press(list.coordinate)}
          testId={`list-tile-${parseCoordinate(list.coordinate)?.d ?? list.coordinate}`}
        />
      ))}
      {kinds.map((kind) => {
        const family = kindFamily(kind.hits[0].event.kind);
        const Icon = family ? FAMILY_ICON[family] : Shapes;
        const t = tone(kind.tone);
        return (
          <Tile
            key={kind.key}
            name={kind.name}
            count={String(kind.hits.length)}
            picture={
              <span className={`flex h-full w-full items-center justify-center ${t.bg} ${t.icon}`}>
                <Icon className="h-5 w-5" />
              </span>
            }
            pressed={pressed === kind.key}
            onPress={press(kind.key)}
            testId={`kind-tile-${kind.label.toLowerCase().replace(/\s+/g, "-")}`}
          />
        );
      })}
    </div>
  );
}

function ListPicture({ image }: { image: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return image && failed !== image ? (
    <img
      src={avatarSrc(image, "sm")}
      onError={() => setFailed(image)}
      alt=""
      className="h-full w-full bg-white object-contain"
    />
  ) : (
    <List className="h-5 w-5" />
  );
}

function Tile({
  name,
  count,
  picture,
  pressed,
  onPress,
  testId,
}: {
  name: string;
  count: string;
  picture: ReactNode;
  pressed: boolean;
  onPress: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      title={`${name}: ${count} found`}
      className={`flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-xl border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
        pressed
          ? "border-brand-primary bg-brand-primary/10 dark:border-brand-accent/25 dark:bg-brand-primary/[0.15]"
          : "border-slate-100 bg-white/70 hover:border-slate-200 hover:shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:hover:border-slate-800"
      }`}
      data-testid={testId}
    >
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        {picture}
      </span>
      <span className="line-clamp-2 w-full text-center text-xs font-semibold leading-tight text-slate-800 dark:text-slate-100">
        {name}
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

/** Above All's results while a kind narrows them: how many of All's rows are that kind. */
export function KindNarrowing({ kind }: { kind: KindTile }) {
  return (
    <p className="mb-2 px-1 text-xs text-slate-500 dark:text-slate-400" data-testid="kind-narrowing">
      {kind.hits.length} {kind.hits.length === 1 ? kind.label : kind.name} in these results
    </p>
  );
}
