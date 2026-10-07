/**
 * Geohashes, decoded to the cell they name, and that cell as an OpenStreetMap
 * map. A geohash is base 32; each character halves the box five more times,
 * longitude first, so a longer hash is a smaller cell (6 characters ≈ 1 km,
 * 9 ≈ 5 m). Nostr carries places this way — NIP-52's `g` tags, often one per
 * precision on the same event — and the `location` display role reads it
 * (lib/itemPresentation). Nothing here encodes.
 */
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export interface GeohashCell {
  /** The cell's centre. */
  lat: number;
  lon: number;
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The cell a geohash names, or null when it isn't one (empty, or a character outside the alphabet). */
export function decodeGeohash(hash: string): GeohashCell | null {
  const h = hash.trim().toLowerCase();
  if (!h) return null;
  let [south, north, west, east] = [-90, 90, -180, 180];
  let lonBit = true;
  for (const ch of h) {
    const v = BASE32.indexOf(ch);
    if (v < 0) return null;
    for (let bit = 4; bit >= 0; bit--) {
      const on = (v >> bit) & 1;
      if (lonBit) {
        const mid = (west + east) / 2;
        if (on) west = mid;
        else east = mid;
      } else {
        const mid = (south + north) / 2;
        if (on) south = mid;
        else north = mid;
      }
      lonBit = !lonBit;
    }
  }
  return { lat: (south + north) / 2, lon: (west + east) / 2, south, west, north, east };
}

/** The narrowest a map frames, in degrees: a 5 m cell still shows its streets. */
const MIN_SPAN = 0.005;
/** A cell this small (6 characters and up) is a spot worth a pin; a larger one is an area, framed with none. */
const PIN_SPAN = 0.012;

export const isSpot = (c: GeohashCell): boolean => c.north - c.south <= PIN_SPAN && c.east - c.west <= PIN_SPAN;

const deg = (n: number) => n.toFixed(6);

/** The box a map of the cell shows: the cell, widened around its centre to at least MIN_SPAN. */
function frame(c: GeohashCell) {
  const lat = Math.max(c.north - c.south, MIN_SPAN) / 2;
  const lon = Math.max(c.east - c.west, MIN_SPAN) / 2;
  return { south: c.lat - lat, north: c.lat + lat, west: c.lon - lon, east: c.lon + lon };
}

/** OpenStreetMap's embeddable map of the cell, pinned at its centre when it's a spot. */
export function osmEmbedUrl(c: GeohashCell): string {
  const f = frame(c);
  const q = new URLSearchParams({ bbox: [f.west, f.south, f.east, f.north].map(deg).join(","), layer: "mapnik" });
  if (isSpot(c)) q.set("marker", `${deg(c.lat)},${deg(c.lon)}`);
  return `https://www.openstreetmap.org/export/embed.html?${q}`;
}

/** The same place on openstreetmap.org, at a zoom that shows the frame. */
export function osmPageUrl(c: GeohashCell): string {
  const f = frame(c);
  const zoom = Math.min(18, Math.max(2, Math.floor(Math.log2(360 / Math.max(f.east - f.west, f.north - f.south)))));
  const pin = isSpot(c) ? `mlat=${deg(c.lat)}&mlon=${deg(c.lon)}` : "";
  return `https://www.openstreetmap.org/${pin ? `?${pin}` : ""}#map=${zoom}/${deg(c.lat)}/${deg(c.lon)}`;
}
