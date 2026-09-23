// @vitest-environment node
/**
 * The Events tab's "When" facet. Probed 2026-09-03: the search relay holds
 * 44k NIP-52 calendar events but only knows created_at — it cannot filter
 * or sort by the `start` tag. So the tab asks for a deep recent page and
 * does the calendar work here: upcoming soonest-first (what you can still
 * attend), past newest-first (what just happened), counted per facet.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { eventWhenCounts, filterEventsByWhen } from "./eventFilters";

const DAY = 86_400;
const now = 1_760_000_000; // a fixed "now"
const hit = (id: string, kind: number, start: string): SearchHit => ({
  event: { id, kind, pubkey: "a".repeat(64), created_at: now, content: "", sig: "", tags: [["d", id], ["title", id], ["start", start]] } as NostrEvent,
  author: null,
  rank: null,
});
const inHours = (h: number) => String(now + h * 3600);
const ymd = (offsetDays: number) => {
  const d = new Date((now + offsetDays * DAY) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const hits = [
  hit("lastMonth", 31923, inHours(-40 * 24)),
  hit("yesterday", 31923, inHours(-30)),
  hit("nextWeek", 31923, inHours(10 * 24)),
  hit("tonight", 31923, inHours(5)),
  hit("dateOnlyIn3Days", 31922, ymd(3)),
  hit("in6Weeks", 31923, inHours(42 * 24)),
  hit("noStart", 31923, ""),
];

describe("filterEventsByWhen", () => {
  it("upcoming: everything from now on, soonest first", () => {
    expect(filterEventsByWhen(hits, "upcoming", now).map((h) => h.event.id)).toEqual(["tonight", "dateOnlyIn3Days", "nextWeek", "in6Weeks"]);
  });

  it("this week / this month: the upcoming window, soonest first", () => {
    expect(filterEventsByWhen(hits, "week", now).map((h) => h.event.id)).toEqual(["tonight", "dateOnlyIn3Days"]);
    expect(filterEventsByWhen(hits, "month", now).map((h) => h.event.id)).toEqual(["tonight", "dateOnlyIn3Days", "nextWeek"]);
  });

  it("past: what already started, most recent first", () => {
    expect(filterEventsByWhen(hits, "past", now).map((h) => h.event.id)).toEqual(["yesterday", "lastMonth"]);
  });

  // A calendar event with no start is a broken listing, not a date — it
  // never counts as upcoming or past, and only "all" still shows it (last).
  it("all: upcoming first, then past, undated last", () => {
    expect(filterEventsByWhen(hits, "all", now).map((h) => h.event.id)).toEqual([
      "tonight", "dateOnlyIn3Days", "nextWeek", "in6Weeks", "yesterday", "lastMonth", "noStart",
    ]);
  });

  // Review catch: an all-day event TODAY (kind 31922 parses to local
  // midnight) and a multi-day event that started yesterday and ends
  // tomorrow are both still happening — "upcoming" means not over yet.
  it("an event still in progress counts as upcoming, ordered by its start", () => {
    const todayAllDay = hit("todayAllDay", 31922, ymd(0));
    const running: SearchHit = {
      ...hit("running", 31923, inHours(-20)),
      event: { ...hit("running", 31923, inHours(-20)).event, tags: [["d", "running"], ["title", "running"], ["start", inHours(-20)], ["end", inHours(30)]] } as NostrEvent,
    };
    const ids = filterEventsByWhen([...hits, todayAllDay, running], "upcoming", now).map((h) => h.event.id);
    expect(ids.slice(0, 2)).toEqual(["running", "todayAllDay"]);
    expect(filterEventsByWhen([todayAllDay, running], "past", now)).toEqual([]);
    expect(eventWhenCounts([todayAllDay, running], now).upcoming).toBe(2);
  });

  it("counts each facet for the chips", () => {
    expect(eventWhenCounts(hits, now)).toEqual({
      today: expect.any(Number),
      weekend: expect.any(Number), upcoming: 4, week: 2, month: 3, past: 2, all: 7 });
  });

  // Luma's quick picks: what is on today, and what is on this weekend.
  it("today: what is still on before midnight; weekend: Saturday and Sunday, this or the coming one", () => {
    const local = new Date(now * 1000);
    const dow = local.getDay(); // 0 Sun … 6 Sat
    const daysToSat = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow; // the weekend we are in, or the next
    const satNoon = new Date(local); satNoon.setDate(local.getDate() + daysToSat); satNoon.setHours(12, 0, 0, 0);
    const sunNoon = new Date(satNoon); sunNoon.setDate(satNoon.getDate() + 1);
    const laterTonight = new Date(local); laterTonight.setHours(23, 30, 0, 0);
    const extra = [
      hit("laterTonight", 31923, String(Math.floor(laterTonight.getTime() / 1000))),
      hit("satNoon", 31923, String(Math.floor(satNoon.getTime() / 1000))),
      hit("sunNoon", 31923, String(Math.floor(sunNoon.getTime() / 1000))),
    ];
    const todays = filterEventsByWhen([...hits, ...extra], "today", now).map((h) => h.event.id);
    expect(todays).toContain("laterTonight");
    expect(todays).not.toContain("nextWeek");
    expect(todays).not.toContain("yesterday");
    const weekend = filterEventsByWhen([...hits, ...extra], "weekend", now).map((h) => h.event.id);
    expect(weekend).toEqual(expect.arrayContaining(["satNoon", "sunNoon"]));
    expect(weekend).not.toContain("in6Weeks");
    const counts = eventWhenCounts([...hits, ...extra], now);
    expect(counts.today).toBeGreaterThanOrEqual(1);
    expect(counts.weekend).toBeGreaterThanOrEqual(2);
  });
});
