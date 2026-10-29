/**
 * A town's events as pins on its places' map: the ones still to come (or on
 * now) that say where they are as a geohash (`g`, NIP-52), soonest first. One
 * with only a written location has no pin; it stays in the list of events.
 */
import { isOver, parseCalendarEvent } from "@/lib/calendarEvent";
import { decodeGeohash } from "@/lib/geohash";

export interface EventPin {
  id: string;
  lat: number;
  lon: number;
  name: string;
  startSec: number;
  isDateOnly: boolean;
}

type CalendarLike = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

export function eventPins(events: readonly CalendarLike[], now: number): EventPin[] {
  const pins: EventPin[] = [];
  for (const ev of events) {
    const cell = decodeGeohash(ev.tags.find((t) => t[0] === "g")?.[1] ?? "");
    if (!cell) continue;
    const parsed = parseCalendarEvent(ev as never);
    if (!parsed.startSec || isOver(parsed, now)) continue;
    pins.push({
      id: ev.id,
      lat: cell.lat,
      lon: cell.lon,
      name: parsed.title,
      startSec: parsed.startSec,
      isDateOnly: parsed.isDateOnly,
    });
  }
  return pins.sort((a, b) => a.startSec - b.startSec);
}
