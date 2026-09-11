/**
 * "Add to calendar" hands the reader an .ics file — the one format every
 * calendar app opens — built here, no vendor in between.
 */
import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";

describe("buildIcs", () => {
  it("writes a timed event in UTC with title, place, description and link, escaping what iCalendar needs escaped", () => {
    const ics = buildIcs({
      uid: "31923:abc:meetup@brainstorm",
      title: "Bitcoin Liverpool Meetup; Sept",
      startSec: Date.UTC(2026, 8, 5, 19, 0) / 1000,
      endSec: Date.UTC(2026, 8, 5, 21, 30) / 1000,
      isDateOnly: false,
      location: "The Baltic Fleet, Liverpool, UK",
      description: "Talks, then drinks.\nBring a friend.",
      url: "https://brainstorm.world/e/nevent1abc",
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:31923:abc:meetup@brainstorm\r\n");
    expect(ics).toContain("DTSTART:20260905T190000Z\r\n");
    expect(ics).toContain("DTEND:20260905T213000Z\r\n");
    expect(ics).toContain("SUMMARY:Bitcoin Liverpool Meetup\\; Sept\r\n");
    expect(ics).toContain("LOCATION:The Baltic Fleet\\, Liverpool\\, UK\r\n");
    expect(ics).toContain("DESCRIPTION:Talks\\, then drinks.\\nBring a friend.\r\n");
    expect(ics).toContain("URL:https://brainstorm.world/e/nevent1abc\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("writes an all-day event as dates, ending the next day", () => {
    const ics = buildIcs({ uid: "x", title: "Fair", startSec: Date.UTC(2026, 8, 5) / 1000, endSec: 0, isDateOnly: true });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260905\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260906\r\n");
  });
  it("a timed event with no end gets a two-hour one", () => {
    const ics = buildIcs({ uid: "x", title: "Talk", startSec: Date.UTC(2026, 8, 5, 19, 0) / 1000, endSec: 0, isDateOnly: false });
    expect(ics).toContain("DTEND:20260905T210000Z\r\n");
  });
});
