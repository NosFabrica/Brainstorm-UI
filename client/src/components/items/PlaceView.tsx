import { useState } from "react";
/**
 * A food and drink place on its own page (ADR 0007, tier three), the shape
 * a reader knows from Google Places or Yelp, in Brainstorm's own clothes:
 *
 * - One column on a phone: who it is, the ways out, the map, the details.
 *   Two from sm up, as Google's place panel sits beside its map: the facts on
 *   the left, the map on the right, sticky, with the website's own picture
 *   above it when the site gives one (through our link-preview origin). A
 *   logo beside the name from the site's favicon, else a mark for the kind of
 *   place.
 * - The name; what it is as words ("Fast food · Pizza"); where Google puts
 *   the stars, the trust line: the faces and number of people the reader
 *   trusts who recommend it, how many reviews it has and the price they give; "Open now · until 10:00 PM" or "Closed ·
 *   opens Thu 5:00 PM" in the place's local time estimated from its
 *   longitude (lib/placeLinks) and the reader's clock; an "Accepts Bitcoin"
 *   chip saying how.
 * - The ways out, icon over label, only the ones with data: Directions (the
 *   phone's maps app, by the coordinates), Call, Website, Menu, Reserve; and
 *   for a signed-in reader, Review and Recommend (a one-tap vouch: Brainstorm's
 *   own signal, never a review, counted in no rating).
 * - The map as the visual, since no place in the list has a photo yet; the
 *   photo when one has. Loaded on tap, as the privacy rule has it.
 * - Location & hours, Yelp's block: address, phone, website, price on the
 *   left; the whole week on the right, today first and bold. The country
 *   alone when there's no address. Each thing is said once: Bitcoin is the
 *   chip, the address is the row.
 * - Reviews by people (PlaceReviews), ordered by who the reader trusts,
 *   written from five empty stars, Google's way; their photos become the
 *   page's pictures under the map, and the price and payment they give fill
 *   the rows the list can't.
 * - The rest of the list, and the data attribution the ODbL licence asks for.
 *
 * Every value is read through the governing definition's fields, the
 * community concept's names for them; a copy that drops the name leaves the
 * item to the tier-two page.
 */
