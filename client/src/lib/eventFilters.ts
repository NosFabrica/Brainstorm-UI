/**
 * The Events tab's "When" facet — the calendar work the relay can't do.
 *
 * Probed 2026-09-03: the search relay indexes 44k NIP-52 calendar events but
 * filters and sorts by created_at only; the `start` tag is invisible to it
 * (RELAY-ASKS #9). So the tab fetches a deep recent page and, on-device:
 * upcoming soonest-first (what you can still attend), past newest-first
 * (what just happened). Undated listings are broken, not old — only "all"
 * shows them, last.
 */
import type { SearchHit } from "@/services/search";
import { eventEndSec, parseCalendarEvent } from "@/lib/calendarEvent";

export type EventWhen = "upcoming" | "week" | "month" | "past" | "all";

export const EVENT_WHEN_LABELS: Record<EventWhen, string> = {
  upcoming: "Upcoming",
  week: "This week",
  month: "This month",
  past: "Past",
  all: "All",
};

const DAY = 86_400;

/** Start and end, so an event still in progress (an all-day event today, a
 *  conference that started yesterday) counts as upcoming, not past. */
function spanOf(hit: SearchHit): { start: number; end: number } {
  const cal = parseCalendarEvent(hit.event);
  return { start: cal.startSec, end: cal.startSec ? eventEndSec(cal) : 0 };
}

function inWindow(span: { start: number; end: number }, when: EventWhen, now: number): boolean {
  if (!span.start) return when === "all";
  const on = span.end > now; // not over yet
  switch (when) {
    case "upcoming":
      return on;
    case "week":
      return on && span.start < now + 7 * DAY;
    case "month":
      return on && span.start < now + 30 * DAY;
    case "past":
      return !on;
    case "all":
      return true;
  }
}

/** The hits that fall in the window, in calendar order. */
export function filterEventsByWhen(hits: SearchHit[], when: EventWhen, now: number = Math.floor(Date.now() / 1000)): SearchHit[] {
  const dated = hits.map((hit) => ({ hit, ...spanOf(hit) })).filter((d) => inWindow(d, when, now));
  const upcoming = dated.filter((d) => d.start && d.end > now).sort((a, b) => a.start - b.start);
  const past = dated.filter((d) => d.start && d.end <= now).sort((a, b) => b.start - a.start);
  const undated = dated.filter((d) => !d.start);
  return [...upcoming, ...past, ...undated].map((d) => d.hit);
}

/** How many hits each facet would show — the numbers on the chips. */
export function eventWhenCounts(hits: SearchHit[], now: number = Math.floor(Date.now() / 1000)): Record<EventWhen, number> {
  const spans = hits.map(spanOf);
  const count = (when: EventWhen) => spans.filter((s) => inWindow(s, when, now)).length;
  return { upcoming: count("upcoming"), week: count("week"), month: count("month"), past: count("past"), all: count("all") };
}
