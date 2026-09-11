/**
 * "Add to calendar" the way the device wants it. No browser tells a page which
 * calendar app someone uses, but the operating system is a strong proxy:
 * iPhone, iPad and Mac take an .ics straight into Apple Calendar; Android
 * lives in Google Calendar, which takes a link; Windows skews to Outlook,
 * which takes a link too. Everyone can still pick another — the caret.
 */
import type { IcsInput } from "@/lib/ics";

export type CalendarPlatform = "ios" | "mac" | "android" | "windows" | "other";
export type CalendarTarget = "apple" | "google" | "outlook";

export function detectCalendarPlatform(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  hint: string | undefined = typeof navigator !== "undefined" ? (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform : undefined,
): CalendarPlatform {
  const h = (hint ?? "").toLowerCase();
  if (h) {
    if (h === "ios") return "ios";
    if (h === "macos") return "mac";
    if (h === "android") return "android";
    if (h === "windows") return "windows";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  return "other";
}

/** The calendar a platform most likely uses; the web's most common one otherwise. */
export function preferredCalendar(platform: CalendarPlatform): CalendarTarget {
  if (platform === "ios" || platform === "mac") return "apple";
  if (platform === "windows") return "outlook";
  return "google";
}

export const CALENDAR_LABEL: Record<CalendarTarget, string> = {
  apple: "Apple Calendar",
  google: "Google Calendar",
  outlook: "Outlook",
};

const pad = (n: number) => String(n).padStart(2, "0");
const stampUtc = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
const dateUtc = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
const isoUtc = (sec: number) => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

/** The end as published; two hours after the start when none was; the next day for an all-day event. */
function endOf(input: IcsInput): number {
  if (input.isDateOnly) return input.endSec > input.startSec ? input.endSec : input.startSec + 86_400;
  return input.endSec > input.startSec ? input.endSec : input.startSec + 7_200;
}

function notes(input: IcsInput): string {
  return [input.description?.trim(), input.url].filter(Boolean).join("\n\n");
}

/** Google Calendar's add-event template. */
export function googleCalendarUrl(input: IcsInput): string {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", input.title);
  const end = endOf(input);
  u.searchParams.set("dates", input.isDateOnly ? `${dateUtc(input.startSec)}/${dateUtc(end)}` : `${stampUtc(input.startSec)}/${stampUtc(end)}`);
  if (input.location) u.searchParams.set("location", input.location);
  const details = notes(input);
  if (details) u.searchParams.set("details", details);
  return u.toString();
}

/** Outlook.com's compose deep link (Office 365 accepts the same shape). */
export function outlookCalendarUrl(input: IcsInput): string {
  const u = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  u.searchParams.set("path", "/calendar/action/compose");
  u.searchParams.set("rru", "addevent");
  u.searchParams.set("subject", input.title);
  u.searchParams.set("startdt", isoUtc(input.startSec));
  u.searchParams.set("enddt", isoUtc(endOf(input)));
  u.searchParams.set("allday", input.isDateOnly ? "true" : "false");
  if (input.location) u.searchParams.set("location", input.location);
  const body = notes(input);
  if (body) u.searchParams.set("body", body);
  return u.toString();
}
