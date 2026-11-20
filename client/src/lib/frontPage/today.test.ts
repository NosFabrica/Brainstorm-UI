import { describe, expect, it } from "vitest";
import type { EditionEntry } from "@/lib/frontPage/observerSite";
import { observerToday } from "@/lib/frontPage/today";

const NY = "America/New_York";
const TOKYO = "Asia/Tokyo";
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/** A site entry printed at `iso` (UTC), named by its UTC day as the site names it. */
const entry = (iso: string, extra: Partial<EditionEntry> = {}): EditionEntry => {
  const day = iso.slice(0, 10);
  return { day, path: `/${day}.html`, sha256: day, printedAt: sec(iso), headline: `Printed ${iso}`, ...extra };
};
const paper = (iso: string) => ({ printedAt: Date.parse(iso), code: iso });

// 2026-11-11 06:30 in New York (UTC-5); 20:30 in Tokyo.
const NOW = Date.parse("2026-11-11T11:30:00Z");

describe("observerToday", () => {
  it("shows today's edition from the site as now, and the rest as past, newest first", () => {
    const site = [entry("2026-11-11T10:00:00Z"), entry("2026-11-09T10:00:00Z"), entry("2026-11-10T10:00:00Z")];
    const view = observerToday({ site, session: null, now: NOW, zone: NY });
    expect(view.today).toMatchObject({ from: "site", day: "2026-11-11" });
    expect(view.past.map((e) => e.day)).toEqual(["2026-11-10", "2026-11-09"]);
  });

  it("with nothing printed today, shows no paper as now, however recent the last one", () => {
    // 10:31 New York yesterday: under 24 hours ago, but not today.
    const site = [entry("2026-11-10T15:31:00Z"), entry("2026-11-08T10:00:00Z")];
    const view = observerToday({ site, session: null, now: NOW, zone: NY });
    expect(view.today).toBeNull();
    expect(view.past.map((e) => e.day)).toEqual(["2026-11-10", "2026-11-08"]);
  });

  it("with no editions at all, shows the print view and lists nothing", () => {
    expect(observerToday({ site: [], session: null, now: NOW, zone: NY })).toEqual({ today: null, past: [] });
  });

  it("reads today in the given zone: a paper from 21:00 last night in New York is already today in Tokyo", () => {
    // 2026-11-11 02:00 UTC: the 10th in New York, the 11th in Tokyo (and in UTC).
    const site = [entry("2026-11-11T02:00:00Z")];
    expect(observerToday({ site, session: null, now: NOW, zone: NY }).today).toBeNull();
    expect(observerToday({ site, session: null, now: NOW, zone: NY }).past).toHaveLength(1);
    expect(observerToday({ site, session: null, now: NOW, zone: TOKYO }).today).toMatchObject({ from: "site" });
    expect(observerToday({ site, session: null, now: NOW, zone: TOKYO }).past).toEqual([]);
  });

  it("rolls over at midnight in the zone: today's paper becomes a past edition", () => {
    const site = [entry("2026-11-11T10:00:00Z")]; // 05:00 New York on the 11th
    const before = Date.parse("2026-11-12T04:59:00Z"); // 23:59 New York
    const after = Date.parse("2026-11-12T05:00:00Z"); // 00:00 New York on the 12th
    expect(observerToday({ site, session: null, now: before, zone: NY }).today).not.toBeNull();
    const next = observerToday({ site, session: null, now: after, zone: NY });
    expect(next.today).toBeNull();
    expect(next.past.map((e) => e.day)).toEqual(["2026-11-11"]);
  });

  it("an entry with no print time counts as today by its UTC day", () => {
    const site = [entry("2026-11-11T10:00:00Z", { printedAt: undefined }), entry("2026-11-10T10:00:00Z")];
    const view = observerToday({ site, session: null, now: NOW, zone: NY });
    expect(view.today).toMatchObject({ day: "2026-11-11" });
    expect(view.past.map((e) => e.day)).toEqual(["2026-11-10"]);
  });

  it("this tab's paper printed today is today's, and its copy on the site isn't listed again", () => {
    const mine = paper("2026-11-11T11:00:00.700Z");
    // The site records the same print in whole seconds.
    const site = [entry("2026-11-11T11:00:00Z"), entry("2026-11-10T10:00:00Z")];
    const view = observerToday({ site, session: mine, now: NOW, zone: NY });
    expect(view.today).toMatchObject({ from: "session", paper: mine });
    expect(view.past.map((e) => e.day)).toEqual(["2026-11-10"]);
  });

  it("a newer print on the site, from another device, wins over this tab's earlier one", () => {
    const mine = paper("2026-11-11T10:00:00Z");
    const site = [entry("2026-11-11T11:00:00Z")];
    const view = observerToday({ site, session: mine, now: NOW, zone: NY });
    expect(view.today).toMatchObject({ from: "site", day: "2026-11-11" });
    expect(view.past).toEqual([]);
  });

  it("this tab's paper from an earlier day is a past edition, unless the site holds that day", () => {
    const mine = paper("2026-11-10T10:00:00Z");
    const alone = observerToday({ site: [], session: mine, now: NOW, zone: NY });
    expect(alone.today).toBeNull();
    expect(alone.past).toEqual([expect.objectContaining({ from: "session", day: "2026-11-10" })]);

    const published = observerToday({ site: [entry("2026-11-10T10:00:00Z")], session: mine, now: NOW, zone: NY });
    expect(published.past).toEqual([expect.objectContaining({ from: "site", day: "2026-11-10" })]);
  });

  it("ignores a print time far in the future: another device's broken clock is not today's paper", () => {
    const site = [entry("2026-11-11T20:00:00Z")];
    expect(observerToday({ site, session: null, now: NOW, zone: NY }).today).toBeNull();
  });
});

