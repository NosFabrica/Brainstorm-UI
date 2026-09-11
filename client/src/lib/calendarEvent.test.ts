import { describe, expect, it } from "vitest";
import { formatEventTime, shortPlace } from "./calendarEvent";

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
    expect(shortPlace("Juniata Brewing Company, 1102 Susquehanna Ave, Huntingdon, PA 16652")).toBe("Juniata Brewing Company, Huntingdon");
    expect(shortPlace("Yuzu House, Bratislava")).toBe("Yuzu House, Bratislava");
    expect(shortPlace("Chicago, IL")).toBe("Chicago, IL");
    expect(shortPlace("Online")).toBe("Online");
    expect(shortPlace("")).toBe("");
  });
});
