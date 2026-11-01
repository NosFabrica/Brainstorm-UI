import { describe, expect, it } from "vitest";
import { cellsCovering, decodeGeohash, isSpot, osmEmbedUrl, osmPageUrl } from "./geohash";

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

// What a map's view asks a relay for (`#g`): a few cells, as fine as a few allow, that together
// cover the view. Events tagged with a cell at that precision answer — and only at a precision the
// index holds, which is why the floor matters more than the count.
describe("cellsCovering", () => {
  const overlaps = (hash: string, b: { south: number; west: number; north: number; east: number }) => {
    const c = decodeGeohash(hash)!;
    return c.south < b.north && c.north > b.south && c.west < b.east && c.east > b.west;
  };

  const downtownAustin = { south: 30.26, west: -97.75, north: 30.28, east: -97.73 };

  /** A box of roughly `km` either side of a point, as a map view would frame it. */
  const around = (lat: number, lon: number, km: number) => {
    const dLat = km / 111.32;
    const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
    return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
  };

  it("covers downtown Austin with a cell an event on Sixth Street is tagged with", () => {
    const cells = cellsCovering(downtownAustin);
    // A live event at Sixth Street and Congress carries g tags 9v6kpvc, 9v6kpv, 9v6kp, 9v6k…
    expect(cells.some((c) => "9v6kpvc".startsWith(c))).toBe(true);
    expect(cells.every((c) => overlaps(c, downtownAustin))).toBe(true);
  });

  it("asks for coarser cells as the view widens, all the same size", () => {
    const wide = around(41.8781, -87.6298, 40);
    const cells = cellsCovering(wide);
    expect(cells.length).toBeGreaterThan(0);
    expect(new Set(cells.map((c) => c.length)).size).toBe(1);
    expect(cells[0].length).toBeLessThan(cellsCovering(downtownAustin)[0].length);
    expect(cells.every((c) => overlaps(c, wide))).toBe(true);
  });

  // D4.2.a: `#g` is an exact tag match and 4 characters is the coarsest precision the index
  // holds, so a coarser cell matches nothing. The old budget coarsened past 4 for any city-sized
  // view, which is how area search came to return nothing at city zoom and wider.
  it("never asks for a cell coarser than the index holds, at any width", () => {
    for (const km of [0.5, 2, 5, 10, 25, 40, 100, 200]) {
      for (const cell of cellsCovering(around(41.8781, -87.6298, km))) expect(cell.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("covers 25 km around Chicago with the precision-4 cells that hold its places", () => {
    const cells = cellsCovering(around(41.8781, -87.6298, 25));
    // Measured on the live relay, 2026-11-01: #g:["dp3w"] holds 32 Food and Drink Places, and
    // the 12 cells of this box hold 67, where the coarser #g:["dp3"] holds none.
    expect(cells).toContain("dp3w");
    expect(cells.every((c) => c.length === 4)).toBe(true);
    expect(cells).toHaveLength(12);
  });

  it("asks for no cells when the view is wider than the coarsest precision can cover", () => {
    const texas = { south: 26, west: -106, north: 36, east: -94 };
    // Thousands of cells at precision 4, and anything coarser matches nothing, so the honest
    // answer is none: fetchAreaEvents then sends no #g filter rather than an empty one.
    expect(cellsCovering(texas)).toEqual([]);
  });
});
