/**
 * Opening hours as OpenStreetMap writes them, the subset the Food and Drink
 * list carries: day ranges, several ranges a day, "off", "24/7". Read into
 * a week, and asked whether the place is open at a moment in its own local
 * time. Expected values are worked by hand from the strings.
 */
import { describe, expect, it } from "vitest";
import { openingStatus, parseOpeningHours, type Week } from "./openingHours";

const week = (s: string): Week => parseOpeningHours(s)!;

describe("parseOpeningHours", () => {
  it("a day range with one span: every named day gets it, the others are closed", () => {
    const w = week("Tu-Sa 11:00-20:00");
    expect(w.tu).toEqual([{ open: 660, close: 1200 }]);
    expect(w.sa).toEqual([{ open: 660, close: 1200 }]);
    expect(w.mo).toEqual([]);
    expect(w.su).toEqual([]);
  });
  it("rules separated by semicolons, later ones winning for their days; two spans a day; a range past midnight", () => {
    const w = week("Mo-Th 12:00-22:00; Fr 12:00-23:00; Sa 11:00-23:00; Su 11:30-14:30, 19:00-22:30");
    expect(w.mo).toEqual([{ open: 720, close: 1320 }]);
    expect(w.fr).toEqual([{ open: 720, close: 1380 }]);
    expect(w.su).toEqual([
      { open: 690, close: 870 },
      { open: 1140, close: 1350 },
    ]);
    expect(week("Mo-Su 10:00-02:00").we).toEqual([{ open: 600, close: 1560 }]);
    expect(week("Tu-Fr 10:00-22:00; Sa 15:00-24:00").sa).toEqual([{ open: 900, close: 1440 }]);
  });
  it("a day marked off closes it; a range that wraps the week (Sa-Mo) counts Saturday, Sunday and Monday", () => {
    const w = week("Mo-Su 09:00-17:00; Tu off");
    expect(w.tu).toEqual([]);
    expect(w.we).toEqual([{ open: 540, close: 1020 }]);
    expect(week("Sa-Mo 10:00-12:00").su).toEqual([{ open: 600, close: 720 }]);
    expect(week("Sa-Mo 10:00-12:00").tu).toEqual([]);
  });
  it("24/7 is open all week; something it can't read is null, not a wrong week", () => {
    const w = week("24/7");
    expect(w.mo).toEqual([{ open: 0, close: 1440 }]);
    expect(w.su).toEqual([{ open: 0, close: 1440 }]);
    expect(parseOpeningHours("by appointment")).toBeNull();
    expect(parseOpeningHours("")).toBeNull();
  });
});

describe("openingStatus", () => {
  // Thursday 2026-10-15, local wall clock given as minutes since midnight.
  const thursday = { day: "th" as const, minutes: 18 * 60 + 30 };
  it("open during a span says when it closes; closed before one says when it opens today", () => {
    const w = week("Mo-Th 12:00-22:00; Fr 12:00-23:00");
    expect(openingStatus(w, thursday)).toEqual({ open: true, until: 1320 });
    expect(openingStatus(w, { day: "th", minutes: 9 * 60 })).toEqual({ open: false, opensAt: 720, opensDay: "th" });
  });
  it("closed for the day says when it next opens, on a later day", () => {
    const w = week("Fr 17:00-23:00; Sa 17:00-00:00; Su 13:00-19:00");
    expect(openingStatus(w, thursday)).toEqual({ open: false, opensAt: 1020, opensDay: "fr" });
    expect(openingStatus(w, { day: "su", minutes: 20 * 60 })).toEqual({ open: false, opensAt: 1020, opensDay: "fr" });
  });
  it("a span past midnight keeps the place open in the small hours of the next day", () => {
    const w = week("Mo-Su 10:00-02:00");
    expect(openingStatus(w, { day: "we", minutes: 60 })).toEqual({ open: true, until: 120 });
    expect(openingStatus(w, { day: "we", minutes: 180 })).toEqual({ open: false, opensAt: 600, opensDay: "we" });
  });
  it("closed all week has nothing to say", () => {
    expect(openingStatus(week("Mo-Su off"), thursday)).toEqual({ open: false, opensAt: null, opensDay: null });
  });
});
