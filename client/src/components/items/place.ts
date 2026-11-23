/**
 * A place as tier three reads it (ADR 0007), apart from its page: which
 * place an item names, how it reads among many, and whether it is open. Light
 * on purpose, since the app's root reaches it through TierThreeProvider and
 * search's Places use it; the page itself (PlaceView) loads when an item's
 * page draws it.
 */
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { fieldCell } from "@/lib/dlistFields";
import type { ItemPresentation } from "@/lib/itemPresentation";
import { openingStatus, parseOpeningHours, type Day } from "@/lib/openingHours";
import { categoryWords, placeLocalMinutes } from "@/lib/placeLinks";

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

export const FIELDS = {
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

const DAY_SHORT: Record<Day, string> = { mo: "Mon", tu: "Tue", we: "Wed", th: "Thu", fr: "Fri", sa: "Sat", su: "Sun" };

/** 1020 → "5:00 PM" for a US reader, "17:00" elsewhere: the reader's own clock. Past-midnight closes wrap. */
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
export const clock = (m: number) => {
  const t = ((m % 1440) + 1440) % 1440;
  return clockFormat.format(new Date(Date.UTC(2000, 0, 1, Math.floor(t / 60), t % 60)));
};

/**
 * Open or closed, said the one way everywhere a place is shown: "Open now ·
 * until 10:00 PM", "Closed · opens Thu 5:00 PM", in the place's local time
 * estimated from its longitude. Null when its hours can't be read.
 */
export function openingLine(place: Pick<Place, "hours" | "lon">, now: Date): { open: boolean; text: string } | null {
  const week = parseOpeningHours(place.hours);
  const lon = Number(place.lon);
  if (!week || !Number.isFinite(lon)) return null;
  const local = placeLocalMinutes(lon, now);
  const status = openingStatus(week, local);
  if (status.open) return { open: true, text: `Open now · until ${clock(status.until)}` };
  const when =
    status.opensAt != null && status.opensDay
      ? ` · opens ${status.opensDay === local.day ? "at" : DAY_SHORT[status.opensDay]} ${clock(status.opensAt)}`
      : "";
  return { open: false, text: `Closed${when}` };
}
