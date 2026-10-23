import { describe, expect, it } from "vitest";
import { formatEventTime, parseCalendarEvent, shortPlace } from "./calendarEvent";

describe("formatEventTime", () => {
  it("says the clock time, or All day for a date-only event", () => {
    const at = Math.floor(new Date(2026, 8, 4, 19, 0).getTime() / 1000);
    expect(formatEventTime(at, false)).toMatch(/7:00\s?PM|19:00/);
    expect(formatEventTime(at, true)).toBe("All day");
    expect(formatEventTime(0, false)).toBe("");
  });
});

describe("shortPlace", () => {
  // Luma names the venue and the town, not the postal address.
  it("keeps the venue and the town, dropping street, postcode and country", () => {
    expect(shortPlace("235 Robert Parker Coffin Road, Long Grove, IL, USA")).toBe("Long Grove, IL");
    expect(shortPlace("200 N La Salle St, 200 N La Salle St, Chicago, IL, United States")).toBe("Chicago, IL");
    expect(shortPlace("Juniata Brewing Company, 1102 Susquehanna Ave, Huntingdon, PA 16652")).toBe(
      "Juniata Brewing Company, Huntingdon",
    );
    expect(shortPlace("Yuzu House, Bratislava")).toBe("Yuzu House, Bratislava");
    expect(shortPlace("Chicago, IL")).toBe("Chicago, IL");
    expect(shortPlace("Online")).toBe("Online");
    expect(shortPlace("")).toBe("");
  });
});

describe("parseCalendarEvent — the replay link", () => {
  const ev = (tags: string[][], content = "") => ({
    id: "e".repeat(64),
    pubkey: "a".repeat(64),
    kind: 31923,
    created_at: 1,
    tags: [["d", "x"], ["start", "1600000000"], ...tags],
    content,
  });

  // Audit: a `recording` of `javascript:…` became the card's "Watch replay" href.
  it("is only ever a web address", () => {
    expect(parseCalendarEvent(ev([["recording", "javascript:alert(2)"]])).recordingUrl).toBeUndefined();
    expect(parseCalendarEvent(ev([["streaming", "data:text/html,hi"]])).recordingUrl).toBeUndefined();
    expect(
      parseCalendarEvent(
        ev([
          ["recording", "javascript:alert(2)"],
          ["streaming", "https://live.example/s"],
        ]),
      ).recordingUrl,
    ).toBe("https://live.example/s");
    expect(parseCalendarEvent(ev([["recording", " https://v.example/r.mp4 "]])).recordingUrl).toBe(
      "https://v.example/r.mp4",
    );
  });
});

// Event Index's list items (kind 39999 under its Events list) copy NIP-52's
// field names: a timed one has a unix start, an all-day one a date; the
// organizer is text, never a nostr name; "Cancelled: " in the title is the
// status for clients that ignore the tag.
describe("parseCalendarEvent — a list item", () => {
  const item = (tags: string[][]) => ({ kind: 39999, content: "", tags: [["d", "luma:pubkey-ldkz"], ...tags] });

  it("reads a timed item as NIP-52's twin, with its organizer as the host", () => {
    const e = parseCalendarEvent(
      item([
        ["title", "Bitcoin & Coffee"],
        ["start", "1793223000"],
        ["end", "1793232000"],
        ["organizer", "PubKey Bitcoin Events"],
        ["location", "Pubkey, 410 7th St NW, Washington, DC 20004, USA"],
      ]) as never,
    );
    expect(e.title).toBe("Bitcoin & Coffee");
    expect(e.startSec).toBe(1793223000);
    expect(e.endSec).toBe(1793232000);
    expect(e.isDateOnly).toBe(false);
    expect(e.organizer).toBe("PubKey Bitcoin Events");
    expect(e.location).toContain("Washington");
  });

  it("reads a dated item as all day, and a cancelled one as cancelled", () => {
    const allDay = parseCalendarEvent(
      item([
        ["title", "Hackday"],
        ["start", "2026-11-07"],
        ["end", "2026-11-08"],
      ]) as never,
    );
    expect(allDay.isDateOnly).toBe(true);
    expect(allDay.startSec).toBe(Math.floor(new Date("2026-11-07T00:00:00").getTime() / 1000));
    const off = parseCalendarEvent(
      item([
        ["title", "Cancelled: Hackday"],
        ["start", "2026-11-07"],
        ["status", "cancelled"],
      ]) as never,
    );
    expect(off.cancelled).toBe(true);
    expect(off.title).toBe("Hackday");
  });
});
