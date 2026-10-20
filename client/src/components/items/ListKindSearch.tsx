/**
 * The kinds of list item with a look of their own in search (ADR 0007's tier
 * three), handed to search through the app's root (TierThreeProvider →
 * hooks/useListKinds), so search names no concept. The design was settled on
 * a prototype (branch prototype/search-list-kinds): on the Top page, Books
 * are a row of covers, Places three rows with their pins on a map, GitHub
 * accounts three rows with their avatars — each only when the words find
 * something.
 *
 * Items are matched by what their cards show, a view's own reading included
 * (lib/listSearch), over the items the Dictionary reads: a stopgap until the
 * search API returns list items with their definitions (ADR 0004).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Github, Store, Zap } from "lucide-react";
import { conceptViewOf, dictionaryRelays, type ConceptViewKey } from "@/config/dictionary";
import config from "@/config/dictionary.config.json";
import { useConceptItems } from "@/hooks/useConceptItems";
import { useDictionary } from "@/hooks/useDictionary";
import type { ListKindSearch } from "@/hooks/useListKinds";
import { presentItem, type ItemPresentation } from "@/lib/itemPresentation";
import { matchListItems, wordsToFind } from "@/lib/listSearch";
import { openingStatus, parseOpeningHours } from "@/lib/openingHours";
import { categoryWords, placeLocalMinutes } from "@/lib/placeLinks";
import { eventPath } from "@/lib/shareId";
import { tierThreePresentation } from "@/components/items/itemViews";
import { placeOf, type Place } from "@/components/items/PlaceView";
import { PlacesMap } from "@/components/items/PlacesMap";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };

/** One item as search shows it: how its card reads it, where it opens, and for a place, the place. */
export interface KindHit {
  id: string;
  href: string;
  shown: ItemPresentation;
  place: Place | null;
}

/**
 * The items of a kind the words find, best first, read as their cards read
 * them. With no words to find, `browse` gives the list itself, in its order.
 */
function useKindHits(
  view: ConceptViewKey,
  query: string,
  max: number,
  { browse = false }: { browse?: boolean } = {},
): { hits: KindHit[]; pending: boolean } {
  const dictionary = useDictionary(true, { anonymous: true });
  const entry = (dictionary.data ?? []).find((e) => e.resolved && conceptViewOf(e.communityCoordinate) === view);
  const resolved = entry?.resolved;
  const words = useMemo(() => (resolved ? wordsToFind(query, resolved.governing) : []), [query, resolved]);
  const items = useConceptItems(entry, !!entry && (browse || words.length > 0));
  const hits = useMemo(() => {
    if (!resolved || !items.data || (!browse && words.length === 0)) return [];
    const definition = resolved.governing;
    const read = (item: { tags: string[][] }) => tierThreePresentation(item, resolved, presentItem(item, definition));
    const found =
      words.length > 0
        ? matchListItems(items.data as Item[], definition, words, max, read)
        : (items.data as Item[]).filter((item) => read(item).title).slice(0, max);
    return found.map((item) => ({
      id: item.id,
      href: eventPath(item, dictionaryRelays()),
      shown: read(item),
      place: view === "place" ? placeOf(item, definition) : null,
    }));
  }, [resolved, items.data, words, max, view, browse]);
  return { hits, pending: dictionary.isPending || (!!entry && items.isPending) };
}

/** A preview's heading: the kind's name, as a section on the Top page, and the way to its own page. */
function Heading({ label, onSeeAll }: { label: string; onSeeAll?: () => void }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{label}</p>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          aria-label={`See all ${label.toLowerCase()}`}
          className="text-xs font-medium text-slate-500 transition-colors hover:text-brand-link dark:text-slate-400"
        >
          See all
        </button>
      )}
    </div>
  );
}

