/**
 * PROVISIONAL (2026-10-01) — presentation hints on a DList header: which
 * declared field is an item's title, its summary, its picture, and what
 * image the list as a whole wears. No spec defines these yet; tapestry has
 * nothing like it on any branch. The shape follows the tapestry agent's
 * review, and the team will settle names with David once this approach has
 * been seen working. Every tag name lives here, so a rename is one edit;
 * `displayHints` in dictionary.config.json turns reading them off.
 *
 *   ["display", "title" | "summary" | "image" | "link" | "media", <declared field>]
 *   ["image", <url>]        — the list's own image (NIP-51 lists' tag)
 *
 * `link` and `media` (2026-10-02) name fields whose values are whole URLs —
 * an item's page somewhere, its playable file — so they come from the item's
 * author, not from a template (lib/linkTemplates fixes a link's host; these
 * can't, and the reader's web-of-trust filter on items is what guards them).
 * Only http(s) values count. A `media` value plays by its file type
 * (lib/mediaKind): audio in the track card, video in the inline player.
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
export const DISPLAY_ROLES = ["title", "summary", "image", "link", "media"] as const;
export type DisplayRole = (typeof DISPLAY_ROLES)[number];

export interface DisplayHints {
  /** The field per role, when the header names one. */
  title: string | null;
  summary: string | null;
  image: string | null;
  link: string | null;
  media: string | null;
  /** The list's own image, an http(s) URL. */
  listImage: string | null;
}

export const NO_HINTS: DisplayHints = {
  title: null,
  summary: null,
  image: null,
  link: null,
  media: null,
  listImage: null,
};

const isRole = (v: string | undefined): v is DisplayRole => DISPLAY_ROLES.includes(v as DisplayRole);

export function parseDisplayHints(header: { tags: string[][] }, fields: FieldDecl[]): DisplayHints {
  const declared = new Set(fields.map((f) => f.name));
  const out: DisplayHints = { ...NO_HINTS };
  for (const t of header.tags) {
    if (t[0] === DISPLAY_TAG && isRole(t[1]) && t[2] && declared.has(t[2]) && out[t[1]] == null) out[t[1]] = t[2];
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
  const image = httpUrl(hints.listImage);
  if (image) tags.push([LIST_IMAGE_TAG, image]);
  return tags;
}

export const sameHints = (a: DisplayHints, b: DisplayHints): boolean =>
  DISPLAY_ROLES.every((role) => a[role] === b[role]) && a.listImage === b.listImage;
