/**
 * A place's ways out — directions, a call, its site — built from its fields,
 * and its category as words. Expected values are the links a phone opens.
 */
import { describe, expect, it } from "vitest";
import { categoryWords, directionsUrl, placeLocalMinutes } from "./placeLinks";

describe("directionsUrl", () => {
  it("sends the coordinates to the maps app, the name as the label", () => {
    expect(directionsUrl({ lat: "10.2875153", lon: "-85.8505374" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=10.2875153%2C-85.8505374",
    );
  });
  it("without coordinates, nothing", () => {
    expect(directionsUrl({ lat: null, lon: null })).toBeNull();
    expect(directionsUrl({ lat: "x", lon: "1" })).toBeNull();
  });
});

describe("categoryWords", () => {
  it("turns OpenStreetMap values into words", () => {
    expect(categoryWords("fast_food")).toBe("Fast food");
    expect(categoryWords("ice_cream")).toBe("Ice cream");
    expect(categoryWords("restaurant")).toBe("Restaurant");
    expect(categoryWords("pizza")).toBe("Pizza");
    expect(categoryWords("")).toBeNull();
  });
});

describe("placeLocalMinutes", () => {
  it("estimates the place's local wall clock from its longitude: 15° per hour", () => {
    // 12:00 UTC at −85.85° (Costa Rica, UTC−6) is 06:00 local, a Thursday either way.
    const at = new Date("2026-10-15T12:00:00Z");
    expect(placeLocalMinutes(-85.85, at)).toEqual({ day: "th", minutes: 360 });
    // 23:30 UTC at +139.7° (Tokyo, UTC+9) is 08:30 the next day.
    expect(placeLocalMinutes(139.7, new Date("2026-10-15T23:30:00Z"))).toEqual({ day: "fr", minutes: 510 });
  });
});
