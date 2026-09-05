/**
 * "Add to calendar" the way the device wants it. No browser tells a page
 * which calendar app someone uses, but the operating system is a strong
 * proxy: iPhone, iPad and Mac take an .ics straight into Apple Calendar;
 * Android lives in Google Calendar, which takes a link; Windows skews to
 * Outlook, which takes a link too. Everyone can still pick another.
 */
import { describe, expect, it } from "vitest";
import { detectCalendarPlatform, googleCalendarUrl, outlookCalendarUrl, preferredCalendar } from "./calendarLinks";

const event = { uid: "31923:pk:v4v@brainstorm", title: "V4V Chicago: Meet & Greet", startSec: 1_788_555_600, endSec: 1_788_562_800, isDateOnly: false, location: "600 Brazos St, Austin, TX", description: "Bring a friend", url: "https://brainstorm.world/e/nevent1abc" };

describe("detectCalendarPlatform — the operating system, from what the browser says", () => {
  it("reads the modern hint first, then the user agent", () => {
    expect(detectCalendarPlatform("Mozilla/5.0 (X11; Linux) Chrome/120", "macOS")).toBe("mac");
    expect(detectCalendarPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe("ios");
    expect(detectCalendarPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectCalendarPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari")).toBe("mac");
    expect(detectCalendarPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile")).toBe("android");
    expect(detectCalendarPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe("windows");
    expect(detectCalendarPlatform("Mozilla/5.0 (X11; Linux x86_64) Firefox/120")).toBe("other");
  });
  it("maps a platform to the calendar it most likely uses", () => {
    expect(preferredCalendar("ios")).toBe("apple");
    expect(preferredCalendar("mac")).toBe("apple");
    expect(preferredCalendar("android")).toBe("google");
    expect(preferredCalendar("windows")).toBe("outlook");
    expect(preferredCalendar("other")).toBe("google");
  });
});

describe("web calendar links carry the whole event", () => {
  it("Google Calendar: title, UTC span, place and notes with the event's page", () => {
    const u = new URL(googleCalendarUrl(event));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("V4V Chicago: Meet & Greet");
    expect(u.searchParams.get("dates")).toBe("20260904T210000Z/20260904T230000Z");
    expect(u.searchParams.get("location")).toBe("600 Brazos St, Austin, TX");
    expect(u.searchParams.get("details")).toContain("Bring a friend");
    expect(u.searchParams.get("details")).toContain("https://brainstorm.world/e/nevent1abc");
  });
  it("an all-day event spans whole dates; a missing end is two hours", () => {
    const allDay = new URL(googleCalendarUrl({ ...event, isDateOnly: true, endSec: 0 }));
    expect(allDay.searchParams.get("dates")).toBe("20260904/20260905");
    const openEnded = new URL(googleCalendarUrl({ ...event, endSec: 0 }));
    expect(openEnded.searchParams.get("dates")).toBe("20260904T210000Z/20260904T230000Z");
  });
  it("Outlook: subject, ISO start and end, place and body", () => {
    const u = new URL(outlookCalendarUrl(event));
    expect(u.hostname).toBe("outlook.live.com");
    expect(u.searchParams.get("rru")).toBe("addevent");
    expect(u.searchParams.get("subject")).toBe("V4V Chicago: Meet & Greet");
    expect(u.searchParams.get("startdt")).toBe("2026-09-04T21:00:00Z");
    expect(u.searchParams.get("enddt")).toBe("2026-09-04T23:00:00Z");
    expect(u.searchParams.get("location")).toBe("600 Brazos St, Austin, TX");
    expect(u.searchParams.get("allday")).toBe("false");
    expect(new URL(outlookCalendarUrl({ ...event, isDateOnly: true })).searchParams.get("allday")).toBe("true");
  });
});