describe("observerToday with the Assistant's site", () => {
  it("shows today's paper from the Assistant's site when the reader's has none", () => {
    const view = observerToday({
      site: [entry("2026-11-10T10:00:00Z")],
      runnerSite: [entry("2026-11-11T11:05:00Z", { sha256: "r" })],
      session: null,
      now: NOW,
      zone: NY,
    });
    expect(view.today).toMatchObject({ from: "site", day: "2026-11-11", byRunner: true });
    expect(view.past.map((e) => e.day)).toEqual(["2026-11-10"]);
  });

  it("merges both histories, one edition a day, the later print where both have one", () => {
    const view = observerToday({
      site: [entry("2026-11-09T10:00:00Z"), entry("2026-11-08T10:00:00Z", { sha256: "mine" })],
      runnerSite: [entry("2026-11-10T11:00:00Z"), entry("2026-11-08T12:00:00Z", { sha256: "theirs" })],
      session: null,
      now: NOW,
      zone: NY,
    });
    expect(view.today).toBeNull();
    expect(view.past.map((e) => e.day)).toEqual(["2026-11-10", "2026-11-09", "2026-11-08"]);
    const eighth = view.past[2];
    expect(eighth.from === "site" && eighth.entry.sha256).toBe("theirs");
    expect(eighth.from === "site" && eighth.byRunner).toBe(true);
  });

  it("keeps the reader's own on a tie, and when a print time is missing", () => {
    const view = observerToday({
      site: [
        entry("2026-11-08T10:00:00Z", { sha256: "mine" }),
        { day: "2026-11-07", path: "/2026-11-07.html", sha256: "m7" },
      ],
      runnerSite: [
        entry("2026-11-08T10:00:00Z", { sha256: "theirs" }),
        entry("2026-11-07T10:00:00Z", { sha256: "t7" }),
      ],
      session: null,
      now: NOW,
      zone: NY,
    });
    const sha = view.past.map((e) => (e.from === "site" ? e.entry.sha256 : ""));
    expect(sha).toEqual(["mine", "m7"]);
  });

  it("prefers whichever printed later today, this tab's paper included", () => {
    const view = observerToday({
      site: [],
      runnerSite: [entry("2026-11-11T11:05:00Z")],
      session: paper("2026-11-11T11:20:00Z"),
      now: NOW,
      zone: NY,
    });
    expect(view.today).toMatchObject({ from: "session" });
    expect(view.past).toEqual([]);
  });
});
