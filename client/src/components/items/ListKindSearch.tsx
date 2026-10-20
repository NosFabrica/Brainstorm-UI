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
import { useMemo } from "react";
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
import { placeLocalMinutes } from "@/lib/placeLinks";
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

/** The items of a kind the words find, best first, read as their cards read them. */
function useKindHits(view: ConceptViewKey, query: string, max: number): KindHit[] {
  const dictionary = useDictionary(true, { anonymous: true });
  const entry = (dictionary.data ?? []).find((e) => e.resolved && conceptViewOf(e.communityCoordinate) === view);
  const resolved = entry?.resolved;
  const words = useMemo(() => (resolved ? wordsToFind(query, resolved.governing) : []), [query, resolved]);
  const items = useConceptItems(entry, !!entry && words.length > 0);
  return useMemo(() => {
    if (!resolved || !items.data || words.length === 0) return [];
    const definition = resolved.governing;
    const read = (item: { tags: string[][] }) => tierThreePresentation(item, resolved, presentItem(item, definition));
    return matchListItems(items.data as Item[], definition, words, max, read).map((item) => ({
      id: item.id,
      href: eventPath(item, dictionaryRelays()),
      shown: read(item),
      place: view === "place" ? placeOf(item, definition) : null,
    }));
  }, [resolved, items.data, words, max, view]);
}

/** A preview's heading: the kind's name, as a section on the Top page. */
function Heading({ label }: { label: string }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{label}</p>
  );
}

function BooksPreview({ query }: { query: string }) {
  const hits = useKindHits("book", query, 6);
  if (hits.length === 0) return null;
  return (
    <section data-testid="kind-preview-books">
      <Heading label="Books" />
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

function PlacesPreview({ query }: { query: string }) {
  const hits = useKindHits("place", query, 3);
  if (hits.length === 0) return null;
  const pins = hits
    .map((h) => ({ lat: Number(h.place?.lat), lon: Number(h.place?.lon), name: h.shown.title ?? "" }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
  return (
    <section data-testid="kind-preview-places">
      <Heading label="Places" />
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

function GitHubPreview({ query }: { query: string }) {
  const hits = useKindHits("github-account", query, 3);
  if (hits.length === 0) return null;
  return (
    <section data-testid="kind-preview-github">
      <Heading label="GitHub accounts" />
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

const views = config.views as Record<ConceptViewKey, string>;

/** The kinds, in the order the Top page shows them when the words name none of them. */
export const LIST_KINDS: readonly ListKindSearch[] = [
  { key: "places", label: "Places", community: views.place, Preview: PlacesPreview },
  { key: "books", label: "Books", community: views.book, Preview: BooksPreview },
  { key: "github", label: "GitHub accounts", community: views["github-account"], Preview: GitHubPreview },
];
