/**
 * How far one place is from another, and how to say it: kilometres for
 * most readers, miles where miles are spoken. Worked examples from known
 * coordinates.
 */
import { describe, expect, it } from "vitest";
import { distanceKm, distanceWords } from "./placeDistance";

describe("distanceKm", () => {
  it("the great-circle distance between two points", () => {
    // Sarasota, Il Sole → downtown Sarasota: about 12 km.
    expect(distanceKm({ lat: 27.2508994, lon: -82.5343946 }, { lat: 27.3364, lon: -82.5307 })).toBeCloseTo(9.5, 0);
    // Across the Atlantic: London → New York, about 5,570 km.
    expect(distanceKm({ lat: 51.5074, lon: -0.1278 }, { lat: 40.7128, lon: -74.006 })).toBeCloseTo(5570, -1);
    expect(distanceKm({ lat: 1, lon: 1 }, { lat: 1, lon: 1 })).toBe(0);
  });
});

describe("distanceWords", () => {
  it("metres under a kilometre, one decimal under ten, whole above", () => {
    expect(distanceWords(0.35, "en-GB")).toBe("350 m");
    expect(distanceWords(1.24, "en-GB")).toBe("1.2 km");
    expect(distanceWords(12.6, "en-GB")).toBe("13 km");
  });
  it("miles for a reader in the US", () => {
    expect(distanceWords(1.609, "en-US")).toBe("1.0 mi");
    expect(distanceWords(0.2, "en-US")).toBe("0.1 mi");
    expect(distanceWords(32.2, "en-US")).toBe("20 mi");
  });
});
