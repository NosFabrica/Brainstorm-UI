/**
 * "3h ago" from a Nostr `created_at`.
 *
 * Third copy of this logic was the trigger to extract it: the dashboard module,
 * the your-tags page and the tag page all needed the same thing and had drifted
 * into two slightly different formats. One implementation, two presentations.
 *
 * Deliberately coarse past a day. A tagging is not an event you need to the
 * minute a week later, and precision that fine invites a date library plus a
 * timezone conversation for a line of grey text.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Seconds between `unixSeconds` and now, floored at 0 so clock skew can't read "in 3h". */
function elapsed(unixSeconds: number): number {
  return Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
}

/**
 * `just now`, `3m ago`, `2h ago`, `5d ago`, `3mo ago`, `2y ago`.
 *
 * Returns "" for a falsy timestamp — several tag records carry 0 for "never
 * happened" (a tag surviving only on a dispute has no applied-at), and "56 years
 * ago" is what rendering the epoch looks like.
 */
export function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const secs = elapsed(unixSeconds);
  if (secs < MINUTE) return "just now";
  if (secs < HOUR) return `${Math.floor(secs / MINUTE)}m ago`;
  if (secs < DAY) return `${Math.floor(secs / HOUR)}h ago`;
  if (secs < MONTH) return `${Math.floor(secs / DAY)}d ago`;
  if (secs < YEAR) return `${Math.floor(secs / MONTH)}mo ago`;
  return `${Math.floor(secs / YEAR)}y ago`;
}

/**
 * The same thing without "ago" — for a narrow right-hand column where the word
 * costs more width than it adds meaning.
 */
export function relativeTimeShort(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const secs = elapsed(unixSeconds);
  if (secs < MINUTE) return "now";
  if (secs < HOUR) return `${Math.floor(secs / MINUTE)}m`;
  if (secs < DAY) return `${Math.floor(secs / HOUR)}h`;
  if (secs < MONTH) return `${Math.floor(secs / DAY)}d`;
  if (secs < YEAR) return `${Math.floor(secs / MONTH)}mo`;
  return `${Math.floor(secs / YEAR)}y`;
}
