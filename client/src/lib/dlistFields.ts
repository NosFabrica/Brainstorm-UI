/**
 * The grammar of a Decentralized List as a header declares it: which fields
 * its items carry, in what order, of what type — so an item is rendered by
 * what its list says items have, not by whatever tags its author added.
 * A port of tapestry's `ui/src/utils/dlistFields.js` (branch feat/tags), the
 * reference reader, kept to the same rules so the two apps show one list the
 * same way.
 *
 * A header is a kind-39998 event (9998 is the non-addressable variant). It
 * declares fields with `["required" | "recommended" | "optional" | "allowed",
 * <item tag name>, <description?>]` — `allowed` reads as optional — and may
 * type a declared field with `["field-type", <name>, <type>]`, which never
 * adds a field of its own. Only `url` changes rendering (a link when the
 * value is http(s)); every other type, or none, is text.
 *
 * An item is a kind-39999 event (9999 non-addressable) filed under its
 * header by a `z` tag naming the header's coordinate (a 9998 header: an `e`
 * tag naming its id). Lists, not people: the items of the GitHub Accounts
 * list name accounts, they don't badge profiles. lib/dlists reads the music
 * lists, whose shapes are fixed; this module reads any list.
 */

export const DLIST_HEADER_KIND = 39998;
export const DLIST_ITEM_KIND = 39999;
/** Every kind a header or an item may be published as, addressable first. */
export const DLIST_HEADER_KINDS = [39998, 9998] as const;
export const DLIST_ITEM_KINDS = [39999, 9999] as const;

type TaggedEvent = { tags: string[][] };
type EventLike = { id?: string; pubkey?: string; kind?: number; tags: string[][] };

export type FieldRequirement = "required" | "recommended" | "optional";

export interface FieldDecl {
  /** The item tag the field is read from. */
  name: string;
  requirement: FieldRequirement;
  /** The header's own words for the field, when it gives them. */
  description: string | null;
  /** `text` unless a `field-type` tag says otherwise. */
  type: string;
}

export interface FieldCell {
  /** The first value an item gives the field, or null. */
  value: string | null;
  /** How many more values it gives the same field. */
  extra: number;
  /** A required field with no value. */
  missing: boolean;
  /** A link for a `url` field whose value is an http(s) URL. */
  href: string | null;
}

