/** The Events tab: a window of time (Upcoming by default), calendars after, and a header per day. */
import type { SearchHit } from "@/services/search";
import { filterEventsByWhen, type EventWhen } from "@/lib/eventFilters";
import { isOver, parseCalendarEvent as parseCal, relativeEventTime as relativeDay } from "@/lib/calendarEvent";
import { CALENDAR_KIND } from "@/components/search/tabKinds";
import type { DisplayRow } from "./types";

/** The Events timeline's day headers, one formatter for all of them. */
const DAY_HEADER = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

/** Calendars have no date to window by: they follow the dated events, whichever window is picked. */
export function eventRows(shown: SearchHit[], when: EventWhen): SearchHit[] {
  return [
    ...filterEventsByWhen(
      shown.filter((h) => h.event.kind !== CALENDAR_KIND),
      when,
    ),
    ...shown.filter((h) => h.event.kind === CALENDAR_KIND),
  ];
}

export interface DayHeader {
  key: string;
  startSec: number;
  label: string;
}

/**
 * The Events tab is a timeline: the first card of each day carries a header
 * that says the date once — "Today · Fri, Sep 4" — so cards can lead with
 * their time. Undated events gather at the end. Keyed by the row's event id.
 */
export function eventDayHeaders(
  rows: readonly DisplayRow[],
  when: EventWhen,
  now = Date.now(),
): Map<string, DayHeader> {
  const out = new Map<string, DayHeader>();
  let last: string | null = null;
  const nowSec = Math.floor(now / 1000);
  // A date-only event starts at local midnight: begun before today, not before now, is running.
  const todaySec = Math.floor(new Date(now).setHours(0, 0, 0, 0) / 1000);
  for (const row of rows) {
    if (row.hit.event.kind === CALENDAR_KIND) {
      if (last === "calendars") continue;
      last = "calendars";
      out.set(row.hit.event.id, { key: "calendars", startSec: 0, label: "Calendars" });
      continue;
    }
    const cal = parseCal(row.hit.event);
    const d = cal.startSec ? new Date(cal.startSec * 1000) : null;
    // Already running — a conference on its second day, a walk series that
    // started last week — is not a date to lead Upcoming with; it is "Ongoing".
    if (d && cal.startSec < (cal.isDateOnly ? todaySec : nowSec) && !isOver(cal) && when !== "past") {
      if (last === "ongoing") continue;
      last = "ongoing";
      out.set(row.hit.event.id, { key: "ongoing", startSec: 0, label: "Ongoing" });
      continue;
    }
    const key = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      : "tba";
    if (key === last) continue;
    last = key;
    const rel = d ? relativeDay(cal.startSec) : "";
    const dayWord = rel === "Today" || rel === "Tomorrow" || rel === "Yesterday" ? rel : null;
    const long = d ? DAY_HEADER.format(d) : "";
    out.set(row.hit.event.id, {
      key,
      startSec: cal.startSec,
      label: d ? (dayWord ? `${dayWord} · ${long}` : long) : "Date to be announced",
    });
  }
  return out;
}
