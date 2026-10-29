/**
 * When a search is local: the words name a town several places share
 * ("austin", "coffee austin"), and when their pins are near enough together
 * for a map to say something (a world map of "west" says nothing).
 */
import { describe, expect, it } from "vitest";
import { pinsAreLocal, placesGroup, townNamed } from "./placeLocal";

describe("townNamed", () => {
  const places = [
    { locality: "Austin" },
    { locality: "Austin" },
    { locality: "West Palm Beach" },
    { locality: "West Palm Beach" },
    { locality: "Ewa Beach" },
  ];

  it("is the town the words name, when several places are in it", () => {
    expect(townNamed(["austin"], places)).toBe("Austin");
    expect(townNamed(["coffee", "austin"], places)).toBe("Austin");
    expect(townNamed(["west", "palm", "beach"], places)).toBe("West Palm Beach");
  });

  it("is no town for a word that is only part of one, or a town with one place", () => {
    expect(townNamed(["west"], places)).toBeNull();
    expect(townNamed(["ewa", "beach"], places)).toBeNull();
    expect(townNamed(["coffee"], places)).toBeNull();
  });
});

describe("pinsAreLocal", () => {
  it("is local when the pins sit within a region — a town, a metro", () => {
    expect(
      pinsAreLocal([
        { lat: 30.27, lon: -97.74 },
        { lat: 30.4, lon: -97.7 },
        { lat: 30.2, lon: -97.85 },
      ]),
    ).toBe(true);
  });

  it("is not local when they span a continent, or there are none", () => {
    expect(
      pinsAreLocal([
        { lat: 21.33, lon: -158.0 },
        { lat: 42.28, lon: -71.13 },
      ]),
    ).toBe(false);
    expect(pinsAreLocal([])).toBe(false);
  });
});

// When the words name a group of places — a town several are in, or a kind of place two or more
// are — search offers the group, not one of them: "Places in Austin", "Coffee places".
describe("placesGroup", () => {
  const place = (locality: string, ...kinds: string[]) => ({ locality, kinds });
  const places = [
    place("Austin", "Cafe", "Coffee shop"),
    place("Austin", "Bar"),
    place("Petaluma", "Cafe", "Coffee shop"),
    place("Lisbon", "Bakery"),
  ];

  it("is the town, when the words name one several places are in", () => {
    expect(placesGroup(["austin"], places)).toBe("Places in Austin");
    expect(placesGroup(["coffee", "austin"], places)).toBe("Places in Austin");
  });

  it("is the kind of place, when two or more places are it", () => {
    expect(placesGroup(["coffee"], places)).toBe("Coffee places");
    expect(placesGroup(["cafe"], places)).toBe("Cafe places");
  });

  it("is no group for a word only in a name, or a kind only one place is", () => {
    expect(placesGroup(["medici"], places)).toBeNull();
    expect(placesGroup(["bakery"], places)).toBeNull();
  });
});
