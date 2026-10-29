/**
 * When a search is local. The words name a town when every word of the
 * town's name is among them and several places are in it — "austin",
 * "coffee austin" — not a word that is only part of one ("west" is not
 * West Palm Beach). And a map says something only when its pins sit within
 * a region: a world map of everything called "west" says nothing.
 */
import { distanceKm } from "@/lib/placeDistance";

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** The town the words name, among the places' towns, when at least `min` places are in it; the most places first. */
export function townNamed(
  words: readonly string[],
  places: readonly { locality: string | null }[],
  min = 2,
): string | null {
  const asked = new Set(words.map((w) => w.toLowerCase()));
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of places) {
    const name = p.locality?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    counts.set(key, { name, n: (counts.get(key)?.n ?? 0) + 1 });
  }
  const named = [...counts.values()]
    .filter((t) => t.n >= min && wordsOf(t.name).every((w) => asked.has(w)))
    .sort((a, b) => b.n - a.n);
  return named[0]?.name ?? null;
}

/** How far apart the farthest two pins may be for one map to show them all, in km: a metro, a region. */
const REGION_KM = 300;

/** Whether the pins sit within a region, so a map of them says something. */
export function pinsAreLocal(pins: readonly { lat: number; lon: number }[], maxKm = REGION_KM): boolean {
  if (pins.length === 0) return false;
  for (let i = 0; i < pins.length; i++)
    for (let j = i + 1; j < pins.length; j++) if (distanceKm(pins[i], pins[j]) > maxKm) return false;
  return true;
}

/**
 * The group of places the words name, as search offers it: the town several
 * are in ("Places in Austin"), else a kind of place two or more are, taken
 * from the word typed ("Coffee places"). Null for a word that is only in a
 * name, or a kind only one place is. `kinds` are each place's kinds as said
 * ("Cafe", "Coffee shop").
 */
export function placesGroup(
  words: readonly string[],
  places: readonly { locality: string | null; kinds: readonly string[] }[],
): string | null {
  const town = townNamed(words, places);
  if (town) return `Places in ${town}`;
  for (const w of words) {
    const word = w.toLowerCase();
    const n = places.filter((p) => p.kinds.some((k) => wordsOf(k).includes(word))).length;
    if (n >= 2) return `${word.charAt(0).toUpperCase()}${word.slice(1)} places`;
  }
  return null;
}
