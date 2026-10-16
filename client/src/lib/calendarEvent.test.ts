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

// NIP-52 has no way to say an event is cancelled yet. The form proposed for it is a `status` tag
// (iCalendar's STATUS): the event is republished at the same address with `cancelled`. A title
// that says so is the author's words, and is left as written.
describe("parseCalendarEvent — a cancelled event", () => {
  const ev = (tags: string[][]) => ({ id: "x", pubkey: "p", kind: 31923, created_at: 0, content: "", tags });

  it("reads a status tag of cancelled, in any case", () => {
    expect(
      parseCalendarEvent(
        ev([
          ["title", "Pizza night"],
          ["status", "cancelled"],
        ]),
      ),
    ).toMatchObject({
      cancelled: true,
      title: "Pizza night",
    });
    expect(
      parseCalendarEvent(
        ev([
          ["title", "Pizza night"],
          ["status", " Cancelled "],
        ]),
      ).cancelled,
    ).toBe(true);
  });

  it("is not cancelled for any other status, or none", () => {
    expect(
      parseCalendarEvent(
        ev([
          ["title", "Pizza night"],
          ["status", "confirmed"],
        ]),
      ).cancelled,
    ).toBe(false);
    expect(
      parseCalendarEvent(
        ev([
          ["title", "Pizza night"],
          ["status", "tentative"],
        ]),
      ).cancelled,
    ).toBe(false);
    expect(parseCalendarEvent(ev([["title", "Pizza night"]])).cancelled).toBe(false);
  });

  it("leaves a title that says Cancelled as written, and does not read it as the state", () => {
    expect(parseCalendarEvent(ev([["title", "Cancelled: Pizza night"]]))).toMatchObject({
      cancelled: false,
      title: "Cancelled: Pizza night",
    });
  });
});
