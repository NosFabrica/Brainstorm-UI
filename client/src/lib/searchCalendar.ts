/**
 * A month as arithmetic — the half of the date picker with no DOM in it, so its traps (a 23- or
 * 25-hour local day, February's lengths, a locale's first weekday) are testable. Dates in and
 * out are local and at midnight, matching what `searchQuery`'s dayBound means by a day.
 *
 * Ported from the relay's own operator field (`web/shared/calendar.js`).
 */
import { ymd } from "@/lib/searchQuery";

/** The same day at 00:00 local, the only shape the rest of this file passes. */
export const midnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `n` days later, by local date fields rather than milliseconds, so the clock-change days land right. */
export const shiftDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The 1st of the month `n` months away, the grid's own unit of position. */
export const shiftMonths = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

export const sameMonth = (a: Date | null, b: Date | null): boolean =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
export const sameDay = (a: Date | null, b: Date | null): boolean =>
  sameMonth(a, b) && a!.getDate() === b!.getDate();

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
const DAY_FMT = fmt({ day: "numeric", month: "short", year: "numeric" });
const MONTH_FMT = fmt({ month: "long", year: "numeric" });

/** A day in the reader's own spelling, for a pill and a grid cell. */
export const dayLabel = (d: Date): string => DAY_FMT.format(d);
/** The month above the grid, likewise. */
export const monthLabel = (d: Date): string => MONTH_FMT.format(d);

/**
 * Which weekday a week starts on, 0 = Sunday: the locale's `weekInfo` where the browser has it,
 * else ISO Monday.
 */
export function weekStart(): number {
  try {
    // weekInfo counts 1..7 from Monday; JS dates count 0..6 from Sunday.
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    const first = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch {
    /* no weekInfo here, so ISO */
  }
  return 1;
}

export const WEEK_START = weekStart();

/**
 * The seven column headings in this locale's week order, narrow for the heading and long for
 * the hover. 4 January 2026 is a Sunday.
 */
export const dowNames = (start = WEEK_START): { narrow: string; long: string }[] =>
  Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + start + i)).map((d) => ({
    narrow: fmt({ weekday: "narrow" }).format(d),
    long: fmt({ weekday: "long" }).format(d),
  }));

export const DOW = dowNames();

export interface GridDay {
  at: Date;
  /** The `YYYY-MM-DD` the token is written as. */
  value: string;
  today: boolean;
  ahead: boolean;
}

/**
 * One month as the cells a seven-column grid draws. `lead` is the blanks before the 1st.
 * `today` is passed in so a test can pick its day.
 */
export function monthGrid(month: Date, today: Date, start = WEEK_START): {
  label: string;
  lead: number;
  days: GridDay[];
} {
  const y = month.getFullYear();
  const m = month.getMonth();
  // Day 0 of the next month is the last day of this one.
  const count = new Date(y, m + 1, 0).getDate();
  return {
    label: monthLabel(new Date(y, m, 1)),
    lead: (new Date(y, m, 1).getDay() - start + 7) % 7,
    days: Array.from({ length: count }, (_, i) => {
      const at = new Date(y, m, i + 1);
      return { at, value: ymd(at), today: sameDay(at, today), ahead: at > today };
    }),
  };
}

/** The month a half-typed date names, or null while it names none; a partial year or day is not read. */
export function typedMonth(partial: string): Date | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(partial || ""));
  if (!m) return null;
  const [y, mo] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12) return null;
  const at = new Date(y, mo - 1, 1);
  // The constructor reads `26` as 1926, so a year that did not survive it is not a year.
  return at.getFullYear() === y ? at : null;
}

/**
 * The shortcuts under the grid, written into the box as absolute days: a saved url reading
 * `since:7d` would mean a different search every morning.
 */
const QUICK: Record<string, [string, number][]> = {
  since: [["Today", 0], ["Last 7 days", -6], ["Last 30 days", -29], ["Last 90 days", -89]],
  until: [["Today", 0], ["Yesterday", -1], ["A week ago", -7], ["A month ago", -30]],
};

export const quickPicks = (field: string, today: Date): { label: string; value: string }[] =>
  (QUICK[field] || []).map(([label, off]) => ({ label, value: ymd(shiftDays(today, off)) }));
