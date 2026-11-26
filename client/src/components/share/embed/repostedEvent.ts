import { eventStore } from "@/lib/eventStore";
import { analyzeNote, type MinimalEvent } from "@/lib/noteRefs";

/** Reposts (NIP-18): their content is the reposted event, as JSON. */
const REPOST_KINDS: ReadonlySet<number> = new Set([6, 16]);

/**
 * The event a repost carries in its content, when it is one: whole, signed by
 * its author, and the one its `e` names. Anyone can write JSON that names
 * someone as its author; it is drawn as theirs only under their signature.
 * The store's copy of the `e`, when it holds one, is the note itself.
 */
export function repostedEvent(event: MinimalEvent): MinimalEvent | null {
  if (!REPOST_KINDS.has(event.kind)) return null;
  const refs = analyzeNote(event);
  return (
    (refs.repostId ? (eventStore.getEvent(refs.repostId) as MinimalEvent | undefined) : undefined) ??
    refs.repostEvent ??
    null
  );
}
