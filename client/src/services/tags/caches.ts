/** Forgetting every cached tag read at once. */
import { elementMetaByCoord, elementsById } from "./elements";
import { headersByCoord } from "./headers";
import { trustSources } from "./trust";

/**
 * Drop every cached read. Called when the tag-relay list changes — the caches
 * are keyed by event id and coordinate, neither of which says which relay the
 * answer came from, so pointing at a different instance has to start clean.
 */
export function resetTagCaches(): void {
  elementsById.clear();
  elementMetaByCoord.clear();
  headersByCoord.clear();
  trustSources.clear();
}
