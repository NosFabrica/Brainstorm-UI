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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LocationExplainer } from "@/components/search/LocationExplainer";
import { locate, LocateError, nearestArea, type Position } from "@/lib/nearMe";
import { distanceKm, distanceWords } from "@/lib/placeDistance";
import { Link } from "wouter";
import type { SearchTab } from "@/services/search";
import {
  ArrowRight,
  BookOpen,
  Github,
  Globe,
  List,
  Map as MapIcon,
  MapPin as PinIcon,
  Navigation,
  Phone,
  Search,
  Store,
  X,
  ChevronDown,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { conceptViewOf, dictionaryRelays, type ConceptViewKey } from "@/config/dictionary";
import config from "@/config/dictionary.config.json";
import { useConceptItems, useConceptMatches } from "@/hooks/useConceptItems";
import { useSearchPriority } from "@/hooks/useSearchPriority";
import { useDictionary } from "@/hooks/useDictionary";
import type { ListKindSearch, PreviewSlot } from "@/hooks/useListKinds";
import { presentItem, type ItemPresentation } from "@/lib/itemPresentation";
import { coversTitle, matchListItems, wordsToFind } from "@/lib/listSearch";
import { orderByTrust } from "@/lib/itemEngagement";
import { collapseSameThing, tellApart } from "@/lib/sameThing";
import { recommendedLine, useTrustedRecommenders } from "@/hooks/useTrustedRecommenders";
import { usePlacesRatings } from "@/hooks/usePlaceReviews";
import { openingStatus, parseOpeningHours } from "@/lib/openingHours";
import { categoryWords, directionsUrl, placeLocalMinutes } from "@/lib/placeLinks";
import { contactHref } from "@/lib/contactHref";
import { coordinateOf, httpUrl } from "@/lib/dlistFields";
import { eventPath } from "@/lib/shareId";
import { tierThreePresentation } from "@/components/items/itemViews";
import { openingLine, placeOf, type Place } from "@/components/items/PlaceView";
import { pinsAreLocal, placesGroup, townNamed } from "@/lib/placeLocal";
import { PlacesMap, type MapPin, type MapView } from "@/components/items/PlacesMap";
import { useQuery } from "@tanstack/react-query";
import { eventPins } from "@/lib/eventPins";
import { ownsGitHub, type GitHubEvidence } from "@/lib/githubLink";
import { useGitHubEvidence } from "@/hooks/useGitHubEvidence";
import { useVerifiedPeople } from "@/hooks/useVerifiedPeople";
import { formatEventDate, parseCalendarEvent } from "@/lib/calendarEvent";
import { fetchAreaEvents, fetchTownEvents } from "@/services/townEvents";
import { cellsCovering } from "@/lib/geohash";

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
 * The words are found in the whole list: the page reads the list's first 500
 * items, and the search relay is asked for the rest of the list's items that
 * have the words (hooks/useConceptItems `useConceptMatches`) — on the Top page
 * once its own results have answered (hooks/useSearchPriority), and never for
 * a word still being typed. Both are matched the same way (lib/listSearch).
 */
function useKindHits(
  view: ConceptViewKey,
  query: string,
  max: number,
  {
    browse = false,
    typing = false,
    titleOnly = false,
    within = null,
  }: {
    browse?: boolean;
    typing?: boolean;
    titleOnly?: boolean;
    /** Places inside this area only, kept before anything is matched or counted (Search this area). */
    within?: MapView | null;
  } = {},
): { hits: KindHit[]; pending: boolean } {
  const dictionary = useDictionary(true, { anonymous: true });
  const entry = (dictionary.data ?? []).find((e) => e.resolved && conceptViewOf(e.communityCoordinate) === view);
  const resolved = entry?.resolved;
  const words = useMemo(() => (resolved ? wordsToFind(query, resolved.governing) : []), [query, resolved]);
  const items = useConceptItems(entry, !!entry && (browse || words.length > 0));
  const priority = useSearchPriority();
  const asksRelay = !!entry && words.length > 0 && !typing && priority;
  const matches = useConceptMatches(entry, words, asksRelay);
  const hits = useMemo(() => {
    if (!resolved || !items.data || (!browse && words.length === 0)) return [];
    const definition = resolved.governing;
    const read = (item: { tags: string[][] }) => tierThreePresentation(item, resolved, presentItem(item, definition));
    // The relay's matches first, then what the page read and they don't repeat (by address).
    const loaded = items.data as Item[];
    const extra = (matches.data ?? []) as Item[];
    const seen = new Set(extra.map((item) => coordinateOf(item) ?? item.id));
    const all = extra.length
      ? [...extra, ...loaded.filter((item) => !seen.has(coordinateOf(item) ?? item.id))]
      : loaded;
    const pool = within ? all.filter((item) => inView(placeOf(item, definition), within)) : all;
    const found =
      words.length > 0
        ? matchListItems(pool, definition, words, max, read, { typing, titleOnly })
        : pool.filter((item) => read(item).title).slice(0, max);
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
  }, [resolved, items.data, matches.data, words, max, view, browse, typing, titleOnly, within]);
  return {
    hits,
    pending: dictionary.isPending || (!!entry && items.isPending) || (asksRelay && matches.isPending),
  };
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

type PreviewProps = { query: string; slot: PreviewSlot; named: boolean; onSeeAll?: () => void };

/** Whether a preview renders in the slot it's offered: above People when the words ask for it, else below. */
/** Above People when the words ask for the kind, else right after them; never the low slot. */

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

/**
 * A town's places at the head of the side panel on a desktop (ListKindSearch.Panel): a still map
 * of them and the town's events, which opens the Places page, then the top three and See all.
 */
function PlacesPanel({ query, onSeeAll }: { query: string; onSeeAll?: () => void }) {
  const narrow = useIsMobile(1024);
  const { hits: found } = useKindHits("place", query, CANDIDATES);
  const { rated, lineOf, ratingLine } = useRatedPlaces(found);
  const hits = rated.slice(0, 3);
  const lines = linesOf(hits);
  const town = townNamed(
    query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
    found.map((h) => ({ locality: h.place?.locality ?? null })),
  );
  const pins = pinsOf(hits);
  const map = pinsAreLocal(pins);
  const events = useTownEventPins(map && !narrow ? town : null, pins);
  if (narrow || !town || hits.length === 0) return null;
  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-100 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/80"
      data-testid="panel-places"
    >
      {map && <PlacesMap pins={[...pins, ...events]} className="h-36 rounded-none border-0" onOpen={onSeeAll} />}
      <div className="p-4 sm:p-5">
        <Heading label={`Places in ${town}`} noun={`places in ${town}`} count={found.length} onSeeAll={onSeeAll} />
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
      </div>
    </section>
  );
}

/**
 * A person's own GitHub account, as a mark beside their name (ListKindSearch.PersonMark): a listed
 * account they're proven to own (lib/githubLink) — their npub on its GitHub profile, its website
 * their verified handle's domain, a gist proving their claim, or their verified root handle on the
 * domain named for it. It opens the account's page, with who recommends it.
 */
function GitHubMark({
  pubkey,
  nip05,
  website,
  inRow = false,
}: {
  pubkey: string;
  nip05?: string;
  website?: string;
  inRow?: boolean;
}) {
  const { hits } = useKindHits("github-account", "", OWNED_MAX, { browse: true });
  const handles = hits.map((h) => h.shown.title ?? "").filter(Boolean);
  const evidence = useGitHubEvidence(handles);
  const verified = useVerifiedPeople(useMemo(() => [{ pubkey, nip05 }], [pubkey, nip05])).verified.has(pubkey);
  const hit = hits.find((h) => {
    const handle = h.shown.title ?? "";
    const e = evidence.get(handle.toLowerCase()) ?? NO_EVIDENCE;
    return handle && ownsGitHub(e, handle, { pubkey, nip05, website }, verified);
  });
  const handle = hit?.shown.title;
  if (!hit || !handle) return null;
  return (
    <Link
      href={hit.href}
      aria-label={`${handle} on GitHub`}
      title={`${handle} on GitHub`}
      tabIndex={inRow ? -1 : undefined}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex shrink-0 items-center text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      data-testid="person-github"
    >
      <Github className={inRow ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
    </Link>
  );
}

const NO_EVIDENCE: GitHubEvidence = { checked: false, named: [], blogHost: null, claimants: [], provenClaimants: [] };

const NO_PEOPLE: readonly { pubkey: string; nip05?: string; website?: string }[] = [];

/** Every listed account a person's handle could own: the GitHub list is short. */
const OWNED_MAX = 500;

function BooksPreview({ query, slot, named, onSeeAll }: PreviewProps) {
  // On the Top page a book is found by its title: a name in a byline is not a search for the book.
  const { hits: found } = useKindHits("book", query, CANDIDATES, { titleOnly: true });
  const { ordered, lineOf } = useTrustOrdered(found);
  const hits = ordered.slice(0, 6);
  // Above People when the words name Books; right after them when they're most of a title; low on
  // the page, by Media, when they only share a word with titles ("west") — that search is for people
  // and news named West first.
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const wanted: PreviewSlot = named
    ? "lead"
    : found.some((h) => coversTitle(words, h.shown.title ?? ""))
      ? "follow"
      : "late";
  if (hits.length === 0 || slot !== wanted) return null;
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
 * A place's ways there, as on its own page: directions the way the device
 * prefers, a call, its website — each only when the place has it.
 */
function PlaceActions({ place }: { place: Place }) {
  const links = [
    { label: "Directions", href: directionsUrl(place), Icon: Navigation, out: true },
    { label: "Call", href: contactHref(place.phone), Icon: Phone, out: false },
    { label: "Website", href: httpUrl(place.website), Icon: Globe, out: true },
  ].filter((l): l is typeof l & { href: string } => !!l.href);
  if (links.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5 pt-1.5">
      {links.map(({ label, href, Icon, out }) => (
        <a
          key={label}
          href={href}
          {...(out ? { target: "_blank", rel: "noreferrer" } : {})}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </a>
      ))}
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
  actions = false,
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
  /** Its ways there under it: Directions, Call, Website (the Places page's rows). */
  actions?: boolean;
}) {
  // Its price as the place's page says it: "$$" for a price range of 2.
  const price = "$".repeat(Math.min(4, Number(hit.place?.priceRange) || 0)) || null;
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
        {(rating || price) && (
          <span className="block text-xs">
            {rating && (
              <span className="font-medium text-amber-700 dark:text-amber-400" data-testid="place-row-rating">
                {rating}
              </span>
            )}
            {rating && price && <span className="text-slate-400"> · </span>}
            {price && (
              <span className="text-slate-500 dark:text-slate-400" data-testid="place-row-price">
                {price}
              </span>
            )}
          </span>
        )}
        {hit.place && <OpeningLine place={hit.place} />}
        <TrustLine text={trust} />
        {actions && hit.place && <PlaceActions place={hit.place} />}
      </span>
      {hit.shown.image && (
        <img
          src={hit.shown.image}
          alt=""
          loading="lazy"
          className={`shrink-0 rounded-lg object-cover ${big ? "h-20 w-20" : "h-12 w-12"}`}
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
  /** Its stars alone, undamped: what "Top rated" sorts by. */
  const starsOf = (h: KindHit): number => (h.address ? (ratingOf(h.address).value ?? 0) : 0);
  return { rated, lineOf, ratingLine, starsOf };
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
function useTownEventPins(
  town: string | null,
  placePins: { lat: number; lon: number }[],
  /** A searched area: its events instead, asked for by its cells and the town (fetchAreaEvents). */
  area: MapView | null = null,
): TownEventPin[] {
  const events = useQuery({
    queryKey: area ? ["area-events", area, town] : ["town-events", town],
    queryFn: () => (area ? fetchAreaEvents(cellsCovering(area), town) : fetchTownEvents(town!)),
    enabled: !!area || !!town,
    staleTime: 5 * 60_000,
  });
  if ((!area && !town) || !events.data) return [];
  const byId = new Map(events.data.map((ev) => [ev.id, ev]));
  return eventPins(events.data, Math.floor(Date.now() / 1000))
    .filter((e) =>
      area
        ? e.lat >= area.south && e.lat <= area.north && e.lon >= area.west && e.lon <= area.east
        : pinsAreLocal([...placePins, e]),
    )
    .slice(0, 10)
    .map((e) => {
      const ev = byId.get(e.id)!;
      const { location, image } = parseCalendarEvent(ev);
      const when = formatEventDate(e.startSec, e.isDateOnly);
      return {
        lat: e.lat,
        lon: e.lon,
        name: e.name,
        kind: "event" as const,
        id: e.id,
        startSec: e.startSec,
        note: when,
        when,
        where: location || null,
        image: image || null,
        href: eventPath(ev),
      };
    });
}

/** A town's event on its map, with what its card says when its pin is tapped. */
type TownEventPin = MapPin & {
  id: string;
  startSec: number;
  when: string;
  where: string | null;
  image: string | null;
  href: string;
};

/**
 * An event tapped on the map: what it is, when and where, its picture when it
 * has one, and the way to its page — the event's counterpart to PlaceCard.
 */
function EventCard({
  event,
  className = "",
  onClose,
}: {
  event: TownEventPin;
  /** Where it sits — absolute over a map, relative in a column: its Close keys off it. */
  className?: string;
  onClose: () => void;
}) {
  const start = new Date(event.startSec * 1000);
  return (
    <article
      data-testid="event-picked"
      className={`flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {/* Its picture fills the card's height; with none, the day it's on, as a calendar shows it. */}
      {event.image ? (
        <img src={event.image} alt="" loading="lazy" className="w-24 shrink-0 self-stretch object-cover" />
      ) : (
        <span className="flex w-20 shrink-0 flex-col items-center justify-center bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
          <span className="text-[11px] font-semibold uppercase tracking-wide">
            {start.toLocaleDateString(undefined, { month: "short" })}
          </span>
          <span className="text-2xl font-bold leading-none">{start.getDate()}</span>
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1 p-3 pr-8">
        <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
          {event.when}
        </span>
        <Link
          href={event.href}
          className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 hover:text-brand-link dark:text-slate-100"
        >
          {event.name}
        </Link>
        <span className="flex items-center gap-2 pt-0.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">{event.where ?? ""}</span>
          <Link
            href={event.href}
            className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-brand-link hover:underline"
          >
            See event
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </span>
      </div>
      <CloseButton onClose={onClose} />
    </article>
  );
}

/** A card's Close, in its corner, the same on a place's card and an event's. */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute right-1.5 top-1.5 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
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
  const narrow = useIsMobile(1024);
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
  // A town's places lead the side panel on a desktop (PlacesPanel); here they'd say it twice.
  if (town && !narrow) return null;
  // Above People when the words ask for places (they name them, a town, a kind of place); right
  // after them when they're most of a place's name; low, by Media, when a name only shares a word
  // ("west" in Local Joe West) — as Books are placed.
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const wanted: PreviewSlot =
    named || placesAsked(query, found)
      ? "lead"
      : found.some((h) => coversTitle(words, h.shown.title ?? ""))
        ? "follow"
        : "late";
  if (hits.length === 0 || slot !== wanted) return null;
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
            <PlacesMap pins={[...pins, ...events]} className="h-40" onOpen={onSeeAll} />
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
  // An account the words don't name waits at the end of the page, with the other matches that
  // only share a word; a shown person who owns it carries it on their row (Suggestion `owned`).
  if (hits.length === 0 || slot !== (named ? "lead" : "late")) return null;
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
  {
    byName = false,
    groups = false,
    owned = false,
    mostOfTitle = false,
  }: {
    byName?: boolean;
    groups?: boolean;
    /** Its things are people's own accounts: one a person shown owns is left to their row. */
    owned?: boolean;
    /** Offered only when the words are most of its title (lib/listSearch coversTitle): a word it only shares isn't a search for it. */
    mostOfTitle?: boolean;
  } = {},
) {
  return function KindSuggestion({
    query,
    slot,
    onPick,
    people = [],
    onOffer,
  }: {
    query: string;
    slot: "lead" | "follow";
    onPick?: () => void;
    people?: readonly { pubkey: string; nip05?: string; website?: string }[];
    onOffer?: (offering: boolean) => void;
  }) {
    const { hits: all } = useKindHits(view, query, CANDIDATES, { typing: true });
    const { hits: named } = useKindHits(view, query, 1, { typing: true, titleOnly: true });
    const first = (byName ? named : all)[0];
    const firstHandle = owned ? (first?.shown.title ?? "") : "";
    const evidence = useGitHubEvidence(firstHandle ? [firstHandle] : []);
    const { verified } = useVerifiedPeople(owned ? people : NO_PEOPLE);
    const group = groups ? groupOfPlaces(query, all) : null;
    const row = ((): ReactNode => {
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
      if (
        mostOfTitle &&
        !coversTitle(
          query
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean),
          h.shown.title ?? "",
          true,
        )
      )
        return null;
      // Their own account is the person, already a row above: one person, one row — on proof only
      // (lib/githubLink); until then, and when it can't be checked, it keeps its own row.
      const e = evidence.get(firstHandle.toLowerCase()) ?? NO_EVIDENCE;
      if (firstHandle && people.some((p) => ownsGitHub(e, firstHandle, p, verified.has(p.pubkey)))) return null;
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
    })();
    // Whether there's a row: the box opens on one even when no person matches the words.
    const offering = row !== null;
    useEffect(() => {
      onOffer?.(offering);
    }, [offering, onOffer]);
    return row;
  };
}

/* ── Each kind's own page ─────────────────────────────────────────────── */

/** How many places "Near me" widens its box to hold, so a sparse map never shows nothing. */
const NEAR_ME_MIN_PLACES = 5;
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

/** How the Places page orders: rating and trust together (its own order), or stars alone. */
type PlaceSort = "best" | "rated";
const PLACE_SORTS: { value: PlaceSort; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "rated", label: "Top rated" },
];

/** Categories the lists file the same kind of place under: a chip for each would split one kind in two. */
const SAME_KIND: Record<string, string> = { coffee: "cafe", coffee_shop: "cafe" };

/** The kind of place a chip offers: its category, with those filed two ways said one way. */
const kindOfPlace = (place: Place | null): string | null => {
  const c = place?.category?.trim().toLowerCase();
  return categoryWords(c ? (SAME_KIND[c] ?? c) : null);
};

const isOpenNow = (place: Place | null) => {
  const week = parseOpeningHours(place?.hours ?? null);
  const lon = Number(place?.lon);
  return week && Number.isFinite(lon) ? openingStatus(week, placeLocalMinutes(lon, new Date())).open : false;
};

const inView = (place: Place | null, v: MapView) => {
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && lat >= v.south && lat <= v.north && lon >= v.west && lon <= v.east
  );
};

const sameView = (a: MapView | null, b: MapView | null) =>
  !!a && !!b && a.south === b.south && a.west === b.west && a.north === b.north && a.east === b.east;

/** The area in the link: `area=south,west,north,east`. */
function areaFromUrl(): MapView | null {
  try {
    const [south, west, north, east] = (new URLSearchParams(window.location.search).get("area") ?? "")
      .split(",")
      .map(Number);
    return [south, west, north, east].every(Number.isFinite) && north > south && east > west
      ? { south, west, north, east }
      : null;
  } catch {
    return null;
  }
}

/** A searched area becomes a step in history, so Back returns to the search before it. */
function writeAreaToUrl(v: MapView | null) {
  try {
    const url = new URL(window.location.href);
    if (v) url.searchParams.set("area", [v.south, v.west, v.north, v.east].map((n) => n.toFixed(4)).join(","));
    else url.searchParams.delete("area");
    // Commas stay commas: a link people share reads "area=30.2,-97.8,30.3,-97.7".
    window.history.pushState({}, "", url.pathname + url.search.replace(/%2C/gi, ","));
  } catch {
    /* the link is a convenience, never a blocker */
  }
}

/** Places: the list beside a map of their pins, with chips that narrow them — a map app's way. */
function PlacesPage({ query, onTabChange }: { query: string; onTabChange?: (tab: SearchTab) => void }) {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const { hits: townFound, pending } = useKindHits("place", query, PAGE_MAX, { browse: true });
  const town = townNamed(
    words,
    townFound.map((h) => ({ locality: h.place?.locality ?? null })),
  );
  // The area of the map searched (Search this area), kept in the link so Back, a refresh and a
  // shared link come back to it. Its search is the words without the town: the map says where.
  const [area, setAreaState] = useState<MapView | null>(areaFromUrl);
  // "Near me" (lib/nearMe): asked of the browser on the tap only; the box around the answer is
  // the area searched, said as "near you"; a refusal is said once. The explainer is a tap away.
  const [nearYou, setNearYou] = useState(false);
  // The events under the places: folded to a count until tapped, or until a diamond is.
  const [eventsOpen, setEventsOpen] = useState(false);
  const [you, setYou] = useState<Position | null>(null);
  const [nearNotice, setNearNotice] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);
  const canLocate = typeof navigator !== "undefined" && !!navigator.geolocation;
  useEffect(() => {
    if (!area) setNearYou(false);
  }, [area]);
  const nearMe = async () => {
    setNearNotice(null);
    try {
      const here = await locate();
      setYou(here);
      setNearYou(true);
      setArea(nearestArea(here, pinsOf(hits), { min: NEAR_ME_MIN_PLACES }));
    } catch (e) {
      const reason = e instanceof LocateError ? e.reason : "unavailable";
      setNearNotice(
        reason === "declined"
          ? "Location declined — the results stay as they were. You can allow it in your browser any time."
          : reason === "unsupported"
            ? "This browser can't share a location."
            : "Couldn't get a position just now.",
      );
    }
  };

  const [moved, setMoved] = useState<MapView | null>(null);
  // New words are a new search: the area went with the old ones (the link a search writes has none).
  const firstQuery = useRef(query);
  useEffect(() => {
    if (query === firstQuery.current) return;
    firstQuery.current = query;
    setAreaState(areaFromUrl());
    setMoved(null);
  }, [query]);
  useEffect(() => {
    const back = () => {
      setAreaState(areaFromUrl());
      setMoved(null);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const setArea = (next: MapView | null) => {
    writeAreaToUrl(next);
    setAreaState(next);
    setMoved(null);
    setPicked(null);
    setPickedEvent(null);
  };
  const townWords = new Set((town ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u));
  const areaWords = words.filter((w) => !townWords.has(w)).join(" ");
  // The words' places inside the area, however far down the list they sit.
  const { hits: areaFound } = useKindHits("place", area ? areaWords : "", area ? PAGE_MAX : 0, {
    browse: true,
    within: area,
  });
  const found = area ? areaFound : townFound;
  const { rated: hits, lineOf, ratingLine, starsOf } = useRatedPlaces(found);
  const [filter, setFilter] = useState<PlaceFilter>({ category: null, openNow: false });
  const [sort, setSort] = useState<PlaceSort>("best");
  // A filter or a sort frames its places afresh: the area the reader had moved to is gone.
  useEffect(() => setMoved(null), [filter.category, filter.openNow, sort]);
  // On a phone the list comes first and the map opens over it, full screen.
  const narrow = useIsMobile(1024);
  const [mapOpen, setMapOpen] = useState(false);
  // Closed, the map hands focus back to the button that opened it.
  const mapButton = useRef<HTMLButtonElement>(null);
  const mapWasOpen = useRef(false);
  useEffect(() => {
    if (!mapOpen && mapWasOpen.current) mapButton.current?.focus();
    mapWasOpen.current = mapOpen;
  }, [mapOpen]);
  // The place whose pin was tapped on a desktop: its card opens over the map.
  const [picked, setPicked] = useState<string | null>(null);
  // The event whose pin was tapped: its card, in place of a place's — one card at a time.
  const [pickedEvent, setPickedEvent] = useState<string | null>(null);
  // The place pointed at in the list, or tapped on the map: its row and its pin light together.
  const [lit, setLit] = useState<string | null>(null);
  const tapPin = (label: string) => {
    setLit(label);
    setPicked(shown[Number(label) - 1]?.id ?? null);
    setPickedEvent(null);
    document.getElementById(`place-row-${label}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  // The kinds of place that split the list: each of several places but not all of them, and
  // at least two such — a chip that leaves one place, or keeps every one, narrows nothing.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hits) {
      const c = kindOfPlace(h.place);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const splitting = [...counts.entries()]
      .filter(([, n]) => n >= 2 && n < hits.length)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return splitting.length >= 2 ? splitting : [];
  }, [hits]);
  const narrowed = hits.filter(
    (h) => (!filter.category || kindOfPlace(h.place) === filter.category) && (!filter.openNow || isOpenNow(h.place)),
  );
  // A stable sort: places that tie keep the page's own order.
  // Stars alone can only reorder once two places have them.
  const sortable = hits.filter((h) => starsOf(h) > 0).length >= 2;
  // Near you: nearest first, each row saying how far (lib/placeDistance).
  const distanceOf = (h: KindHit): number => {
    const lat = Number(h.place?.lat);
    const lon = Number(h.place?.lon);
    return you && Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)
      ? distanceKm(you, { lat, lon })
      : Number.POSITIVE_INFINITY;
  };
  const shown = you
    ? [...narrowed].sort((a, b) => distanceOf(a) - distanceOf(b))
    : sortable && sort === "rated"
      ? [...narrowed].sort((a, b) => starsOf(b) - starsOf(a))
      : narrowed;
  const distanceLine = (h: KindHit, line: string): string => {
    const d = distanceOf(h);
    return you && Number.isFinite(d) ? `${distanceWords(d)} · ${line}` : line;
  };
  const openCount = hits.filter((h) => isOpenNow(h.place)).length;
  const lines = linesOf(shown);
  const pins = pinsOf(shown);
  // The map is always there, as a map app's is: fitted to every place, a continent apart or one
  // town, so the reader can narrow it — Near me, or Search this area. An area searched keeps it,
  // places or none. The search's map, not the filters': one that leaves no place keeps it, so the
  // reader can undo the filter where they are (and the map isn't rebuilt when they do).
  const allPinsOfSearch = pinsOf(hits);
  const map = !!area || allPinsOfSearch.length > 0;
  // A town's upcoming events near its places share the map, as on the Top page's preview —
  // only when the places are one town's, not a continent's.
  const local = pinsAreLocal(allPinsOfSearch);
  const events = useTownEventPins(map && local ? town : null, pins, area);
  // Spread out, the summary says how far: the towns the places are in.
  const towns = new Set(hits.map((h) => h.place?.locality).filter(Boolean)).size;
  if (hits.length === 0 && !area) return <PageEmpty pending={pending} label="Places" query={query} />;
  const chip = (label: string, on: boolean, toggle: () => void, count?: number) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
  const filtering = filter.openNow || filter.category != null;
  const clearFilters = () => {
    setFilter({ category: null, openNow: false });
    if (area) setArea(null);
  };
  // Offered once the reader has moved the map somewhere other than the area it shows — at the
  // top right of the map, clear of a picked place's or event's card at the top left and of the
  // zoom controls lower down; on a phone, in the header's own flow under the chips, where
  // nothing covers it and no screen cuts it off.
  const searchHere = (place: "float" | "inline") =>
    moved &&
    !sameView(moved, area) && (
      <button
        type="button"
        onClick={() => {
          setNearYou(false);
          setArea(moved);
        }}
        className={`${place === "float" ? "absolute right-3 top-3 z-[600]" : "mt-1"} inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-link shadow-lg ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-700 dark:hover:bg-slate-800`}
      >
        <Search className="h-4 w-4" aria-hidden />
        Search this area
      </button>
    );
  const allPins = [...pins, ...events];
  // Gone when a filter leaves it out; where it now sits when the order changes.
  const pickedAt = picked ? shown.findIndex((h) => h.id === picked) : -1;
  const eventPicked = events.find((e) => e.id === pickedEvent) ?? null;
  const tapEvent = (id: string) => {
    setPickedEvent(id);
    setPicked(null);
    setEventsOpen(true);
  };
  const header = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100" data-testid="places-summary">
          {filtering && `${shown.length} of `}
          {hits.length >= PAGE_MAX ? `${PAGE_MAX}+` : hits.length} {hits.length === 1 ? "place" : "places"}
          {area
            ? nearYou
              ? " near you"
              : " in this area"
            : town
              ? ` in ${town}`
              : !local && towns > 1
                ? ` in ${towns} towns`
                : ""}
          {!filtering && openCount > 0 && (
            <span className="font-medium text-emerald-600 dark:text-emerald-400"> · {openCount} open now</span>
          )}
        </h2>
        {sortable && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as PlaceSort)}
              className="rounded-full border border-slate-200 bg-white py-1 pl-3 pr-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {PLACE_SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {/* One row that scrolls sideways on a phone, as a map app's chips do. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
        {canLocate && !(area && nearYou) && chip("Near me", false, () => void nearMe())}
        {area && chip(nearYou ? "Near you" : "In this area", true, () => setArea(null))}
        {/* Only when it narrows: none open would empty the list, all open would change nothing. */}
        {(filter.openNow || (openCount > 0 && openCount < hits.length)) &&
          chip("Open now", filter.openNow, () => setFilter((f) => ({ ...f, openNow: !f.openNow })), openCount)}
        {categories.map(([c, n]) =>
          chip(c, filter.category === c, () => setFilter((f) => ({ ...f, category: f.category === c ? null : c })), n),
        )}
        {filtering && (
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 px-2 py-1 text-xs font-medium text-brand-link hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      {nearNotice && (
        <p className="-mt-1 pb-2 text-xs text-slate-500 dark:text-slate-400" data-testid="near-me-notice">
          {nearNotice}
        </p>
      )}
      <p className="-mt-1 pb-2 text-[11px] text-slate-400 dark:text-slate-500">
        Near me · asked once, used for this search, not stored ·{" "}
        <button type="button" onClick={() => setExplain(true)} className="text-brand-link hover:underline">
          How do we know where you are?
        </button>
      </p>
      <LocationExplainer open={explain} onOpenChange={setExplain} />
    </>
  );
  return (
    // Wider than the results column on a desktop: the list beside a map that takes the rest of the screen.
    <div className={`py-4 ${map && !narrow ? "lg:relative lg:left-1/2 lg:w-[94vw] lg:-translate-x-1/2" : ""}`}>
      <div
        className={map && !narrow ? "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6" : "mx-auto max-w-2xl"}
      >
        <div className="min-w-0">
          {header}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="kind-page-places">
            {shown.map((h, i) => (
              <PlaceRow
                key={h.id}
                hit={h}
                n={i + 1}
                trust={lineOf(h.id)}
                rating={ratingLine(h)}
                line={distanceLine(h, lines[i])}
                testId="kind-page-item"
                big
                actions
                highlighted={lit === String(i + 1)}
                onPoint={(on) => setLit(on ? String(i + 1) : null)}
              />
            ))}
          </ul>
          {shown.length === 0 && (
            <div className="space-y-2 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <p>{area && !filtering ? "No places in this area." : "No places match these filters."}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Clear filters
              </button>
            </div>
          )}
          {events.length > 0 && (
            <section className="mt-4 border-t border-slate-100 pt-2 dark:border-slate-800" data-testid="places-events">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setEventsOpen((o) => !o)}
                  aria-expanded={eventsOpen}
                  className="inline-flex items-center gap-1.5 rounded-md py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${eventsOpen ? "" : "-rotate-90"}`}
                    aria-hidden
                  />
                  Happening near here
                  <span className="rounded-full bg-brand-accent/15 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-brand-deep dark:text-brand-link">
                    {events.length}
                  </span>
                </button>
                {eventsOpen &&
                  (onTabChange ? (
                    <button
                      type="button"
                      onClick={() => onTabChange("events")}
                      className="text-xs font-medium text-brand-link hover:underline"
                    >
                      See all events
                    </button>
                  ) : (
                    <Link
                      href={`/?q=${encodeURIComponent(query)}&t=events`}
                      className="text-xs font-medium text-brand-link hover:underline"
                    >
                      See all events
                    </Link>
                  ))}
              </div>
              {eventsOpen && (
                <ul className="mt-1 space-y-0.5">
                  {events.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => tapEvent(e.id)}
                        aria-current={pickedEvent === e.id ? "true" : undefined}
                        className={`flex w-full items-baseline gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 ${pickedEvent === e.id ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}
                      >
                        <span className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-brand-accent" aria-hidden />
                        <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                          {e.when}
                        </span>
                        <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">{e.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
        {map && !narrow && (
          <div>
            {/* Sized to the first screen below the site header, so it never slides under it, short list or long. */}
            <div className="sticky top-20 h-[calc(100dvh-11rem)] min-h-[24rem]">
              <PlacesMap
                pins={allPins}
                highlight={lit}
                onPin={tapPin}
                onEvent={tapEvent}
                onMoved={setMoved}
                view={area}
                controls
                className="h-full"
              />
              {/* At the foot of the map: an open card sits at its head. */}
              {searchHere("float")}
              {eventPicked && (
                <EventCard
                  event={eventPicked}
                  className="absolute left-3 top-3 z-[500] w-80 max-w-[calc(100%-11.5rem)]"
                  onClose={() => setPickedEvent(null)}
                />
              )}
              {pickedAt >= 0 && (
                <PlaceCard
                  hit={shown[pickedAt]}
                  n={pickedAt + 1}
                  line={lines[pickedAt]}
                  trust={lineOf(shown[pickedAt].id)}
                  rating={ratingLine(shown[pickedAt])}
                  lit
                  testId="place-picked"
                  className="absolute left-3 top-3 z-[500] w-80 max-w-[calc(100%-11.5rem)]"
                  onClose={() => setPicked(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
      {map && narrow && !mapOpen && (
        <button
          ref={mapButton}
          type="button"
          onClick={() => setMapOpen(true)}
          className="fixed bottom-[calc(var(--bs-bottom-chrome,0px)+1rem)] left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Map
        </button>
      )}
      {map && narrow && mapOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Map of places"
          onKeyDown={(e) => {
            if (e.key === "Escape") setMapOpen(false);
          }}
          className="fixed inset-x-0 bottom-[var(--bs-bottom-chrome,0px)] top-0 z-50 flex flex-col bg-white dark:bg-slate-950"
        >
          <div className="relative min-h-0 flex-1">
            <PlacesMap
              pins={allPins}
              highlight={lit}
              onEvent={tapEvent}
              onMoved={setMoved}
              view={area}
              controls
              onPin={(label) => {
                setLit(label);
                setPickedEvent(null);
                document
                  .getElementById(`place-card-${label}`)
                  ?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
              }}
              className="h-full rounded-none border-0"
            />
            <div className="absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-white via-white/90 to-white/0 px-4 pb-6 pt-4 dark:from-slate-950 dark:via-slate-950/90 dark:to-slate-950/0">
              {header}
              {searchHere("inline")}
            </div>
          </div>
          <div className="relative z-[500] -mt-48 space-y-2 pb-4">
            {eventPicked && (
              <div className="px-4">
                <EventCard event={eventPicked} className="relative" onClose={() => setPickedEvent(null)} />
              </div>
            )}
            <button
              // Focus moves into the map as it opens, onto the way back out.
              autoFocus
              type="button"
              onClick={() => setMapOpen(false)}
              className="mx-auto flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900"
            >
              <List className="h-4 w-4" aria-hidden />
              List
            </button>
            <PlaceCards hits={shown} lines={lines} lineOf={lineOf} ratingLine={ratingLine} lit={lit} onLit={setLit} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The places as a row of cards to swipe through, over the map on a phone: the
 * card in the middle lights its pin, and a tapped pin brings its card.
 */
function PlaceCards({
  hits,
  lines,
  lineOf,
  ratingLine,
  lit,
  onLit,
}: {
  hits: KindHit[];
  lines: string[];
  lineOf: (id: string) => string | null;
  ratingLine: (h: KindHit) => string | null;
  lit: string | null;
  onLit: (label: string | null) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const onLitRef = useRef(onLit);
  onLitRef.current = onLit;
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let settle: number | undefined;
    const onScroll = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const middle = el.scrollLeft + el.clientWidth / 2;
        let nearest: string | null = null;
        let gap = Infinity;
        for (const card of el.querySelectorAll<HTMLElement>("[data-label]")) {
          const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
          if (d < gap) [gap, nearest] = [d, card.dataset.label ?? null];
        }
        onLitRef.current(nearest);
      }, 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(settle);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);
  return (
    <div ref={track} className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {hits.map((h, i) => (
        <PlaceCard
          key={h.id}
          hit={h}
          n={i + 1}
          line={lines[i]}
          trust={lineOf(h.id)}
          rating={ratingLine(h)}
          lit={lit === String(i + 1)}
          testId="place-card"
          className="w-[80%] max-w-xs shrink-0 snap-center"
        />
      ))}
    </div>
  );
}

/**
 * One place as a card: its number, name, what and where, rating, hours, who
 * recommends it and its ways there — on a phone's swipe row, and over a
 * desktop's map for a tapped pin, with a way to close it there.
 */
function PlaceCard({
  hit: h,
  n,
  line,
  trust,
  rating,
  lit,
  testId,
  className = "",
  onClose,
}: {
  hit: KindHit;
  n: number;
  line: string;
  trust: string | null;
  rating: string | null;
  lit: boolean;
  testId: string;
  className?: string;
  onClose?: () => void;
}) {
  const label = String(n);
  return (
    <article
      id={onClose ? undefined : `place-card-${label}`}
      data-label={onClose ? undefined : label}
      data-testid={testId}
      data-highlighted={lit ? "true" : undefined}
      className={`rounded-2xl border bg-white p-3 transition-colors dark:bg-slate-900 ${
        // Open over the map it's one card, as an event's is; in the swipe row, the lit one stands out.
        onClose
          ? "border-slate-200 shadow-lg dark:border-slate-700"
          : lit
            ? "border-brand-primary shadow-md"
            : "border-slate-200 shadow-md dark:border-slate-800"
      } ${className}`}
    >
      <span className={`flex items-center gap-2 ${onClose ? "pr-6" : ""}`}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white">
          {label}
        </span>
        <Link
          href={h.href}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 hover:text-brand-link dark:text-slate-100"
        >
          {h.shown.title}
        </Link>
      </span>
      <span className="mt-1 block space-y-0.5">
        {line && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{line}</span>}
        {rating && <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">{rating}</span>}
        {h.place && <OpeningLine place={h.place} />}
        <TrustLine text={trust} />
      </span>
      {h.place && <PlaceActions place={h.place} />}
      {onClose && <CloseButton onClose={onClose} />}
    </article>
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
    Panel: PlacesPanel,
    Page: PlacesPage,
    Warm: warmFor("place"),
    Suggestion: suggestionFor("places", "place", "Place", PinIcon, { byName: true, groups: true, mostOfTitle: true }),
  },
  {
    key: "books",
    label: "Books",
    group: "Read & listen",
    community: views.book,
    Preview: BooksPreview,
    Page: BooksPage,
    Warm: warmFor("book"),
    Suggestion: suggestionFor("books", "book", "Book", BookOpen, { mostOfTitle: true, byName: true }),
  },
  {
    key: "github",
    label: "GitHub accounts",
    group: "Build",
    community: views["github-account"],
    Preview: GitHubPreview,
    Page: GitHubPage,
    Warm: warmFor("github-account"),
    Suggestion: suggestionFor("github", "github-account", "GitHub", Github, { owned: true }),
    PersonMark: GitHubMark,
  },
];
