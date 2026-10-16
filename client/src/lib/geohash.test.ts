import { describe, expect, it } from "vitest";
import { decodeGeohash, isSpot, mostPreciseGeohash, osmEmbedUrl, osmPageUrl } from "./geohash";

describe("decodeGeohash", () => {
  it("decodes to the cell's centre (Wikipedia's examples)", () => {
    const c = decodeGeohash("ezs42")!;
    expect(c.lat).toBeCloseTo(42.605, 2);
    expect(c.lon).toBeCloseTo(-5.603, 2);
    const fine = decodeGeohash("u4pruydqqvj")!;
    expect(fine.lat).toBeCloseTo(57.64911, 4);
    expect(fine.lon).toBeCloseTo(10.40744, 4);
  });

  it("puts the point it was made from inside its cell — La Tarantella, a BTC Map import", () => {
    const c = decodeGeohash("6ex01945p")!;
    expect(c.south).toBeLessThanOrEqual(-25.3064685);
    expect(c.north).toBeGreaterThanOrEqual(-25.3064685);
    expect(c.west).toBeLessThanOrEqual(-57.58726425);
    expect(c.east).toBeGreaterThanOrEqual(-57.58726425);
  });

  it("reads upper case and surrounding space as the same hash", () => {
    expect(decodeGeohash(" 6EX01945P ")).toEqual(decodeGeohash("6ex01945p"));
  });

  it("refuses what isn't a geohash: empty, or a letter outside the alphabet (a, i, l, o)", () => {
    expect(decodeGeohash("")).toBeNull();
    expect(decodeGeohash("6ex0a")).toBeNull();
    expect(decodeGeohash("-25.3,-57.5")).toBeNull();
  });
});

describe("the map of a cell", () => {
  it("pins a spot, framed wide enough to show its streets", () => {
    const c = decodeGeohash("6ex01945p")!;
    expect(isSpot(c)).toBe(true);
    const url = new URL(osmEmbedUrl(c));
    expect(url.origin + url.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
    expect(url.searchParams.get("marker")).toBe(`${c.lat.toFixed(6)},${c.lon.toFixed(6)}`);
    const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect(east - west).toBeCloseTo(0.005, 5);
    expect(north - south).toBeCloseTo(0.005, 5);
    expect(osmPageUrl(c)).toBe(
      `https://www.openstreetmap.org/?mlat=${c.lat.toFixed(6)}&mlon=${c.lon.toFixed(6)}#map=16/${c.lat.toFixed(6)}/${c.lon.toFixed(6)}`,
    );
  });

  it("frames a coarse cell as an area, with no pin to suggest a spot", () => {
    const c = decodeGeohash("6ex0")!;
    expect(isSpot(c)).toBe(false);
    const url = new URL(osmEmbedUrl(c));
    expect(url.searchParams.get("marker")).toBeNull();
    // Wider than the minimum frame, so the frame is the cell itself.
    const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect([west, south, east, north].map((n) => n.toFixed(4))).toEqual(
      [c.west, c.south, c.east, c.north].map((n) => n.toFixed(4)),
    );
    expect(osmPageUrl(c)).not.toContain("mlat");
  });
});

// NIP-52 events carry `g` once per precision, coarse to fine in any order; a place is read from
// the finest one that decodes.
describe("mostPreciseGeohash", () => {
  it("takes the longest value of the tag that decodes", () => {
    const tags = [
      ["g", "9mud"],
      ["g", "9mudmbxch"],
      ["g", "9mudm"],
      ["g", "9mudmbxchzzzz-not"],
      ["title", "x"],
    ];
    expect(mostPreciseGeohash(tags, "g")?.geohash).toBe("9mudmbxch");
  });

  it("reads the tag it is given, case and spacing aside, and nothing when none decodes", () => {
    expect(mostPreciseGeohash([["location", " DR5R7V "]], "location")?.geohash).toBe("dr5r7v");
    expect(
      mostPreciseGeohash(
        [
          ["g", "aaaa"],
          ["g", ""],
        ],
        "g",
      ),
    ).toBeNull();
    expect(mostPreciseGeohash([], "g")).toBeNull();
  });
});