function BooksPreview({ query, onSeeAll }: { query: string; onSeeAll?: () => void }) {
  const { hits } = useKindHits("book", query, 6);
  if (hits.length === 0) return null;
  return (
    <section data-testid="kind-preview-books">
      <Heading label="Books" onSeeAll={onSeeAll} />
      <div className="flex gap-3 overflow-x-auto pb-1">
        {hits.map((h) => (
          <Link key={h.id} href={h.href} className="group w-24 shrink-0" data-testid="kind-preview-row">
            {h.shown.image ? (
              <img
                src={h.shown.image}
                alt=""
                loading="lazy"
                className="aspect-[2/3] w-full rounded-md object-cover shadow-sm ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-md"
              />
            ) : (
              <span className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-slate-800">
                <BookOpen className="h-6 w-6" />
              </span>
            )}
            <span className="mt-1.5 line-clamp-2 block text-xs font-semibold text-slate-900 group-hover:text-brand-link dark:text-slate-100">
              {h.shown.title}
            </span>
            {h.shown.summary && (
              <span className="line-clamp-1 block text-[11px] text-slate-500 dark:text-slate-400">
                {h.shown.summary}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Open or closed now, in the place's own time, and whether it takes Bitcoin. */
function PlaceFacts({ place }: { place: Place }) {
  const week = parseOpeningHours(place.hours);
  const lon = Number(place.lon);
  const open = week && Number.isFinite(lon) ? openingStatus(week, placeLocalMinutes(lon, new Date())).open : null;
  const bitcoin = place.bitcoin && place.bitcoin.trim().toLowerCase() !== "no";
  if (open == null && !bitcoin) return null;
  return (
    <span className="flex items-center gap-2 text-xs">
      {open != null && (
        <span
          className={open ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
        >
          {open ? "Open now" : "Closed"}
        </span>
      )}
      {bitcoin && (
        <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
          <Zap className="h-3 w-3" /> Bitcoin
        </span>
      )}
    </span>
  );
}

function PlacesPreview({ query, onSeeAll }: { query: string; onSeeAll?: () => void }) {
  const { hits } = useKindHits("place", query, 3);
  if (hits.length === 0) return null;
  const pins = hits
    .map((h) => ({ lat: Number(h.place?.lat), lon: Number(h.place?.lon), name: h.shown.title ?? "" }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
  return (
    <section data-testid="kind-preview-places">
      <Heading label="Places" onSeeAll={onSeeAll} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <ul className="space-y-2.5">
          {hits.map((h) => (
            <li key={h.id} className="flex gap-3" data-testid="kind-preview-row">
              {h.shown.image ? (
                <img src={h.shown.image} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <Store className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 space-y-0.5">
                <Link
                  href={h.href}
                  className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
                >
                  {h.shown.title}
                </Link>
                {h.shown.summary && (
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{h.shown.summary}</span>
                )}
                {h.place && <PlaceFacts place={h.place} />}
              </span>
            </li>
          ))}
        </ul>
        <PlacesMap pins={pins} className="hidden h-36 sm:block" />
      </div>
    </section>
  );
}

function GitHubPreview({ query, onSeeAll }: { query: string; onSeeAll?: () => void }) {
  const { hits } = useKindHits("github-account", query, 3);
  if (hits.length === 0) return null;
  return (
    <section data-testid="kind-preview-github">
      <Heading label="GitHub accounts" onSeeAll={onSeeAll} />
      <ul className="space-y-2">
        {hits.map((h) => (
          <li key={h.id} data-testid="kind-preview-row">
            <Link href={h.href} className="group flex items-center gap-3">
              {h.shown.image ? (
                <img src={h.shown.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <Github className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-brand-link dark:text-slate-100">
                  {h.shown.title}
                </span>
                {h.shown.summary && (
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{h.shown.summary}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Each kind's row in the search dropdown ───────────────────────────── */

/**
 * The best match for the words being typed, as one row: its picture (a
 * book's cover as a small portrait), its title, its line, and what it is.
 */
function suggestionFor(key: string, view: ConceptViewKey, what: string, Icon: typeof Store) {
  return function KindSuggestion({ query, onPick }: { query: string; onPick?: () => void }) {
    const { hits } = useKindHits(view, query, 1);
    const [h] = hits;
    if (!h) return null;
    const portrait = !!h.shown.image && h.shown.imageShape === "portrait";
    return (
      <Link
        href={h.href}
        onClick={onPick}
        className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 sm:px-4"
        data-testid={`kind-suggestion-${key}`}
      >
        {h.shown.image ? (
          <img
            src={h.shown.image}
            alt=""
            loading="lazy"
            className={`shrink-0 object-cover ${portrait ? "h-10 w-7 rounded" : view === "github-account" ? "h-8 w-8 rounded-full" : "h-8 w-8 rounded-lg"}`}
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {h.shown.title}
          </span>
          {h.shown.summary && (
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{h.shown.summary}</span>
          )}
        </span>
        <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {what}
        </span>
      </Link>
    );
  };
}

/* ── Each kind's own page ─────────────────────────────────────────────── */

const PAGE_MAX = 60;

function PageEmpty({ pending, label, query }: { pending: boolean; label: string; query: string }) {
  return (
    <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400" data-testid="kind-page-empty">
      {pending ? `Reading the ${label.toLowerCase()}…` : `No ${label.toLowerCase()} match “${query.trim()}”.`}
    </p>
  );
}

/** Books: a shelf, the way a bookshop shows them — covers first. */
function BooksPage({ query }: { query: string }) {
  const { hits, pending } = useKindHits("book", query, PAGE_MAX, { browse: true });
  if (hits.length === 0) return <PageEmpty pending={pending} label="Books" query={query} />;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 py-4 sm:grid-cols-4 lg:grid-cols-5" data-testid="kind-page-books">
      {hits.map((h) => (
        <Link key={h.id} href={h.href} className="group" data-testid="kind-page-item">
          {h.shown.image ? (
            <img
              src={h.shown.image}
              alt=""
              loading="lazy"
              className="aspect-[2/3] w-full rounded-md object-cover shadow-md ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-lg"
            />
          ) : (
            <span className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-gradient-to-br from-slate-100 to-slate-200 p-3 text-center text-sm font-semibold text-slate-600 shadow-md dark:from-slate-800 dark:to-slate-700 dark:text-slate-300">
              <BookOpen className="h-7 w-7" />
            </span>
          )}
          <span className="mt-2 line-clamp-2 block text-sm font-semibold text-slate-900 group-hover:text-brand-link dark:text-slate-100">
            {h.shown.title}
          </span>
          {h.shown.summary && (
            <span className="line-clamp-1 block text-xs text-slate-500 dark:text-slate-400">{h.shown.summary}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

type PlaceFilter = { category: string | null; openNow: boolean; bitcoin: boolean };

const isOpenNow = (place: Place | null) => {
  const week = parseOpeningHours(place?.hours ?? null);
  const lon = Number(place?.lon);
  return week && Number.isFinite(lon) ? openingStatus(week, placeLocalMinutes(lon, new Date())).open : false;
};
const takesBitcoin = (place: Place | null) => !!place?.bitcoin && place.bitcoin.trim().toLowerCase() !== "no";

/** Places: the list beside a map of their pins, with chips that narrow them — a map app's way. */
function PlacesPage({ query }: { query: string }) {
  const { hits, pending } = useKindHits("place", query, PAGE_MAX, { browse: true });
  const [filter, setFilter] = useState<PlaceFilter>({ category: null, openNow: false, bitcoin: false });
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hits) {
      const c = categoryWords(h.place?.category ?? null);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);
  }, [hits]);
  const shown = hits.filter(
    (h) =>
      (!filter.category || categoryWords(h.place?.category ?? null) === filter.category) &&
      (!filter.openNow || isOpenNow(h.place)) &&
      (!filter.bitcoin || takesBitcoin(h.place)),
  );
  if (hits.length === 0) return <PageEmpty pending={pending} label="Places" query={query} />;
  const pins = shown
    .map((h) => ({ lat: Number(h.place?.lat), lon: Number(h.place?.lon), name: h.shown.title ?? "" }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
  const chip = (label: string, on: boolean, toggle: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5 pb-3">
          {categories.map((c) =>
            chip(c, filter.category === c, () => setFilter((f) => ({ ...f, category: f.category === c ? null : c }))),
          )}
          {chip("Open now", filter.openNow, () => setFilter((f) => ({ ...f, openNow: !f.openNow })))}
          {chip("Accepts Bitcoin", filter.bitcoin, () => setFilter((f) => ({ ...f, bitcoin: !f.bitcoin })))}
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="kind-page-places">
          {shown.map((h) => (
            <li key={h.id} className="flex gap-3 py-3" data-testid="kind-page-item">
              {h.shown.image ? (
                <img src={h.shown.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <Store className="h-6 w-6" />
                </span>
              )}
              <span className="min-w-0 space-y-0.5">
                <Link
                  href={h.href}
                  className="block truncate font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
                >
                  {h.shown.title}
                </Link>
                {h.shown.summary && (
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{h.shown.summary}</span>
                )}
                {h.place && <PlaceFacts place={h.place} />}
              </span>
            </li>
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No places match these filters.</p>
        )}
      </div>
      <PlacesMap pins={pins} className="mt-4 h-72 lg:sticky lg:top-24 lg:mt-0 lg:h-[70vh]" />
    </div>
  );
}

/** GitHub accounts: a card for each — avatar, handle, what they do — and a way to their page. */
function GitHubPage({ query }: { query: string }) {
  const { hits, pending } = useKindHits("github-account", query, PAGE_MAX, { browse: true });
  if (hits.length === 0) return <PageEmpty pending={pending} label="GitHub accounts" query={query} />;
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-4" data-testid="kind-page-github">
      {hits.map((h) => (
        <article
          key={h.id}
          className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          data-testid="kind-page-item"
        >
          {h.shown.image ? (
            <img src={h.shown.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Github className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={h.href}
              className="block truncate text-base font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
            >
              {h.shown.title}
            </Link>
            {h.shown.summary && (
              <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{h.shown.summary}</p>
            )}
          </div>
          <Link
            href={h.href}
            className="shrink-0 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-hover"
          >
            View account
          </Link>
        </article>
      ))}
    </div>
  );
}

const views = config.views as Record<ConceptViewKey, string>;

/** The kinds, in the order the Top page shows them when the words name none of them. */
export const LIST_KINDS: readonly ListKindSearch[] = [
  {
    key: "places",
    label: "Places",
    group: "Out & about",
    community: views.place,
    Preview: PlacesPreview,
    Page: PlacesPage,
    Suggestion: suggestionFor("places", "place", "Place", Store),
  },
  {
    key: "books",
    label: "Books",
    group: "Read & listen",
    community: views.book,
    Preview: BooksPreview,
    Page: BooksPage,
    Suggestion: suggestionFor("books", "book", "Book", BookOpen),
  },
  {
    key: "github",
    label: "GitHub accounts",
    group: "Build",
    community: views["github-account"],
    Preview: GitHubPreview,
    Page: GitHubPage,
    Suggestion: suggestionFor("github", "github-account", "GitHub", Github),
  },
];
