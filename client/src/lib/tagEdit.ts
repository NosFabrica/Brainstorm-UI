/**
 * Editing a tag's description.
 *
 * A tag is an addressable event: kind 39999, `d` = its slug, signed by its
 * creator, with `{"tag":{slug,name,description}}` as content. Every tagging
 * points at that coordinate, so the creator changes what the tag means by
 * publishing the same event again with new words. The name stays: the slug is
 * made from it, and a tag that changed its name under the people carrying it
 * would be a different claim about them.
 */
export interface TagElementEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface TagElementTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

/** The longest a description may be, here and in the form that creates a tag. */
export const TAG_DESCRIPTION_MAX = 280;

/**
 * `element` with a new description, ready to sign: its tags as they are (the
 * `d` that keeps it the same tag, the lists it belongs to), its name and slug
 * untouched, and a `created_at` after the version it replaces, so a relay
 * keeps this one even when the clocks disagree.
 */
export function editedTagElement(element: TagElementEvent, description: string, now: number): TagElementTemplate {
  let parsed: { tag?: { name?: unknown } } & Record<string, unknown>;
  try {
    parsed = JSON.parse(element.content) as typeof parsed;
  } catch {
    throw new Error("This isn't a tag that can be edited.");
  }
  const hasSlug = element.tags.some((t) => t[0] === "d" && !!t[1]);
  if (!parsed || typeof parsed.tag?.name !== "string" || !parsed.tag.name || !hasSlug) {
    throw new Error("This isn't a tag that can be edited.");
  }
  return {
    kind: element.kind,
    created_at: Math.max(now, element.created_at + 1),
    tags: element.tags.map((t) => [...t]),
    content: JSON.stringify({ ...parsed, tag: { ...parsed.tag, description: description.trim() } }),
  };
}
