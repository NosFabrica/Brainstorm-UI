import { printedToday } from "@/lib/frontPage/observerSchedule";
import { mergeSiteEditions, utcDay, type EditionEntry } from "@/lib/frontPage/observerSite";

/**
 * One paper the reader has: this tab's own print, or an edition on their Observer site
 * or on the site of the Assistant their schedule names to print (`byRunner`). `day` is
 * the UTC day that names the site's file; `printedAt` is in Unix seconds.
 */
export type Edition<S> =
  | { from: "session"; paper: S; day: string; printedAt: number }
  | { from: "site"; entry: EditionEntry; day: string; printedAt?: number; byRunner?: boolean };

export interface TodayView<S> {
  /** Today's paper, shown as the page; null when none is printed today: the print view. */
  today: Edition<S> | null;
  /** Every other paper the reader can open, newest first. */
  past: Edition<S>[];
}

const sortKey = (e: Edition<unknown>) =>
  e.printedAt !== undefined ? e.printedAt * 1000 : Date.parse(`${e.day}T12:00:00Z`);

/**
 * What the Observer page shows: today's paper, or the print view and the papers before it.
 * An older paper is never shown as the current one.
 *
 * "Today" is the rule of the "Already printed today" hint (`printedToday`): a calendar day
 * in `zone`, which the caller picks with `printedTodayZone` (the schedule's zone when it has
 * a readable one, else the viewer's), and `now` ticks so the answer rolls over at midnight.
 * Between this tab's paper and one on the site that both count, the newer wins, and this
 * tab's on a tie (it is the same print, with more known about it). An edition whose UTC day
 * is today's file is that file, so it is not listed again among the past ones; this tab's
 * paper from an earlier day is listed only when the site holds nothing for its day.
 *
 * While the reader's schedule names a runner (their Brainstorm Assistant), its site is
 * read too (`runnerSite`): today's paper comes from either, and the two histories merge,
 * one edition per day (`mergeSiteEditions`).
 */
export function observerToday<S extends { printedAt: number }>({
  site,
  runnerSite = [],
  session,
  now,
  zone,
}: {
  site: readonly EditionEntry[];
  /** The editions on the site of the runner the reader's own schedule names; none without one. */
  runnerSite?: readonly EditionEntry[];
  /** This tab's paper; `printedAt` in milliseconds. */
  session: S | null;
  now: number;
  zone: string;
}): TodayView<S> {
  const fromSite: Edition<S>[] = mergeSiteEditions(site, runnerSite).map(({ entry, byRunner }) => ({
    from: "site",
    entry,
    day: entry.day,
    printedAt: entry.printedAt,
    ...(byRunner ? { byRunner } : {}),
  }));
  const mine: Edition<S> | null = session
    ? {
        from: "session",
        paper: session,
        day: utcDay(session.printedAt),
        printedAt: Math.floor(session.printedAt / 1000),
      }
    : null;

  const siteToday = printedToday(fromSite, now, zone);
  const mineToday = mine && printedToday([mine], now, zone);
  const today =
    mineToday && (!siteToday || siteToday.printedAt === undefined || mineToday.printedAt! >= siteToday.printedAt)
      ? mineToday
      : siteToday;

  const past = fromSite.filter((e) => e !== today && e.day !== today?.day);
  if (mine && mine !== today && mine.day !== today?.day && !fromSite.some((e) => e.day === mine.day)) {
    past.push(mine);
  }
  past.sort((a, b) => sortKey(b) - sortKey(a) || b.day.localeCompare(a.day));
  return { today, past };
}