import {
  Beer,
  Bitcoin,
  BookOpen,
  CalendarCheck,
  Clock,
  Coffee,
  CreditCard,
  Croissant,
  ExternalLink,
  Globe,
  IceCreamCone,
  MapPin,
  Navigation,
  PenLine,
  Phone,
  ThumbsUp,
  Loader2,
  Check,
  Store,
  Tag,
  Utensils,
  Wine,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { Favicon } from "@/components/share/LinkPreview";
import { DListItemNeighbours, useListItems } from "@/components/dictionary/DListItemNeighbours";
import { ItemLine } from "@/components/dictionary/ItemLine";
import { Link } from "wouter";
import { eventPath } from "@/lib/shareId";
import { dictionaryRelays } from "@/config/dictionary";
import { isReady, useResolvedItemView } from "@/hooks/useItemView";
import { distanceKm, distanceWords } from "@/lib/placeDistance";
import { AdminDefinition, ConceptLink, type FieldCells, type ItemEvent } from "@/components/share/DListItemParts";
import { useNetworkView, type NetworkView } from "@/components/items/WhoStandsBehindIt";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { PlaceMap } from "@/components/items/PlaceMap";
import { PlaceReviews, ReviewPhotos, useRankedReviews } from "@/components/items/PlaceReviews";
import { paymentSummary, priceSummary } from "@/lib/placeReviews";
import { usePlaceRating, usePlaceReviews } from "@/hooks/usePlaceReviews";
import { useProfileMap } from "@/hooks/useProfileMap";
import { getDisplayLabel } from "@/lib/profileSearch";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import type { ReadyItemView } from "@/hooks/useItemView";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { fieldCell, httpUrl, undeclaredFields } from "@/lib/dlistFields";
import { contactHref } from "@/lib/contactHref";
import { DAYS, openingStatus, parseOpeningHours, type Day, type Week } from "@/lib/openingHours";
import { addressLine, addressLines, categoryWords, directionsUrl, placeLocalMinutes } from "@/lib/placeLinks";
import type { ItemPresentation } from "@/lib/itemPresentation";
import { proxiedSrc } from "@/lib/imageProxy";
import { useSiteCard } from "@/hooks/useSiteCard";
import { EmojiText } from "@/components/ui/custom-emoji";

export interface Place {
  name: string;
  category: string | null;
  cuisine: string | null;
  description: string | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  lat: string | null;
  lon: string | null;
  website: string | null;
  phone: string | null;
  hours: string | null;
  bitcoin: string | null;
  priceRange: string | null;
  menu: string | null;
  reservations: string | null;
  image: string | null;
  license: string | null;
  source: string | null;
}

const FIELDS = {
  name: "name",
  category: "category",
  cuisine: "cuisine",
  description: "description",
  address: "address",
  locality: "locality",
  region: "region",
  postalCode: "postal-code",
  country: "country",
  lat: "lat",
  lon: "lon",
  website: "website",
  phone: "phone",
  hours: "opening-hours",
  bitcoin: "accepts-bitcoin",
  priceRange: "price-range",
  menu: "menu",
  reservations: "reservations",
  image: "image",
  license: "license",
  source: "source",
} as const;

/** The place the item names, read through the definition: null without a declared, filled name. */
export function placeOf(item: { tags: string[][] }, definition: ConceptDefinition): Place | null {
  const read = (name: string): string | null => {
    const decl = definition.fields.find((f) => f.name === name);
    return decl ? fieldCell(item, decl).value?.trim() || null : null;
  };
  const name = read(FIELDS.name);
  if (!name) return null;
  const out = {} as Record<keyof typeof FIELDS, string | null>;
  for (const k of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) out[k] = read(FIELDS[k]);
  return { ...out, name };
}

/**
 * How a place reads where it is one among many — a results row, a card, a
 * tile (ADR 0007): its name, then what it is and where ("Restaurant ·
 * Italian · Sarasota"), the way a map app lists one. Its picture when it has
 * one. From the item alone.
 */
export function placePresentation(
  item: { tags: string[][] },
  definition: ConceptDefinition,
  shown: ItemPresentation,
): ItemPresentation {
  const place = placeOf(item, definition);
  if (!place) return shown;
  const kind = categoryWords(place.category);
  const cuisine = categoryWords(place.cuisine);
  const line = [kind, cuisine !== kind ? cuisine : null, place.locality].filter(Boolean).join(" · ");
  return {
    ...shown,
    title: place.name,
    titleField: FIELDS.name,
    summary: line || shown.summary,
    image: place.image ?? shown.image,
  };
}

const DAY_NAMES: Record<Day, string> = {
  mo: "Monday",
  tu: "Tuesday",
  we: "Wednesday",
  th: "Thursday",
  fr: "Friday",
  sa: "Saturday",
  su: "Sunday",
};
const DAY_SHORT: Record<Day, string> = { mo: "Mon", tu: "Tue", we: "Wed", th: "Thu", fr: "Fri", sa: "Sat", su: "Sun" };

/** 1020 → "5:00 PM" for a US reader, "17:00" elsewhere: the reader's own clock. Past-midnight closes wrap. */
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const clock = (m: number) => {
  const t = ((m % 1440) + 1440) % 1440;
  return clockFormat.format(new Date(Date.UTC(2000, 0, 1, Math.floor(t / 60), t % 60)));
};

/** The mark for a kind of place with no website to borrow a logo from. */
function categoryIcon(category: string | null): typeof Store {
  const c = (category ?? "").toLowerCase();
  if (/cafe|coffee|tea/.test(c)) return Coffee;
  if (/bar|pub|brewery|beer/.test(c)) return Beer;
  if (/wine|winery|distillery|alcohol/.test(c)) return Wine;
  if (/bakery|pastry|bread|chocolate/.test(c)) return Croissant;
  if (/ice_cream|ice cream|gelato/.test(c)) return IceCreamCone;
  if (/restaurant|fast_food|food|deli|butcher|farm/.test(c)) return Utensils;
  return Store;
}
const spansText = (spans: Week[Day]) =>
  spans.length ? spans.map((s) => `${clock(s.open)}–${clock(s.close)}`).join(", ") : "Closed";

function bitcoinWords(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "lightning") return "Lightning";
  if (v === "onchain" || v === "on-chain") return "On-chain";
  if (v === "both") return "Lightning and on-chain";
  if (v === "no") return null;
  return "";
}

