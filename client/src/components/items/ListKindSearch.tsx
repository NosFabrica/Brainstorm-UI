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
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Github, MapPin as PinIcon, Store } from "lucide-react";
import { conceptViewOf, dictionaryRelays, type ConceptViewKey } from "@/config/dictionary";
import config from "@/config/dictionary.config.json";
import { useConceptItems } from "@/hooks/useConceptItems";
import { useDictionary } from "@/hooks/useDictionary";
import type { ListKindSearch } from "@/hooks/useListKinds";
import { presentItem, type ItemPresentation } from "@/lib/itemPresentation";
import { matchListItems, wordsToFind } from "@/lib/listSearch";
import { orderByTrust } from "@/lib/itemEngagement";
import { coordinateOf } from "@/lib/dlistFields";
import { collapseSameThing, tellApart } from "@/lib/sameThing";
import { recommendedLine, useTrustedRecommenders } from "@/hooks/useTrustedRecommenders";
import { usePlacesRatings } from "@/hooks/usePlaceReviews";
import { openingStatus, parseOpeningHours } from "@/lib/openingHours";
import { categoryWords, placeLocalMinutes } from "@/lib/placeLinks";
import { eventPath } from "@/lib/shareId";
import { tierThreePresentation } from "@/components/items/itemViews";
import { openingLine, placeOf, type Place } from "@/components/items/PlaceView";
import { pinsAreLocal, placesGroup, townNamed } from "@/lib/placeLocal";
import { PlacesMap, type MapPin } from "@/components/items/PlacesMap";
import { useQuery } from "@tanstack/react-query";
import { eventPins } from "@/lib/eventPins";
import { fetchTownEvents } from "@/services/townEvents";

type Item = { id: string; kind: number; pubkey: string; tags: string[][] };

/** One item as search shows it: how its card reads it, where it opens, and for a place, the place. */
export interface KindHit {
  id: string;
  /** Its address, which endorsements name it by. */
  address: string | null;
  /** It and its copies on the list (the same thing filed twice): their endorsements add up. */
  copies: { id: string; address: string | null }[];
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
  {
    browse = false,
    typing = false,
    titleOnly = false,
  }: { browse?: boolean; typing?: boolean; titleOnly?: boolean } = {},
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
        ? matchListItems(items.data as Item[], definition, words, max, read, { typing, titleOnly })
        : (items.data as Item[]).filter((item) => read(item).title).slice(0, max);
    const hits = found.map((item) => {
      const shown = read(item);
      return {
        id: item.id,
        address: coordinateOf(item),
        href: eventPath(item, dictionaryRelays()),
        shown,
        place: view === "place" ? placeOf(item, definition) : null,
        key: identityOf(view, item, shown),
      };
    });
    // The same thing filed twice is one result; its copies' endorsements add up (lib/sameThing).
    const addressOf = new Map(hits.map((h) => [h.id, h.address]));
    return collapseSameThing(hits, (h) => h.key).map(({ key: _key, copies, ...h }) => ({
      ...h,
      copies: copies.map((id) => ({ id, address: addressOf.get(id) ?? null })),
    }));
  }, [resolved, items.data, words, max, view, browse, typing, titleOnly]);
  return { hits, pending: dictionary.isPending || (!!entry && items.isPending) };
}

/**
 * What makes two items on a list the same thing: a GitHub account's handle,
 * a book's ISBN (else its title and author). Never a place: two places with
 * one name are two branches.
 */
function identityOf(view: ConceptViewKey, item: Item, shown: ItemPresentation): string | null {
  if (view === "github-account") return shown.title ? `gh:${shown.title.toLowerCase()}` : null;
  if (view === "book") {
    const isbn = item.tags.find((t) => t[0] === "isbn")?.[1]?.replace(/[^0-9xX]/g, "");
    if (isbn) return `isbn:${isbn}`;
    return shown.title ? `book:${shown.title.toLowerCase()}|${(shown.summary ?? "").toLowerCase()}` : null;
  }
  return null;
}

type PreviewProps = { query: string; slot: "lead" | "follow"; named: boolean; onSeeAll?: () => void };

/** Whether a preview renders in the slot it's offered: above People when the words ask for it, else below. */
const inSlot = (slot: PreviewProps["slot"], lead: boolean) => (slot === "lead") === lead;

/**
 * Whether the words ask for places on their own: a kind of place two or more
 * of the places are ("cafe", "bakery"), or a town several are in ("austin").
 * A word only in their names ("owl") is not.
 */