export interface Coordinate {
  kind: number;
  pubkey: string;
  d: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;
const LEVEL_RANK: Record<FieldRequirement, number> = { required: 0, recommended: 1, optional: 2 };
const LEVEL_OF_TAG: Record<string, FieldRequirement> = {
  required: "required",
  recommended: "recommended",
  optional: "optional",
  allowed: "optional",
};

const tagsOf = (ev: TaggedEvent | null | undefined): string[][] =>
  Array.isArray(ev?.tags) ? ev.tags.filter(Array.isArray) : [];

const tagValue = (ev: TaggedEvent | null | undefined, name: string): string | null => {
  const t = tagsOf(ev).find((x) => x[0] === name);
  return t && t.length > 1 && t[1] != null ? String(t[1]) : null;
};

/**
 * `kind:pubkey:d` → its parts, or null. The `d` may itself hold colons, so
 * only the first two split; the pubkey is lowercased, as relays index it.
 */
export function parseCoordinate(coord: string | null | undefined): Coordinate | null {
  if (typeof coord !== "string") return null;
  const [kindText, pubkey = "", ...rest] = coord.trim().split(":");
  const kind = Number(kindText);
  if (!Number.isInteger(kind) || kind < 0 || !HEX64.test(pubkey) || rest.length === 0) return null;
  return { kind, pubkey: pubkey.toLowerCase(), d: rest.join(":") };
}

export const formatCoordinate = ({ kind, pubkey, d }: Coordinate): string => `${kind}:${pubkey}:${d}`;

/** The coordinate of an addressable event (a 39998 header, a 39999 item), or null without a `d`. */
export function coordinateOf(ev: EventLike): string | null {
  if (typeof ev.kind !== "number" || typeof ev.pubkey !== "string") return null;
  const d = tagValue(ev, "d");
  return d == null ? null : `${ev.kind}:${ev.pubkey}:${d}`;
}

/** What an item names to join this header: its coordinate (39998), else its id (9998). */
export function headerReference(header: EventLike): string | null {
  if (header.kind === DLIST_HEADER_KIND) return coordinateOf(header);
  return typeof header.id === "string" ? header.id : null;
}

/** The header an item is filed under: its first `z` tag, else (a 9998 list) its first `e`. */
export function headerReferenceOf(item: TaggedEvent): string | null {
  return tagValue(item, "z") ?? tagValue(item, "e");
}

/**
 * Whether an event is a list header. 39998 and 9998 always are. A 39999 or
 * 9999 is one only when it says so — `["z", "list"]` or a `z` naming a
 * `…:concept-header` — never because it has items or names (tapestry's
 * dlist-header-declaration draft).
 */
export function isDListHeader(ev: EventLike): boolean {
  if (ev.kind === 39998 || ev.kind === 9998) return true;
  if (ev.kind !== 39999 && ev.kind !== 9999) return false;
  return tagsOf(ev).some((t) => t[0] === "z" && (t[1] === "list" || /:concept-header$/.test(t[1] ?? "")));
}

/** A list item: a 39999 or 9999 that is not itself a header. */
export function isDListItem(ev: EventLike): boolean {
  return (ev.kind === 39999 || ev.kind === 9999) && !isDListHeader(ev);
}

/** `names` → singular and plural (plural falls back to singular); without it, `name`, then `d`. */
export function headerNames(header: TaggedEvent): { singular: string; plural: string; description: string | null } {
  const names = tagsOf(header).find((t) => t[0] === "names");
  const singular = names?.[1] || tagValue(header, "name") || tagValue(header, "d") || "";
  return { singular, plural: names?.[2] || singular, description: tagValue(header, "description") };
}

/** The header's fields: required, then recommended, then optional — header order within each. */
export function parseFieldDecls(header: TaggedEvent): FieldDecl[] {
  const byName = new Map<string, { decl: Omit<FieldDecl, "type">; index: number }>();
  tagsOf(header).forEach((t, index) => {
    const requirement = LEVEL_OF_TAG[t[0]];
    const name = t[1];
    if (!requirement || typeof name !== "string" || !name) return;
    const prev = byName.get(name);
    // A field declared twice keeps its strongest requirement, at its first place.
    if (!prev || LEVEL_RANK[requirement] < LEVEL_RANK[prev.decl.requirement]) {
      const description = typeof t[2] === "string" && t[2] ? t[2] : null;
      byName.set(name, { decl: { name, requirement, description }, index: prev?.index ?? index });
    }
  });
  const types = new Map<string, string>();
  for (const t of tagsOf(header)) {
    if (t[0] === "field-type" && t[1] && t[2] && !types.has(t[1])) types.set(t[1], t[2]);
  }
  return [...byName.values()]
    .sort((a, b) => LEVEL_RANK[a.decl.requirement] - LEVEL_RANK[b.decl.requirement] || a.index - b.index)
    .map(({ decl }) => ({ ...decl, type: types.get(decl.name) ?? "text" }));
}

/** The trimmed value when it parses as an http(s) URL, else null. */
export function httpUrl(value: string | null | undefined): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  try {
    const { protocol } = new URL(s);
    return protocol === "http:" || protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

/** One field of one item: its first value, how many more it gives, whether a required one is missing. */
export function fieldCell(item: TaggedEvent, decl: FieldDecl): FieldCell {
  const hits = tagsOf(item).filter((t) => t[0] === decl.name && t.length > 1 && t[1] != null);
  const value = hits.length ? String(hits[0][1]) : null;
  return {
    value,
    extra: Math.max(0, hits.length - 1),
    missing: decl.requirement === "required" && value == null,
    href: value != null && decl.type === "url" ? httpUrl(value) : null,
  };
}

/**
 * The item's tags its header never declared, in tag order — what a reader
 * may show apart from the list's own fields. Single-letter tags are the
 * protocol's (`d`, `z`, `p`, `e`, …), not fields, and are left out, as are
 * empty values and the NIP metadata every event may carry (`alt`, `client`,
 * `expiration`) — tapestry keeps those; here every event we sign has a
 * `client`, which no list declares.
 */
const METADATA_TAGS = new Set(["alt", "client", "expiration"]);

export function undeclaredFields(item: TaggedEvent, decls: FieldDecl[]): { name: string; value: string }[] {
  const declared = new Set(decls.map((d) => d.name));
  return tagsOf(item)
    .filter(
      (t) =>
        typeof t[0] === "string" &&
        t[0].length > 1 &&
        !declared.has(t[0]) &&
        !METADATA_TAGS.has(t[0]) &&
        t[1] != null &&
        t[1] !== "",
    )
    .map((t) => ({ name: t[0], value: String(t[1]) }));
}