function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.trim().toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function PlaceView({ event, view }: { event: ItemEvent; view: ReadyItemView }) {
  const { resolved: r, shown, links, usedFields } = view;
  const place = placeOf(event, r.governing)!;
  const me = useActiveAccountDisplay();
  const isAdmin = me?.isAdmin === true;
  // The map opened up in place, at the reader's ask — never on a stray zoom or drag.
  const [mapOpen, setMapOpen] = useState(false);
  // The review composer, opened by a star in the prompt or the Review action, with the stars picked.
  const [writing, setWriting] = useState<{ stars: number | null } | null>(null);
  const network = useNetworkView(event);
  const ranked = useRankedReviews(usePlaceReviews(event));
  const listed = useListItems(event, r);
  const price = priceSummary(ranked.reviews);
  // The star value through a lens (the Regulars contract's section 8): never a plain average.
  const rating = usePlaceRating(event, ranked.reviews);
  const curatorProfile = useProfileMap([event.pubkey]).get(event.pubkey);
  const curatorName = curatorProfile ? getDisplayLabel(curatorProfile) : "the list's curator";
  const payments = paymentSummary(ranked.reviews);

  const kind = [categoryWords(place.category), categoryWords(place.cuisine)].filter(Boolean).join(" · ");
  const week = parseOpeningHours(place.hours);
  const lon = Number(place.lon);
  const localNow = week && Number.isFinite(lon) ? placeLocalMinutes(lon, new Date()) : null;
  const status = week && localNow ? openingStatus(week, localNow) : null;
  const bitcoin = bitcoinWords(place.bitcoin);
  const directions = directionsUrl(place);
  const coords =
    Number.isFinite(Number(place.lat)) && Number.isFinite(lon) && place.lat ? { lat: Number(place.lat), lon } : null;
  const website = httpUrl(place.website);
  const site = useSiteCard(website);
  // How to call: tier two's `tel:` when the header types `phone` as `tel` (dlistFields), so
  // both tiers agree; when it doesn't, this view still knows the field is a phone number and
  // reads what it can from the value (contactHref). The Call button around it is its own.
  const phoneDecl = r.governing.fields.find((f) => f.name === FIELDS.phone && f.type === "tel");
  const call = (phoneDecl ? fieldCell(event, phoneDecl).href : null) ?? contactHref(place.phone);
  const menu = httpUrl(place.menu);
  const reserve = httpUrl(place.reservations);
  // The definition's templates (BTC Map), apart from the website the hints already show.
  // The definition's templates (BTC Map's listing): where the record came from, said by the attribution.
  const listings = links.filter((l) => l.href !== website);
  const country = countryName(place.country);
  const address = addressLine(place);
  const lines = addressLines(place) ?? [];
  const photo = shown.image ?? site?.image ?? null;
  const Mark = categoryIcon(place.category);
  // Who recommends it, of the people the reader trusts: a recommendation is a vouch (kind 7), not a review.
  const recommenders = network.ranked.filter((e) => e.group !== "other");
  const reviewCount = ranked.reviews.length;

  // The admin's fold: declared fields the page doesn't show, and tags outside the definition.
  const used = new Set([...usedFields, ...Object.values(FIELDS)]);
  const unshown: FieldCells = r.governing.fields
    .map((field) => ({ field, cell: fieldCell(event, field) }))
    .filter((c) => !used.has(c.field.name) && c.cell.value != null);
  const extras = undeclaredFields(event, r.governing.fields);

  return (
    <div className="space-y-5" data-testid="dlist-item-hero" data-definition="read" data-view="place">
      {isAdmin && (
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          <ConceptLink event={event}>{r.governing.singular}</ConceptLink>
        </p>
      )}

      {/* The hero band, Yelp's way with our twist: the picture is always the map, and a frosted panel on
          its corner carries who it is — the name, the kind, the trust line, open or closed. The site's own
          picture, when it has one, is a small tile in the panel beside the name, like a logo: never a band
          that pushes the map down the page. */}
      <div className="relative" data-testid="place-hero">
        {coords && <PlaceMap lat={coords.lat} lon={coords.lon} name={place.name} hero expanded={mapOpen} />}
        {coords && (
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            aria-pressed={mapOpen}
            aria-label={mapOpen ? "Shrink the map" : "Expand the map"}
            title={mapOpen ? "Shrink the map" : "Expand the map"}
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            data-testid="place-map-expand"
          >
            {mapOpen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
        {/* Opened up, the panel folds to a name pill from sm up, so the map is clear; on a phone the
            panel is under the map already and simply stays. */}
        {mapOpen && (
          <div
            className="absolute left-4 top-4 z-10 hidden max-w-[70%] items-center gap-2 rounded-full border border-white/60 bg-white/85 py-1 pl-3 pr-1 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85 dark:text-slate-100 sm:flex"
            data-testid="place-identity-pill"
          >
            <span className="truncate">
              <EmojiText text={place.name} tags={event} />
            </span>
            <button
              type="button"
              onClick={() => setMapOpen(false)}
              aria-label="Shrink the map"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div
          className={`mt-3 sm:absolute sm:left-4 sm:top-4 sm:z-10 sm:mt-0 sm:max-w-[min(60%,22rem)] sm:rounded-xl sm:border sm:border-white/60 sm:bg-white/85 sm:p-4 sm:shadow-sm sm:backdrop-blur-md dark:sm:border-slate-700/60 dark:sm:bg-slate-900/85 ${mapOpen ? "sm:hidden" : ""}`}
          data-folded={mapOpen ? "true" : undefined}
          data-testid="place-identity"
        >
          {/* The name leads; the logo, when the site has one, sits at the row's right end, as on a letterhead. */}
          <div className="flex items-start gap-3">
            <h1
              className="min-w-0 flex-1 break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="place-name"
            >
              <EmojiText text={place.name} tags={event} />
            </h1>
            {photo && <LogoTile src={photo} />}
          </div>
          {kind && (
            <p
              className="mt-1 inline-flex items-center gap-1.5 text-[15px] text-slate-600 dark:text-slate-300"
              data-testid="place-kind"
            >
              <Mark className="h-4 w-4 text-slate-400" aria-hidden />
              {kind}
              {place.priceRange && (
                <span className="text-slate-400"> · {"$".repeat(Math.min(4, Number(place.priceRange) || 0))}</span>
              )}
            </p>
          )}
          <p
            className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500 dark:text-slate-400"
            data-testid="place-trust-line"
          >
            {rating && (
              <>
                <span className="font-semibold text-slate-700 dark:text-slate-200" data-testid="place-trust-stars">
                  ★ {rating.value.toFixed(1)}
                </span>
                <span className="text-slate-300 dark:text-slate-600">{" · "}</span>
              </>
            )}
            {recommenders.length > 0 && (
              <>
                <Faces network={network} people={recommenders.map((e) => e.pubkey)} />
                <span>
                  Recommended by {recommenders.length} {recommenders.length === 1 ? "person" : "people"} you trust
                </span>
                <span className="text-slate-300 dark:text-slate-600">{" · "}</span>
              </>
            )}
            <a href="#place-reviews" className="hover:text-brand-link">
              {reviewCount > 0 ? `${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}` : "No reviews yet"}
            </a>
            {price && (
              <>
                <span className="text-slate-300 dark:text-slate-600">{" · "}</span>
                <span>{price.dollars}</span>
              </>
            )}
          </p>
          {status && (
            <p className="mt-2">
              <span
                className={`inline-flex items-center gap-1.5 text-sm font-semibold ${status.open ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}
                title="In the place's local time, estimated from where it is"
                data-testid="place-open-status"
              >
                <Clock className="h-3.5 w-3.5" />
                {status.open
                  ? `Open now · until ${clock(status.until)}`
                  : status.opensAt != null && status.opensDay
                    ? `Closed · opens ${status.opensDay === localNow!.day ? "at" : DAY_SHORT[status.opensDay]} ${clock(status.opensAt)}`
                    : "Closed"}
              </span>
            </p>
          )}
        </div>
      </div>
      {place.description && (
        <p className="max-w-prose text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
          <EmojiText text={place.description} tags={event} />
        </p>
      )}
      <ReviewPhotos reviews={ranked.reviews} />

      {(directions || call || website || menu || reserve) && (
        <div
          className="flex gap-1 border-b border-slate-100 pb-4 dark:border-slate-800 sm:gap-2"
          data-testid="place-actions"
        >
          {directions && (
            <Action href={directions} label="Directions" primary>
              <Navigation className="h-5 w-5" />
            </Action>
          )}
          {call && (
            <Action href={call} label="Call">
              <Phone className="h-5 w-5" />
            </Action>
          )}
          {website && (
            <Action href={website} label="Website">
              <Globe className="h-5 w-5" />
            </Action>
          )}
          {menu && (
            <Action href={menu} label="Menu">
              <BookOpen className="h-5 w-5" />
            </Action>
          )}
          {reserve && (
            <Action href={reserve} label="Reserve">
              <CalendarCheck className="h-5 w-5" />
            </Action>
          )}
          {network.me && (
            <Action
              href="#place-reviews"
              label="Review"
              onClick={(e) => {
                e.preventDefault();
                setWriting((w) => w ?? { stars: null });
              }}
            >
              <PenLine className="h-5 w-5" />
            </Action>
          )}
          {network.me && <RecommendAction network={network} />}
        </div>
      )}

      {/* Location & hours, Yelp's block: where and how to reach it on the left, the week on the right. */}
      <section className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2" data-testid="place-details">
        <dl className="space-y-0.5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
            Location
          </p>
          {place.address && address ? (
            <Row icon={MapPin} label="Address" testId="place-address">
              {/* Written as on an envelope: the street, the city line, then the country, muted. */}
              <Address
                lines={lines}
                country={country && !address.includes(country) ? country : null}
                href={directions}
              />
            </Row>
          ) : (
            (address || country) && (
              <Row icon={MapPin} label="Where" testId="place-country">
                {[address, country].filter(Boolean).join(", ")}
              </Row>
            )
          )}
          {place.phone && (
            <Row icon={Phone} label="Phone" testId="place-phone">
              {call ? (
                <a href={call} className="hover:text-brand-link">
                  {place.phone}
                </a>
              ) : (
                place.phone
              )}
            </Row>
          )}
          {website && (
            <Row icon={Globe} label="Website" testId="place-website">
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 hover:text-brand-link"
              >
                <Favicon host={hostOf(website)} className="h-4 w-4 text-slate-400" fallback={null} />
                {hostOf(website)} <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </Row>
          )}
          {/* How to pay is a detail, with the address, phone and site — not a badge in the panel: every
              place on a BTC Map list takes Bitcoin, so the badge said the same thing on every page. */}
          {bitcoin != null && (
            <Row icon={Bitcoin} label="Payment" testId="place-bitcoin">
              Accepts Bitcoin{bitcoin ? ` · ${bitcoin}` : ""}
            </Row>
          )}
          {(price || place.priceRange) && (
            <Row icon={Tag} label="Price" testId="place-price">
              {price
                ? `${price.dollars} · from ${price.count} ${price.count === 1 ? "review" : "reviews"}`
                : "$".repeat(Number(place.priceRange) || 0)}
            </Row>
          )}
          {payments.length > 0 && (
            <Row icon={CreditCard} label="Paid with" testId="place-paid">
              {payments.map((p) => `${p.label} · ${p.count}`).join(", ")}
            </Row>
          )}
        </dl>
        {week && localNow && <HoursBlock week={week} today={localNow.day} />}
      </section>

      <div id="place-reviews">
        <PlaceReviews
          item={event}
          name={place.name}
          ranked={ranked}
          rating={rating}
          curatorName={curatorName}
          writing={writing}
          onWrite={setWriting}
        />
      </div>

      {coords && <NearbyPlaces here={{ id: event.id, ...coords }} items={listed.items} resolved={r} />}

      <DListItemNeighbours event={event} resolved={r} more={false} />

      <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="place-attribution">
        {listings.length > 0 ? (
          <span data-testid="place-listing">
            Listed on{" "}
            {listings.map((l, i) => (
              <span key={l.href}>
                {i > 0 && ", "}
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline decoration-dotted underline-offset-2 hover:text-brand-link"
                >
                  {l.label.replace(/ place$/i, "")}
                </a>
              </span>
            ))}
            .{" "}
          </span>
        ) : place.source === "btcmap" ? (
          "Seeded from BTC Map. "
        ) : (
          ""
        )}
        Data © OpenStreetMap contributors, Open Database License.
      </p>

      <AdminDefinition event={event} resolved={r} cells={unshown} extras={extras} />
    </div>
  );
}

/** A way out, Google's way: a round button with the label under; the one primary action filled. */
function Action({
  href,
  label,
  primary = false,
  onClick,
  children,
}: {
  href: string;
  label: string;
  primary?: boolean;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}) {
  const inPage = href.startsWith("#") || href.startsWith("tel:");
  return (
    <a
      href={href}
      target={inPage ? undefined : "_blank"}
      rel={inPage ? undefined : "noopener noreferrer nofollow"}
      onClick={onClick}
      aria-label={label}
      title={inPage ? undefined : href}
      className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          primary
            ? "bg-brand-primary text-white group-hover:bg-brand-primary-hover"
            : "border border-slate-200 bg-white text-slate-700 group-hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:group-hover:bg-slate-800"
        }`}
      >
        {children}
      </span>
      <span aria-hidden>{label}</span>
    </a>
  );
}

/** Recommend, in one tap: the reader's vouch for the place, said once they've given it. */
function RecommendAction({ network: n }: { network: NetworkView }) {
  return (
    <button
      type="button"
      onClick={() => n.endorse.mutate()}
      disabled={n.mine || n.endorse.isPending}
      aria-label={n.mine ? "Recommended" : "Recommend"}
      title={n.mine ? "You recommended this place" : "Public and signed by your account"}
      className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 py-1 text-[11px] font-semibold text-slate-600 disabled:cursor-default dark:text-slate-300"
      data-testid="place-recommend"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          n.mine
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "border border-slate-200 bg-white text-slate-700 group-hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:group-hover:bg-slate-800"
        }`}
      >
        {n.endorse.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : n.mine ? (
          <Check className="h-5 w-5" />
        ) : (
          <ThumbsUp className="h-5 w-5" />
        )}
      </span>
      <span aria-hidden>{n.mine ? "Recommended" : "Recommend"}</span>
    </button>
  );
}

/** Up to three faces, overlapped, each with its tier ring. */
function Faces({ network: n, people }: { network: NetworkView; people: string[] }) {
  const tierRing = useTierRing();
  return (
    <span className="flex -space-x-1.5" data-testid="place-recommenders">
      {people.slice(0, 3).map((pk) => (
        <Avatar
          key={pk}
          data-face={pk}
          className={`h-5 w-5 rounded-full bg-white dark:bg-slate-900 ${tierRing(n.scoreOf(pk), false, "sm", true) ?? "ring-2 ring-white dark:ring-slate-900"}`}
        >
          {n.pictureOf(pk) ? <AvatarImage src={n.pictureOf(pk)} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden rounded-full">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
      ))}
    </span>
  );
}

/** One detail, Google's way: an icon, the value, a hairline under. */
function Row({
  icon: Icon,
  label,
  testId,
  wide = false,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  testId: string;
  /** Across both columns from sm up: the address, which needs the width. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-2.5 py-1.5 text-sm ${wide ? "sm:col-span-2" : ""}`} data-testid={testId}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

/**
 * The address written as on an envelope: the street on one line, the city,
 * state and postcode on the next, the country on its own line, muted
 * (lib/placeLinks addressLines). The whole of it opens directions.
 */
function Address({ lines, country, href }: { lines: string[]; country: string | null; href: string | null }) {
  const [street, city] = lines.length > 1 ? lines : [null, lines[0] ?? null];
  const body = (
    <>
      {street && (
        <span className="block" data-testid="place-address-street">
          {street}
        </span>
      )}
      {city && (
        <span className="block" data-testid="place-address-city">
          {city}
        </span>
      )}
      {country && (
        <span className="block text-slate-500 dark:text-slate-400" data-testid="place-address-country">
          {country}
        </span>
      )}
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block hover:text-brand-link">
      {body}
    </a>
  ) : (
    body
  );
}

/**
 * The site's picture as a small tile beside the name — but only once it has
 * loaded and proved roughly square, which is what a logo is. A site's picture
 * is usually its link-preview banner, wide and lettered, and cropped to a
 * square that is a slice of lettering; a banner is left unseen. Unseen, not
 * absent, so the measurement can happen.
 */
const SQUARE_ENOUGH = [0.75, 1.34] as const;

function LogoTile({ src }: { src: string }) {
  const [square, setSquare] = useState(false);
  return (
    <img
      src={proxiedSrc(src, "media_320")}
      referrerPolicy="no-referrer"
      alt=""
      onLoad={(e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        const ratio = w > 0 && h > 0 ? w / h : 0;
        setSquare(ratio >= SQUARE_ENOUGH[0] && ratio <= SQUARE_ENOUGH[1]);
      }}
      hidden={!square}
      className="ml-auto h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-white object-cover shadow-sm dark:border-slate-700"
      data-shown={square ? "true" : "false"}
      data-testid="place-photo"
    />
  );
}

/** The week, Yelp's way: every day in view, today first and bold. */
function HoursBlock({ week, today }: { week: Week; today: Day }) {
  const order = [...DAYS.slice(DAYS.indexOf(today)), ...DAYS.slice(0, DAYS.indexOf(today))];
  return (
    <div data-testid="place-hours">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Hours</p>
      <table className="w-full border-collapse text-sm" data-testid="place-week">
        <tbody>
          {order.map((d) => (
            <tr
              key={d}
              data-today={d === today ? "true" : undefined}
              className={
                d === today ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"
              }
            >
              <th scope="row" className="font-inherit w-28 py-0.5 text-left">
                {DAY_NAMES[d]}
              </th>
              <td className="py-0.5">{spansText(week[d])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NEARBY = 3;

/**
 * The nearest places from the list, by distance from this one: what a reader
 * scanning for somewhere to eat wants, and the one thing the list can give
 * that a review site can't. Three, each a tile with how far it is, in the
 * reader's units (lib/placeDistance).
 */
function NearbyPlaces({
  here,
  items,
  resolved,
}: {
  here: { id: string; lat: number; lon: number };
  items: { id: string; kind: number; pubkey: string; tags: string[][] }[];
  resolved: ReadyItemView["resolved"];
}) {
  const nearest = items
    .filter((i) => i.id !== here.id)
    .map((item) => {
      const p = placeOf(item, resolved.governing);
      const lat = Number(p?.lat);
      const lon = Number(p?.lon);
      return p && Number.isFinite(lat) && Number.isFinite(lon) && p.lat && p.lon
        ? { item, km: distanceKm(here, { lat, lon }) }
        : null;
    })
    .filter((x): x is { item: (typeof items)[number]; km: number } => x !== null)
    .sort((a, b) => a.km - b.km)
    .slice(0, NEARBY);
  if (nearest.length === 0) return null;
  return (
    <section data-testid="place-nearby">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
        Nearby
      </p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {nearest.map(({ item, km }) => (
          <NearbyTile key={item.id} item={item} km={km} resolved={resolved} />
        ))}
      </ul>
    </section>
  );
}

function NearbyTile({
  item,
  km,
  resolved,
}: {
  item: { id: string; kind: number; pubkey: string; tags: string[][] };
  km: number;
  resolved: ReadyItemView["resolved"];
}) {
  const view = useResolvedItemView(item, resolved);
  if (!isReady(view)) return null;
  const kind = categoryWords(placeOf(item, resolved.governing)?.category ?? null);
  return (
    <li className="min-w-0" data-testid="place-nearby-item">
      <Link
        href={eventPath(item as never, dictionaryRelays())}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900"
      >
        <ItemLine
          shown={view.shown}
          singular={resolved.governing.singular}
          line={[distanceWords(km), kind].filter(Boolean).join(" · ")}
          testId="place-nearby"
        />
      </Link>
    </li>
  );
}
