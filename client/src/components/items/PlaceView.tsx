/**
 * A food and drink place on its own page (ADR 0007, tier three), the shape
 * a reader knows from Google Places or Yelp, in Brainstorm's own clothes:
 *
 * - The name; what it is as words ("Fast food · Pizza"); "Open now · until
 *   22:00" or "Closed · opens Thu 17:00" when it has hours, in the place's
 *   local time estimated from its longitude (lib/placeLinks); an "Accepts
 *   Bitcoin" chip saying how.
 * - The ways out, icon over label, only the ones with data: Directions (the
 *   phone's maps app, by the coordinates), Call, Website, Menu, Reserve, and
 *   the links the definition's templates build (BTC Map).
 * - The map as the visual, since no place in the list has a photo yet; the
 *   photo when one has. Loaded on tap, as the privacy rule has it.
 * - The details, one row each: address, hours (today first, the week on
 *   tap), phone, website; the country alone when there's no address. Each
 *   thing is said once: Bitcoin is the chip, the address is the row.
 * - Who stands behind it (WhoStandsBehindIt), the rest of the list, and the
 *   data attribution the ODbL licence asks for.
 *
 * Every value is read through the governing definition's fields, the
 * community concept's names for them; a copy that drops the name leaves the
 * item to the tier-two page.
 */
import { useState } from "react";
import {
  Bitcoin,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Favicon } from "@/components/share/LinkPreview";
import { DListItemNeighbours } from "@/components/dictionary/DListItemNeighbours";
import {
  ConceptLink,
  DefinitionLine,
  MoreFields,
  type FieldCells,
  type ItemEvent,
} from "@/components/share/DListItemParts";
import { useNetworkView, WhoStandsBehindIt } from "@/components/items/WhoStandsBehindIt";
import { PlaceMap } from "@/components/items/PlaceMap";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import type { ReadyItemView } from "@/hooks/useItemView";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { fieldCell, httpUrl, undeclaredFields } from "@/lib/dlistFields";
import { contactHref } from "@/lib/contactHref";
import { DAYS, openingStatus, parseOpeningHours, type Day, type Week } from "@/lib/openingHours";
import { categoryWords, directionsUrl, placeLocalMinutes } from "@/lib/placeLinks";
import { avatarSrc } from "@/lib/avatarSrc";
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

