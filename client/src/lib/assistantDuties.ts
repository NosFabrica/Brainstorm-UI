import { CATEGORIES, categoryEntries, type MapCategory } from "@/lib/treasureMapCards";

/** One Assistant the User's Treasure Map uses, and the Duty categories it holds. */
export interface AssistantDuties {
  pubkey: string;
  /** This deployment's own Assistant (`ta_pubkey`). */
  here: boolean;
  categories: MapCategory[];
}

const LABEL: Record<MapCategory, string> = { scores: "Scores", lists: "Lists", concepts: "Concepts" };

/**
 * The Assistants a Treasure Map gives Duty categories to, each with the
 * categories it holds — a category read under the Assistant it names first, as
 * the Treasure Map does. This deployment's Assistant (`self`) comes first, and
 * is always there, holding nothing if the Map gives it nothing.
 */
export function assistantsOf(map: { tags?: unknown } | null | undefined, self: string): AssistantDuties[] {
  const me = self.toLowerCase();
  const byKey = new Map<string, AssistantDuties>([[me, { pubkey: self, here: true, categories: [] }]]);
  const entries = categoryEntries(map);
  for (const category of CATEGORIES) {
    const holder = entries[category][0]?.tags[0]?.pubkey;
    if (!holder) continue;
    const key = holder.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { pubkey: holder, here: false, categories: [] });
    byKey.get(key)!.categories.push(category);
  }
  return [...byKey.values()];
}

/**
 * The Assistants other than this deployment's that hold at least one Duty
 * category — what "Also working for you" lists. Empty while everything happens
 * on this site, so the Yours view stays one card.
 */
export function othersOf(assistants: AssistantDuties[]): AssistantDuties[] {
  return assistants.filter((a) => !a.here && a.categories.length > 0);
}

const and = (words: string[]) =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/**
 * One sentence saying where the User's Duties live: each Assistant's
 * categories, named by the site its NIP-05 verifies on (`siteOf`) or, failing
 * that, by name — this deployment's as "this site". Categories nobody holds
 * close it.
 */
export function dutiesSummary(
  assistants: AssistantDuties[],
  siteOf: (pubkey: string) => string | null,
  nameOf: (pubkey: string) => string,
): string {
  const held = assistants.filter((a) => a.categories.length > 0);
  const nobody = CATEGORIES.filter((c) => !held.some((a) => a.categories.includes(c)));
  if (nobody.length === 0 && held.every((a) => a.here)) {
    return "Everything your Assistant does for you happens on this site.";
  }
  const sentences = [...held]
    .sort((a, b) => Number(a.here) - Number(b.here))
    .map((a) => {
      const where = a.here ? "this site" : (siteOf(a.pubkey) ?? nameOf(a.pubkey));
      return `${and(a.categories.map((c) => LABEL[c]))} come from ${where}.`;
    });
  if (nobody.length) sentences.push(`Nobody has ${and(nobody.map((c) => LABEL[c]))} yet.`);
  return sentences.join(" ");
}

/**
 * The line under "Your Brainstorm Assistant": what this deployment's Assistant
 * publishes for the User — the Duty categories their Treasure Map gives it, or
 * that it gives it nothing here. Null categories: the Map isn't read yet, so
 * the line claims nothing.
 */
export function sidekickLine(categories: MapCategory[] | null): string {
  if (categories === null) return "Your sidekick is set up.";
  if (categories.length === 0)
    return "Your sidekick is set up, but your Treasure Map gives it nothing to publish here yet.";
  return `Your sidekick is publishing your ${and(categories.map((c) => LABEL[c].toLowerCase()))}.`;
}
