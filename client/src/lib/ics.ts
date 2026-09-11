/**
 * An iCalendar file for one event — what "Add to calendar" hands the reader.
 * Every calendar app opens .ics; no vendor sits between the reader and their
 * own calendar. Times are written in UTC; a date-only event is written as
 * dates (its DTEND is the next day, as iCalendar requires); a timed event
 * with no end is given two hours.
 */
export interface IcsInput {
  uid: string;
  title: string;
  startSec: number;
  endSec: number;
  isDateOnly: boolean;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const stampUtc = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
const dateUtc = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
};
/** RFC 5545 text: backslashes, semicolons and commas escaped, newlines as \n. */
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildIcs(input: IcsInput): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Brainstorm//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT"];
  lines.push(`UID:${input.uid}`);
  lines.push(`DTSTAMP:${stampUtc(Math.floor(Date.now() / 1000))}`);
  if (input.isDateOnly) {
    const end = input.endSec > input.startSec ? input.endSec : input.startSec + 86_400;
    lines.push(`DTSTART;VALUE=DATE:${dateUtc(input.startSec)}`);
    lines.push(`DTEND;VALUE=DATE:${dateUtc(end)}`);
  } else {
    const end = input.endSec > input.startSec ? input.endSec : input.startSec + 2 * 3600;
    lines.push(`DTSTART:${stampUtc(input.startSec)}`);
    lines.push(`DTEND:${stampUtc(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(input.title)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map((l) => l + "\r\n").join("");
}

/** A safe file name from a title: "Bitcoin Liverpool Meetup" → "bitcoin-liverpool-meetup.ics". */
export function icsFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "event"}.ics`;
}

/** Hand the reader the file: a Blob, an object URL, one programmatic click. */
export function downloadIcs(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
