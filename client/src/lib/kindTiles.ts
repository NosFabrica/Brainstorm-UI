/**
 * The kinds on All's page, one tile each beside the list tiles (hooks/useListRibbon):
 * "Videos 4", "Articles 3". A tile is named as the rows' badges name them (lib/kindLabel),
 * so the four video kinds are one Videos tile and a zap.cooking article is a Recipe.
 */
import { kindLabel } from "@/lib/kindLabel";
import { kindTone } from "@/lib/kindFamily";
import type { Tone } from "@/lib/tones";
import type { SearchHit } from "@/services/search";

export interface KindTile {
  /** Its key on the ribbon and in the link: `kind:` and the rows' label. */
  key: string;
  /** The rows' label: "Video". */
  label: string;
  /** The label in the plural: "Videos". */
  name: string;
  tone: Tone;
  /** Its rows on All's page, in All's order. */
  hits: SearchHit[];
}

const KIND_KEY = "kind:";
export const isKindKey = (key: string) => key.startsWith(KIND_KEY);

/** Labels that are already plural, or have no plural to speak of. */
const PLURALS: Readonly<Record<string, string>> = {
  Person: "People",
  Audio: "Audio",
  Code: "Code",
  "App data": "App data",
  "Encrypted DM": "Encrypted DMs",
  "DM relays": "DM relays",
  "Wallet info": "Wallet info",
  "Profile badges": "Profile badges",
  Mostro: "Mostro orders",
  Bookshelf: "Bookshelves",
  Canvas: "Canvases",
  Feedback: "Feedback",
  "Job progress": "Job progress",
  "Trusted people": "Trusted people",
};

/**
 * "Web bookmark" → "Web bookmarks", "Patch" → "Patches". Already plural ("Search relays"),
 * an event that happened ("Job accepted") or a kind with no name ("Kind 30405"): as it is.
 */
export function pluralLabel(label: string): string {
  if (PLURALS[label]) return PLURALS[label];
  if (/^Kind \d+$/.test(label) || /[^aeiou]ed$/.test(label)) return label;
  if (/[^aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(ss|us|x|z|ch|sh)$/.test(label)) return `${label}es`;
  if (/s$/.test(label)) return label;
  return `${label}s`;
}

/**
 * A tile per label among `hits`, most rows first, then by name. `held` are the rows a list
 * tile already holds — a list item is its list's (a "Book"), not one more kind.
 */
export function kindTiles(hits: readonly SearchHit[], held: ReadonlySet<string> = new Set()): KindTile[] {
  const byLabel = new Map<string, KindTile>();
  for (const hit of hits) {
    if (held.has(hit.event.id)) continue;
    const label = kindLabel(hit.event);
    let tile = byLabel.get(label);
    if (!tile) {
      tile = { key: KIND_KEY + label, label, name: pluralLabel(label), tone: kindTone(hit.event.kind), hits: [] };
      byLabel.set(label, tile);
    }
    tile.hits.push(hit);
  }
  return [...byLabel.values()].sort(
    (a, b) => b.hits.length - a.hits.length || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
