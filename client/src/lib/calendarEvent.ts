// NIP-52 calendar events (kind 31922 date-based / 31923 time-based): parsing,
// display formatting, and an "Add to calendar" Google link (no login needed).

import type { MinimalEvent } from "@/lib/noteRefs";

export interface CalendarEvent {
  title: string;
  startSec: number;
  endSec: number;
  isDateOnly: boolean; // kind 31922 has no time component
  location?: string;
  image?: string;
  summary?: string;
  recordingUrl?: string; // a recording/replay link for past events, when present
}

const toSec = (raw?: string): number => {
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n >= 1e12 ? Math.floor(n / 1000) : n; // tolerate millisecond timestamps
  }
  const ms = new Date(`${raw}T00:00:00`).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};

export function parseCalendarEvent(ev: MinimalEvent): CalendarEvent {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1];
  const recordingUrl =
    tag("recording") ||
    tag("streaming") ||
    (ev.content || "").match(/https?:\/\/\S+\.(mp4|webm|m3u8|mov|youtube\.com\/\S+|youtu\.be\/\S+)/i)?.[0] ||
    undefined;
  return {
    title: tag("title") || tag("name") || "Event",
    startSec: toSec(tag("start")),
    endSec: toSec(tag("end")),
    isDateOnly: ev.kind === 31922,
    location: tag("location"),
    image: tag("image"),
    summary: (tag("summary") || ev.content || "").trim() || undefined,
    recordingUrl,
  };
}

/** "Sat, Jun 29, 2026 · 7:00 PM" (date-only events omit the time). */
export function formatEventDate(startSec: number, isDateOnly: boolean): string {
  if (!startSec) return "";
  const d = new Date(startSec * 1000);
  const datePart = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (isDateOnly) return datePart;
  return `${datePart} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export const isUpcoming = (startSec: number): boolean => startSec >= Math.floor(Date.now() / 1000);

/** A calendar "date tile" — short month + day-of-month (e.g. { month: "JUN", day: "9" }). */
export function eventDateTile(startSec: number): { month: string; day: string } {
  const d = new Date(startSec * 1000);
  return { month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(), day: String(d.getDate()) };
}

/** Human relative time: "Today", "Tomorrow", "In 3 days", "2 weeks ago", … */
export function relativeEventTime(startSec: number): string {
  if (!startSec) return "";
  const startDay = new Date(startSec * 1000); startDay.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Tomorrow";
  if (dayDiff === -1) return "Yesterday";

  const diff = startSec - Math.floor(Date.now() / 1000); // +future / -past
  const abs = Math.abs(diff);
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  let phrase: string;
  if (abs < 3600) phrase = unit(Math.max(1, Math.round(abs / 60)), "minute");
  else if (abs < 86_400) phrase = unit(Math.round(abs / 3600), "hour");
  else if (abs < 2_592_000) phrase = unit(Math.round(abs / 86_400), "day");
  else if (abs < 31_536_000) phrase = unit(Math.round(abs / 2_592_000), "month");
  else phrase = unit(Math.round(abs / 31_536_000), "year");
  return diff >= 0 ? `In ${phrase}` : `${phrase} ago`;
}

/** A Google Calendar "add event" URL — opens a prefilled event, no auth needed. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const fmt = (sec: number) => new Date(sec * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(e.startSec);
  const end = fmt(e.endSec && e.endSec > e.startSec ? e.endSec : e.startSec + 3600);
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${start}/${end}` });
  if (e.summary) params.set("details", e.summary);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