/** The group of places the words name (lib/placeLocal placesGroup): "Places in Austin", "Coffee places"; or null. */
function groupOfPlaces(query: string, hits: KindHit[]): string | null {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return placesGroup(
    words,
    hits.map((h) => ({
      locality: h.place?.locality ?? null,
      kinds: [h.place?.category, h.place?.cuisine].map((c) => categoryWords(c ?? null)).filter((k): k is string => !!k),
    })),
  );
}

/** Whether the words ask for places on their own: they name a town or a kind of place, not just a word in a name. */
const placesAsked = (query: string, hits: KindHit[]) => groupOfPlaces(query, hits) != null;

/** How many matches a preview orders by trust before it shows its few. */
const CANDIDATES = 60;

/**
 * The hits in trust's order — what more people the reader trusts recommend
 * first (hooks/useTrustedRecommenders) — and the line that says so.
 */
function useTrustOrdered(hits: KindHit[]) {
  const { countOf, who } = useTrustedRecommenders(hits.flatMap((h) => h.copies));
  const copiesOf = new Map(hits.map((h) => [h.id, h.copies.map((c) => c.id)]));
  const count = (id: string) => countOf(copiesOf.get(id) ?? [id]);
  return { ordered: orderByTrust(hits, count), lineOf: (id: string) => recommendedLine(count(id), who) };
}

function TrustLine({ text, className = "" }: { text: string | null; className?: string }) {
  if (!text) return null;
  return (
    <span className={`block truncate text-[11px] font-medium text-brand-deep dark:text-brand-link ${className}`}>
      {text}
    </span>
  );
}

/** A preview's heading: the kind's name, as a section on the Top page, and the way to its own page. */
function Heading({
  label,
  count,
  onSeeAll,
  noun = label.toLowerCase(),
}: {
  label: string;
  count: number;
  onSeeAll?: () => void;
  /** What See all says it shows: "places in Austin". */
  noun?: string;
}) {
  const many = count >= CANDIDATES ? `${count}+` : String(count);
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{label}</p>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          aria-label={`See all ${many} ${noun}`}
          className="text-xs font-medium text-slate-500 transition-colors hover:text-brand-link dark:text-slate-400"
        >
          See all {many}
        </button>
      )}
    </div>
  );
}

