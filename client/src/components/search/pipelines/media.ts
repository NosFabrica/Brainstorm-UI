/** The Media tab: what kinds of media the page holds, and what it keeps of the rest. */
import type { SearchHit } from "@/services/search";
import { isMediaFile, isSoundtrackFile } from "@/lib/fileMetadata";
import { MEDIA_KIND_ORDER, mediaKindOf, type MediaKind } from "@/lib/mediaKind";
import type { Facet } from "./types";

/**
 * What kinds of media the page holds, in fixed order, counted. One kind alone needs no chip
 * of its own.
 */
export function mediaKindFacets(hits: readonly SearchHit[]): Facet<MediaKind>[] {
  const counts = new Map<MediaKind, number>();
  for (const h of hits) {
    const k = mediaKindOf(h.event);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const present = MEDIA_KIND_ORDER.filter((k) => counts.has(k)).map((k) => [k, counts.get(k)!] as Facet<MediaKind>);
  return present.length > 1 ? present : [];
}

/**
 * Kind 1063 is generic file metadata — Zap Store APKs and other blobs
 * ride it. The Media tab means media: a 1063 stays only when its
 * declared mime is image/video/audio, and not when it is a video's
 * reusable soundtrack (lib/fileMetadata). Everything still shows the rest.
 * A chosen kind (Photos, Audio) sorts through what is left.
 */
export function mediaRows(hits: SearchHit[], pageKind: MediaKind | null): SearchHit[] {
  let shown = hits.filter((h) => h.event.kind !== 1063 || (isMediaFile(h.event) && !isSoundtrackFile(h.event)));
  if (pageKind) shown = shown.filter((h) => mediaKindOf(h.event) === pageKind);
  return shown;
}
