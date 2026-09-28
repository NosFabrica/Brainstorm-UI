/**
 * A husk is not a post. Some apps "delete" by overwriting an event with
 * nothing instead of publishing a kind-5 deletion (Zap Cooking's recipes,
 * 2026-09-24: content "", tags `d`, `["deleted","true"]`, `["title",
 * "[Deleted]"]`), and the husk then rendered as a "[Deleted]" article on
 * every surface. Team consensus: ignore an event with blank content and no
 * tags that say anything, however it came to be that way.
 *
 * Tags that say nothing: the address (`d`), dates, the publishing app, the
 * accessibility summary, the tombstone itself, and a title that only says
 * "deleted". A listing with empty content but a title and a price is a post;
 * a follow list or relay list with empty content and its `p`/`r` tags is a
 * post; a reaction "+" is a post.
 */
type EventLike = { kind: number; content?: string; tags: string[][] };

const HOUSEKEEPING = new Set(["d", "published_at", "expiration", "client", "alt", "deleted"]);
const DELETED_TITLE = /^\s*\[?\s*deleted\s*\]?\s*$/i;

const saysSomething = (t: string[]): boolean => {
  if (HOUSEKEEPING.has(t[0])) return false;
  if (t[0] === "title") return !!t[1] && !DELETED_TITLE.test(t[1]);
  return true;
};

export function isBlankEvent(event: EventLike): boolean {
  if (event.tags.some((t) => t[0] === "deleted" && (t[1] ?? "").trim().toLowerCase() === "true")) return true;
  if ((event.content ?? "").trim()) return false;
  return !event.tags.some(saysSomething);
}