function BooksPreview({ query, slot, named, onSeeAll }: PreviewProps) {
  // On the Top page a book is found by its title: a name in a byline is not a search for the book.
  const { hits: found } = useKindHits("book", query, CANDIDATES, { titleOnly: true });
  const { ordered, lineOf } = useTrustOrdered(found);
  const hits = ordered.slice(0, 6);
  if (hits.length === 0 || !inSlot(slot, named)) return null;
  return (
    <section data-testid="kind-preview-books">
      <Heading label="Books" count={found.length} onSeeAll={onSeeAll} />
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
            <TrustLine text={lineOf(h.id)} />
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Open or closed, in the place's own time, said the way its page says it
 * (openingLine): open in green, closed quietly with when it opens. Nothing
 * about Bitcoin — every place on this list takes it.
 */
function OpeningLine({ place }: { place: Place }) {
  const line = openingLine(place, new Date());
  if (!line) return null;
  return (
    <span
      className={`block truncate text-xs ${line.open ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}
    >
      {line.text}
    </span>
  );
}

/**
 * One place in a list: its number, which its pin on the map wears too; its
 * photo when it has one (no stand-in when it hasn't); its name, what and
 * where, open or closed, and who recommends it.
 */
function PlaceRow({
  hit,
  n,
  trust,
  testId,
  big = false,
  highlighted = false,
  onPoint,
  rating = null,
  line = hit.shown.summary ?? "",
}: {
  hit: KindHit;
  n: number;
  trust: string | null;
  testId: string;
  big?: boolean;
  /** Its pin is the one pointed at or tapped. */
  highlighted?: boolean;
  /** Pointed at, or no longer: lights its pin. */
  onPoint?: (on: boolean) => void;
  /** Its rating through the reader's lens: "★ 4.5 · 2 reviews". */
  rating?: string | null;
  /** Its line when the list tells it apart from a branch (lib/sameThing tellApart); its own otherwise. */
  line?: string;
}) {
  return (
    <li
      id={onPoint ? `place-row-${n}` : undefined}
      className={`flex items-start gap-3 rounded-lg transition-colors ${big ? "-mx-2 px-2 py-3" : ""} ${highlighted ? "bg-brand-primary/5 dark:bg-brand-primary/10" : ""}`}
      data-testid={testId}
      data-highlighted={highlighted ? "true" : undefined}
      onMouseEnter={onPoint ? () => onPoint(true) : undefined}
      onMouseLeave={onPoint ? () => onPoint(false) : undefined}
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white"
        data-testid="kind-row-number"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <Link
          href={hit.href}
          className={`block truncate font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100 ${big ? "" : "text-sm"}`}
        >
          {hit.shown.title}
        </Link>
        {line && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{line}</span>}
        {rating && (
          <span className="block text-xs font-medium text-amber-700 dark:text-amber-400" data-testid="place-row-rating">
            {rating}
          </span>
        )}
        {hit.place && <OpeningLine place={hit.place} />}
        <TrustLine text={trust} />
      </span>
      {hit.shown.image && (
        <img
          src={hit.shown.image}
          alt=""
          loading="lazy"
          className={`shrink-0 rounded-lg object-cover ${big ? "h-16 w-16" : "h-12 w-12"}`}
        />
      )}
    </li>
  );
}

/**
 * Places in their rating's order — through the reader's lens, damped so one
 * review doesn't top the list (hooks/usePlacesRatings, the contract's
 * section 8) — after trust's order among equals; and the line each shows.
 */
function useRatedPlaces(hits: KindHit[]) {
  const { ordered, lineOf } = useTrustOrdered(hits);
  const addresses = hits.map((h) => h.address).filter((a): a is string => !!a);
  const curator = addresses[0]?.split(":")[1] ?? null;
  const ratingOf = usePlacesRatings(addresses, curator);
  const scoreOf = (h: KindHit) => (h.address ? ratingOf(h.address).score : 0);
  const rated = ordered
    .map((h, i) => ({ h, i, score: scoreOf(h) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.h);
  const ratingLine = (h: KindHit): string | null => {
    if (!h.address) return null;
    const r = ratingOf(h.address);
    if (r.count === 0) return null;
    const reviews = `${r.count} ${r.count === 1 ? "review" : "reviews"}`;
    return r.value != null ? `★ ${r.value.toFixed(1)} · ${reviews}` : reviews;
  };
  return { rated, lineOf, ratingLine };
}

/** Each place's line, with its street where two branches would otherwise read the same. */
const linesOf = (hits: KindHit[]) =>
  tellApart(
    hits.map((h) => ({ title: h.shown.title ?? "", line: h.shown.summary ?? "", street: h.place?.address ?? null })),
  );

/**
 * A town's upcoming events that say where they are and sit near its places,
 * as map pins (lib/eventPins); none when the words name no town.
 */
function useTownEventPins(town: string | null, placePins: { lat: number; lon: number }[]): MapPin[] {
  const events = useQuery({
    queryKey: ["town-events", town],
    queryFn: () => fetchTownEvents(town!),
    enabled: !!town,
    staleTime: 5 * 60_000,
  });
  if (!town || !events.data) return [];
  return eventPins(events.data, Math.floor(Date.now() / 1000))
    .filter((e) => pinsAreLocal([...placePins, e]))
    .slice(0, 10)
    .map((e) => ({ lat: e.lat, lon: e.lon, name: e.name, kind: "event" as const }));
}

/** The places' pins, each wearing its row's number; none for a place with no coordinates. */
function pinsOf(hits: KindHit[]) {
  return hits
    .map((h, i) => ({
      lat: Number(h.place?.lat),
      lon: Number(h.place?.lon),
      name: h.shown.title ?? "",
      label: String(i + 1),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
}

function PlacesPreview({ query, slot, named, onSeeAll }: PreviewProps) {
  const { hits: found } = useKindHits("place", query, CANDIDATES);
  const { rated, lineOf, ratingLine } = useRatedPlaces(found);
  const hits = rated.slice(0, 3);
  const lines = linesOf(hits);
  // A town the words name is said: "Places in Austin".
  const town = townNamed(
    query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
    found.map((h) => ({ locality: h.place?.locality ?? null })),
  );
  const pins = pinsOf(hits);
  // A map of places a continent apart says nothing: the list stands alone.
  const map = pinsAreLocal(pins);
  // A town's upcoming events near its places share the map, in their own style (lib/eventPins).
  const events = useTownEventPins(map ? town : null, pins);
  if (hits.length === 0 || !inSlot(slot, named || placesAsked(query, found))) return null;
  return (
    <section data-testid="kind-preview-places">
      <Heading
        label={town ? `Places in ${town}` : "Places"}
        noun={town ? `places in ${town}` : "places"}
        count={found.length}
        onSeeAll={onSeeAll}
      />
      <div className={`grid gap-3 ${map ? "sm:grid-cols-[minmax(0,1fr)_200px]" : ""}`}>
        <ul className="space-y-3">
          {hits.map((h, i) => (
            <PlaceRow
              key={h.id}
              hit={h}
              n={i + 1}
              trust={lineOf(h.id)}
              rating={ratingLine(h)}
              line={lines[i]}
              testId="kind-preview-row"
            />
          ))}
        </ul>
        {map && (
          <div className="hidden space-y-1 sm:block">
            <PlacesMap pins={[...pins, ...events]} className="h-40" />
            {events.length > 0 && (
              <p
                className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400"
                data-testid="places-map-key"
              >
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-brand-primary" /> Places
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rotate-45 rounded-[2px] bg-cyan-400" /> Events
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function GitHubPreview({ query, slot, named, onSeeAll }: PreviewProps) {
  const { hits: found } = useKindHits("github-account", query, CANDIDATES);
  const { ordered, lineOf } = useTrustOrdered(found);
  const hits = ordered.slice(0, 3);
  if (hits.length === 0 || !inSlot(slot, named)) return null;
  return (
    <section data-testid="kind-preview-github">
      <Heading label="GitHub accounts" count={found.length} onSeeAll={onSeeAll} />
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
                <TrustLine text={lineOf(h.id)} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Reading a kind's list ahead of a search ──────────────────────────── */

/** How long the page is left to settle before a list is read, when the browser can't say it's idle. */
const WARM_AFTER_MS = 2000;

/**
 * Reads a kind's list once the search page is idle, so the first search's
 * previews come with People rather than after them. Draws nothing.
 */
function warmFor(view: ConceptViewKey) {
  return function Warm() {
    const [idle, setIdle] = useState(false);
    useEffect(() => {
      const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback;
      if (ric) {
        const id = ric(() => setIdle(true), { timeout: WARM_AFTER_MS * 2 });
        return () => (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      }
      const t = window.setTimeout(() => setIdle(true), WARM_AFTER_MS);
      return () => window.clearTimeout(t);
    }, []);
    const dictionary = useDictionary(idle, { anonymous: true });
    const entry = (dictionary.data ?? []).find((e) => e.resolved && conceptViewOf(e.communityCoordinate) === view);
    useConceptItems(entry, idle && !!entry);
    return null;
  };
}

/* ── Each kind's row in the search dropdown ───────────────────────────── */

/**
 * A kind's row in the search dropdown, for the words being typed. When the
 * words name a group of places (a town, a kind of place), the group, counted,
 * opening the Places page for them: "Coffee places · 60+". Otherwise the thing
 * whose name the words match — a book by its title, never by its author's name
 * in the byline — or nothing.
 */
function suggestionFor(
  key: string,
  view: ConceptViewKey,
  what: string,
  Icon: typeof Store,
  { byName = false, groups = false }: { byName?: boolean; groups?: boolean } = {},
) {
  return function KindSuggestion({
    query,
    slot,
    onPick,
  }: {
    query: string;
    slot: "lead" | "follow";
    onPick?: () => void;
  }) {
    const { hits: all } = useKindHits(view, query, CANDIDATES, { typing: true });
    const { hits: named } = useKindHits(view, query, 1, { typing: true, titleOnly: true });
    const group = groups ? groupOfPlaces(query, all) : null;
    // A group leads, above the people; a single thing follows them.
    if (group && slot !== "lead") return null;
    if (group) {
      const count = all.length >= CANDIDATES ? `${all.length}+` : String(all.length);
      return (
        <Link
          href={`/?q=${encodeURIComponent(query.trim())}&t=${key}`}
          onClick={onPick}
          className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 sm:px-4"
          data-testid={`kind-suggestion-${key}-group`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center text-brand-primary">
            <PinIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {group} <span className="font-normal text-slate-500 dark:text-slate-400">· {count}</span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-brand-link">See all →</span>
        </Link>
      );
    }
    const h = (byName ? named : all)[0];
    if (!h || slot !== "follow") return null;
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
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 dark:text-slate-500"
            data-testid="kind-suggestion-pin"
          >
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
  const { hits: found, pending } = useKindHits("book", query, PAGE_MAX, { browse: true });
  const { ordered: hits, lineOf } = useTrustOrdered(found);
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
          <TrustLine text={lineOf(h.id)} />
        </Link>
      ))}
    </div>
  );
}

type PlaceFilter = { category: string | null; openNow: boolean };

const isOpenNow = (place: Place | null) => {
  const week = parseOpeningHours(place?.hours ?? null);
  const lon = Number(place?.lon);
  return week && Number.isFinite(lon) ? openingStatus(week, placeLocalMinutes(lon, new Date())).open : false;
};

/** Places: the list beside a map of their pins, with chips that narrow them — a map app's way. */
function PlacesPage({ query }: { query: string }) {
  const { hits: found, pending } = useKindHits("place", query, PAGE_MAX, { browse: true });
  const { rated: hits, lineOf, ratingLine } = useRatedPlaces(found);
  const [filter, setFilter] = useState<PlaceFilter>({ category: null, openNow: false });
  // The place pointed at in the list, or tapped on the map: its row and its pin light together.
  const [lit, setLit] = useState<string | null>(null);
  const tapPin = (label: string) => {
    setLit(label);
    document.getElementById(`place-row-${label}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hits) {
      const c = categoryWords(h.place?.category ?? null);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [hits]);
  const shown = hits.filter(
    (h) =>
      (!filter.category || categoryWords(h.place?.category ?? null) === filter.category) &&
      (!filter.openNow || isOpenNow(h.place)),
  );
  if (hits.length === 0) return <PageEmpty pending={pending} label="Places" query={query} />;
  const lines = linesOf(shown);
  const pins = pinsOf(shown);
  const map = pinsAreLocal(pins);
  const chip = (label: string, on: boolean, toggle: () => void, count?: number) => (
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
      {count != null && (
        <>
          {" "}
          <span className={on ? "text-white/80" : "text-slate-400"}>{count}</span>
        </>
      )}
    </button>
  );
  return (
    <div
      className={`py-4 ${map ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6" : "mx-auto max-w-2xl"}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5 pb-3">
          {categories.map(([c, n]) =>
            chip(
              c,
              filter.category === c,
              () => setFilter((f) => ({ ...f, category: f.category === c ? null : c })),
              n,
            ),
          )}
          {chip("Open now", filter.openNow, () => setFilter((f) => ({ ...f, openNow: !f.openNow })))}
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="kind-page-places">
          {shown.map((h, i) => (
            <PlaceRow
              key={h.id}
              hit={h}
              n={i + 1}
              trust={lineOf(h.id)}
              rating={ratingLine(h)}
              line={lines[i]}
              testId="kind-page-item"
              big
              highlighted={lit === String(i + 1)}
              onPoint={(on) => setLit(on ? String(i + 1) : null)}
            />
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No places match these filters.</p>
        )}
      </div>
      {map && (
        <PlacesMap
          pins={pins}
          highlight={lit}
          onPin={tapPin}
          className="mt-4 h-72 lg:sticky lg:top-24 lg:mt-0 lg:h-[70vh]"
        />
      )}
    </div>
  );
}

/** GitHub accounts: a card for each — avatar, handle, what they do — and a way to their page. */
function GitHubPage({ query }: { query: string }) {
  const { hits: found, pending } = useKindHits("github-account", query, PAGE_MAX, { browse: true });
  const { ordered: hits, lineOf } = useTrustOrdered(found);
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
            <TrustLine text={lineOf(h.id)} className="mt-0.5" />
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
    Warm: warmFor("place"),
    Suggestion: suggestionFor("places", "place", "Place", PinIcon, { byName: true, groups: true }),
  },
  {
    key: "books",
    label: "Books",
    group: "Read & listen",
    community: views.book,
    Preview: BooksPreview,
    Page: BooksPage,
    Warm: warmFor("book"),
    Suggestion: suggestionFor("books", "book", "Book", BookOpen, { byName: true }),
  },
  {
    key: "github",
    label: "GitHub accounts",
    group: "Build",
    community: views["github-account"],
    Preview: GitHubPreview,
    Page: GitHubPage,
    Warm: warmFor("github-account"),
    Suggestion: suggestionFor("github", "github-account", "GitHub", Github),
  },
];
