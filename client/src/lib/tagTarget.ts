/** What a tagging names: an event by id, or an addressable one by coordinate. */
export type TagTarget = { id: string } | { address: string };

/**
 * The target a tagging should name for `event` (issue #334; tapestry
 * protocols/drafts/event-taggings.md, "Targets"). An addressable event —
 * kinds 30000–39999: a listing, an article, a DList item — is named by its
 * coordinate `<kind>:<pubkey>:<d>`, because a new id comes with every edit and
 * a tagging by id stops pointing at it; Trusted Lists of tagged items list
 * their members by coordinate too. Any other event is named by its id.
 */
export function tagTargetOf(event: { id: string; pubkey: string; kind: number; tags?: string[][] }): TagTarget {
  if (event.kind >= 30000 && event.kind < 40000) {
    const d = event.tags?.find((t) => t[0] === "d")?.[1] ?? "";
    return { address: `${event.kind}:${event.pubkey}:${d}` };
  }
  return { id: event.id };
}
