/**
 * PROVISIONAL (2026-10-01) — presentation hints on a DList header: which
 * declared field is an item's title, its summary, its picture, and what
 * image the list as a whole wears. No spec defines these yet; tapestry has
 * nothing like it on any branch. The shape follows the tapestry agent's
 * review, and the team will settle names with David once this approach has
 * been seen working. Every tag name lives here, so a rename is one edit;
 * `displayHints` in dictionary.config.json turns reading them off.
 *
 *   ["display", "title" | "summary" | "image" | "link" | "media" | "location", <declared field>]
 *   ["display", "fact", <declared field>, <label?>]   — as many as the header likes
 *   ["image", <url>]        — the list's own image (NIP-51 lists' tag)
 *
 * `link` and `media` (2026-10-02) name fields whose values are whole URLs —
 * an item's page somewhere, its playable file — so they come from the item's
 * author, not from a template (lib/linkTemplates fixes a link's host; these
 * can't, and the reader's web-of-trust filter on items is what guards them).
 * Only http(s) values count. A `media` value plays by its file type
 * (lib/mediaKind): audio in the track card, video in the inline player.
 *
 * `location` (2026-10-07) names a field whose values are geohashes — NIP-52's
 * `g`, which an event often carries once per precision; the most precise one
 * counts (lib/geohash). The item's page offers it as a map.
 *
 * `fact` (2026-10-07) is the one role that repeats: each names a field the
 * item's page lists as "label: value", in the header's order — a place's
 * phone and hours, say. The fourth element is the label; without it, the
 * field's name reads as words ("opening-hours" → "Opening hours"). The first
 * tag per field wins, as the first per role does for the rest.
 *
 * A hint decorates a declared field and never invents one — the rule
 * `field-type` follows. First hint per role wins; unknown roles are ignored.
 * The item `image` role names a field whose values are URLs; deriving one
 * (GitHub's avatar from a username) is the url-template proposal's job, not
 * this one's.
 */
import { httpUrl, type FieldDecl } from "@/lib/dlistFields";

export const DISPLAY_TAG = "display";
export const LIST_IMAGE_TAG = "image";
export const DISPLAY_ROLES = ["title", "summary", "image", "link", "media", "location"] as const;
export type DisplayRole = (typeof DISPLAY_ROLES)[number];
/** The repeatable role, kept apart from DISPLAY_ROLES: those name one field each. */
export const FACT_ROLE = "fact";

export interface Fact {
  field: string;
  /** The header's label; null reads the field's name as words (factLabel). */
  label: string | null;
}

export interface DisplayHints {
  /** The field per role, when the header names one. */
  title: string | null;
  summary: string | null;
  image: string | null;
  link: string | null;
  media: string | null;
  location: string | null;
  /** Fields listed on the item's page, in the header's order. */
  facts: Fact[];
  /** The list's own image, an http(s) URL. */
  listImage: string | null;
}

export const NO_HINTS: DisplayHints = {
  title: null,
  summary: null,
  image: null,
  link: null,
  media: null,
  location: null,
  facts: [],
  listImage: null,
};

/** A fact's label: the header's, else its field's name as words. */
export function factLabel(fact: Fact): string {
  if (fact.label) return fact.label;
  const words = fact.field.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const isRole = (v: string | undefined): v is DisplayRole => DISPLAY_ROLES.includes(v as DisplayRole);

export function parseDisplayHints(header: { tags: string[][] }, fields: FieldDecl[]): DisplayHints {
  const declared = new Set(fields.map((f) => f.name));
  const out: DisplayHints = { ...NO_HINTS, facts: [] };
  for (const t of header.tags) {
    if (t[0] === DISPLAY_TAG && isRole(t[1]) && t[2] && declared.has(t[2]) && out[t[1]] == null) out[t[1]] = t[2];
    if (t[0] === DISPLAY_TAG && t[1] === FACT_ROLE && t[2] && declared.has(t[2])) {
      if (!out.facts.some((f) => f.field === t[2])) out.facts.push({ field: t[2], label: t[3]?.trim() || null });
    }
    if (t[0] === LIST_IMAGE_TAG && out.listImage == null) out.listImage = httpUrl(t[1]);
  }
  return out;
}

/** The hints as header tags, roles in a fixed order. */
export function displayHintTags(hints: DisplayHints): string[][] {
  const tags: string[][] = [];
  for (const role of DISPLAY_ROLES) {
    const field = hints[role];
    if (field) tags.push([DISPLAY_TAG, role, field]);
  }
  for (const f of hints.facts) tags.push([DISPLAY_TAG, FACT_ROLE, f.field, ...(f.label ? [f.label] : [])]);
  const image = httpUrl(hints.listImage);
  if (image) tags.push([LIST_IMAGE_TAG, image]);
  return tags;
}

export const sameHints = (a: DisplayHints, b: DisplayHints): boolean =>
  DISPLAY_ROLES.every((role) => a[role] === b[role]) &&
  a.listImage === b.listImage &&
  a.facts.length === b.facts.length &&
  a.facts.every((f, i) => f.field === b.facts[i].field && f.label === b.facts[i].label);
