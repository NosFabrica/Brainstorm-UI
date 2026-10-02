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
import { NO_HINTS } from "@/lib/displayHints";
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
  /** The list's image, worn by every item. */
  listImage: string | null;
}

const SUMMARY_NAMES = ["summary", "description"];

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
    listImage: hints.listImage,
  };
}
