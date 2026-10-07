/**
 * How one list item reads — title, summary, picture, and the list's own
 * image — from its governing definition (ADR 0004), and nothing else: no
 * concept gets code of its own (the team, 2026-10-02: "burn the ships"). The
 * page, the card, the popup row and the list row all read it, so they agree.
 *
 * The definition's provisional display hints (lib/displayHints) decide,
 * when on; without them, the first required field is the title and a
 * declared `summary` or `description` is the summary.
 *
 * Chosen per definition, never per item: an item missing its title field
 * reads "Untitled <singular>" rather than borrowing another field, so the
 * same field always fills the same slot down a list (the team, 2026-10-02).
 */
import { DISPLAY_HINTS_ENABLED } from "@/config/dictionary";
import { fieldCell, httpUrl } from "@/lib/dlistFields";
import { factLabel, NO_HINTS } from "@/lib/displayHints";
import { decodeGeohash, type GeohashCell } from "@/lib/geohash";
import { mediaKindOfUrl } from "@/lib/mediaKind";
import type { ConceptDefinition } from "@/lib/conceptResolution";

export interface ItemPresentation {
  title: string | null;
  /** The field the title came from, so a page needn't repeat it. */
  titleField: string | null;
  summary: string | null;
  summaryField: string | null;
  /** The item's own picture, an http(s) URL. */
  image: string | null;
  imageField: string | null;
  /** The item's own link — a field holding a whole URL — labelled by its field's description, else its host. */
  link: { label: string; href: string; host: string } | null;
  linkField: string | null;
  /** The item's playable file, and what it plays as (lib/mediaKind). */
  media: { url: string; kind: "audio" | "video" } | null;
  mediaField: string | null;
  /** Where the item is: the most precise geohash its `location` field gives (lib/geohash). */
  location: (GeohashCell & { geohash: string }) | null;
  locationField: string | null;
  /** The definition's facts this item has a value for, labelled, in the header's order. */
  facts: { field: string; label: string; value: string; href: string | null; extra: number }[];
  /** Every field named as a fact, so a page needn't list it again. */
  factFields: string[];
  /** The list's image, worn by every item. */
  listImage: string | null;
}

const SUMMARY_NAMES = ["summary", "description"];

/** Of a field's values, the longest that decodes: an event carries `g` once per precision, coarse to fine in any order. */
function mostPreciseGeohash(item: { tags: string[][] }, field: string | null) {
  if (!field) return null;
  let best: (GeohashCell & { geohash: string }) | null = null;
  for (const t of item.tags) {
    if (t[0] !== field || !t[1]) continue;
    const geohash = t[1].trim().toLowerCase();
    const cell = decodeGeohash(geohash);
    if (cell && geohash.length > (best?.geohash.length ?? 0)) best = { ...cell, geohash };
  }
  return best;
}

export function presentItem(
  item: { tags: string[][] },
  definition: ConceptDefinition,
  hintsOn: boolean = DISPLAY_HINTS_ENABLED,
): ItemPresentation {
  const hints = hintsOn ? definition.display : NO_HINTS;
  const fields = definition.fields;
  const valueOf = (name: string | null) => {
    const decl = name ? fields.find((f) => f.name === name) : undefined;
    return decl ? fieldCell(item, decl).value : null;
  };
  const declared = (name: string | null | undefined) => (name && fields.some((f) => f.name === name) ? name : null);

  const titleField = hints.title ?? fields.find((f) => f.requirement === "required")?.name ?? fields[0]?.name ?? null;
  const summaryField =
    hints.summary ?? SUMMARY_NAMES.map((n) => declared(n)).find((n) => n && n !== titleField) ?? null;

  const linkHref = httpUrl(valueOf(hints.link));
  const linkHost = linkHref ? new URL(linkHref).host : null;
  const mediaUrl = httpUrl(valueOf(hints.media));
  const mediaKind = mediaUrl ? mediaKindOfUrl(mediaUrl) : null;
  // A field another role already shows isn't a fact as well: each field shows once.
  const byRole = new Set([titleField, summaryField, hints.image, hints.link, hints.media, hints.location]);
  const factHints = hints.facts.filter((f) => !byRole.has(f.field));
  const facts = factHints.flatMap((f) => {
    const decl = fields.find((d) => d.name === f.field);
    const cell = decl ? fieldCell(item, decl) : null;
    return cell?.value == null
      ? []
      : [{ field: f.field, label: factLabel(f), value: cell.value, href: cell.href, extra: cell.extra }];
  });

  return {
    title: valueOf(titleField),
    titleField,
    summary: summaryField === titleField ? null : valueOf(summaryField),
    summaryField,
    image: httpUrl(valueOf(hints.image)),
    imageField: hints.image,
    link:
      linkHref && linkHost
        ? { href: linkHref, host: linkHost, label: fields.find((f) => f.name === hints.link)?.description ?? linkHost }
        : null,
    linkField: hints.link,
    media: mediaUrl && (mediaKind === "audio" || mediaKind === "video") ? { url: mediaUrl, kind: mediaKind } : null,
    mediaField: hints.media,
    location: mostPreciseGeohash(item, hints.location),
    locationField: hints.location,
    facts,
    factFields: factHints.map((f) => f.field),
    listImage: hints.listImage,
  };
}
