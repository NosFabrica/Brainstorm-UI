/**
 * How old a GrapeRank run is, in the words the dashboard's status strip uses.
 *
 * The strip's one job is to say whether the reader's scores are current. A
 * date ("Updated Aug 25, 1:51 PM") makes them do the arithmetic; "7 weeks ago"
 * does it for them. Past two weeks the scores are called stale and the strip
 * says so in weeks, with Recalculate as the emphasized action.
 */
const DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 14;

export function scoreAge(
  updatedAt: Date | null | undefined,
  now = Date.now(),
): { label: string; stale: boolean; old: string } | null {
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) return null;
  const days = Math.max(0, Math.floor((now - updatedAt.getTime()) / DAY));
  const weeks = Math.floor(days / 7);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  let label: string;
  if (days === 0) label = "today";
  else if (days === 1) label = "yesterday";
  else if (days < 7) label = `${days} days ago`;
  else if (days < 60) label = `${plural(weeks, "week")} ago`;
  else if (days < 365) label = `${plural(Math.floor(days / 30), "month")} ago`;
  else label = `${plural(Math.floor(days / 365), "year")} ago`;
  return { label, stale: days >= STALE_AFTER_DAYS, old: `${plural(weeks, "week")} old` };
}