/** 1020 → "17:00"; 1440 and past-midnight closes wrap to the clock. */
const clock = (m: number) => {
  const t = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
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
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;
  const network = useNetworkView(event);

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
  const call = place.phone ? contactHref(place.phone) : null;
  const menu = httpUrl(place.menu);
  const reserve = httpUrl(place.reservations);
  // The definition's templates (BTC Map), apart from the website the hints already show.
  const others = links.filter((l) => l.href !== website);
  const country = countryName(place.country);

  // The admin's fold: declared fields the page doesn't show, and tags outside the definition.
  const used = new Set([...usedFields, ...Object.values(FIELDS)]);
  const unshown: FieldCells = r.governing.fields
    .map((field) => ({ field, cell: fieldCell(event, field) }))
    .filter((c) => !used.has(c.field.name) && c.cell.value != null);
  const extras = undeclaredFields(event, r.governing.fields);

  return (
    <div className="space-y-5" data-testid="dlist-item-hero" data-definition="read" data-view="place">
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          <ConceptLink event={event}>{r.governing.singular}</ConceptLink>
        </p>
        <div>
          <h1
            className="break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="place-name"
          >
            <EmojiText text={place.name} tags={event} />
          </h1>
          {kind && (
            <p className="mt-0.5 text-[15px] text-slate-600 dark:text-slate-300" data-testid="place-kind">
              {kind}
              {place.priceRange && (
                <span className="text-slate-400"> · {"$".repeat(Math.min(4, Number(place.priceRange) || 0))}</span>
              )}
            </p>
          )}
          {(status || bitcoin != null) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {status && (
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
              )}
              {bitcoin != null && (
                <Chip tone="warning" icon={Bitcoin} size="sm" data-testid="place-bitcoin">
                  Accepts Bitcoin{bitcoin ? ` · ${bitcoin}` : ""}
                </Chip>
              )}
            </div>
          )}
          {place.description && (
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
              <EmojiText text={place.description} tags={event} />
            </p>
          )}
        </div>
      </div>

      {(directions || call || website || menu || reserve || others.length > 0) && (
        <div className="flex gap-2 sm:flex-wrap" data-testid="place-actions">
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
          {others.map((l) => (
            <Action key={l.href} href={l.href} label={l.label.replace(/ place$/i, "")}>
              <span className="flex h-5 w-5 items-center justify-center rounded bg-white">
                <Favicon host={l.host} className="h-3.5 w-3.5 text-slate-500" />
              </span>
            </Action>
          ))}
        </div>
      )}

      {shown.image ? (
        <img
          src={avatarSrc(shown.image, "lg")}
          alt=""
          className="aspect-[16/9] w-full rounded-xl border border-border object-cover"
          data-testid="place-photo"
        />
      ) : (
        coords && <PlaceMap lat={coords.lat} lon={coords.lon} name={place.name} />
      )}

      <dl
        className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700"
        data-testid="place-details"
      >
        {place.address ? (
          <Row icon={MapPin} label="Address" testId="place-address">
            {directions ? (
              <a href={directions} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-brand-link">
                {place.address}
              </a>
            ) : (
              place.address
            )}
            {country && !place.address.includes(country) && (
              <span className="text-slate-500 dark:text-slate-400">, {country}</span>
            )}
          </Row>
        ) : (
          (place.locality || country) && (
            <Row icon={MapPin} label="Where" testId="place-country">
              {[place.locality, place.region, country].filter(Boolean).join(", ")}
            </Row>
          )
        )}
        {week && localNow && <HoursRow week={week} today={localNow.day} />}
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
              className="inline-flex items-center gap-1 hover:text-brand-link"
            >
              {hostOf(website)} <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </Row>
        )}
      </dl>

      <WhoStandsBehindIt network={network} noun="place" idPrefix="place" />

      {isAdmin && <MoreFields cells={unshown} extras={extras} singular={r.governing.singular} />}

      <DListItemNeighbours event={event} resolved={r} />

      <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="place-attribution">
        {place.source === "btcmap" ? "Seeded from BTC Map. " : ""}Data © OpenStreetMap contributors, Open Database
        License.
      </p>

      {isAdmin && <DefinitionLine event={event} resolved={r} />}
    </div>
  );
}

/** A way out: icon over label, the one primary action filled. */
function Action({
  href,
  label,
  primary = false,
  children,
}: {
  href: string;
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("tel:") ? undefined : "_blank"}
      rel="noopener noreferrer nofollow"
      aria-label={label}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors sm:min-w-[76px] sm:flex-none sm:px-3 ${
        primary
          ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
          : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
    >
      {children}
      <span aria-hidden>{label}</span>
    </a>
  );
}

function Row({
  icon: Icon,
  label,
  testId,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm" data-testid={testId}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

/** Today's hours on the row; the whole week on tap, today first and bold. */
function HoursRow({ week, today }: { week: Week; today: Day }) {
  const [open, setOpen] = useState(false);
  const order = [...DAYS.slice(DAYS.indexOf(today)), ...DAYS.slice(0, DAYS.indexOf(today))];
  return (
    <div className="px-4 py-3 text-sm" data-testid="place-hours">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
        data-testid="place-hours-toggle"
      >
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 flex-1 text-slate-900 dark:text-slate-100">
          <span className="font-medium">{DAY_NAMES[today]}</span> {spansText(week[today])}
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <table className="mt-2 w-full border-collapse pl-7 text-sm" data-testid="place-week">
          <tbody>
            {order.map((d) => (
              <tr key={d} data-today={d === today ? "true" : undefined} className={d === today ? "font-semibold" : ""}>
                <th scope="row" className="font-inherit w-28 py-0.5 pl-7 text-left text-slate-600 dark:text-slate-300">
                  {DAY_NAMES[d]}
                </th>
                <td className="py-0.5 text-slate-900 dark:text-slate-100">{spansText(week[d])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
