import { treasureMapDuties } from "@/lib/treasureMap";
import { CATEGORIES, type MapCategory } from "@/lib/treasureMapCards";

/** One Assistant the User's Treasure Map uses, and the Duty groups it holds a Duty in. */
export interface AssistantHolding {
  pubkey: string;
  /** This deployment's own Assistant (`ta_pubkey`). */
  here: boolean;
  categories: MapCategory[];
}

const LABEL: Record<MapCategory, string> = { scores: "Scores", lists: "Lists", concepts: "Concepts" };

/**
 * The Assistants a Treasure Map gives Duties to, each with the Duty groups it
 * holds — read as the Duties view reads the Map (lib/treasureMap
 * `treasureMapDuties`): a Duty is its Preferred Assistant's, by its own key or
 * the most specific one covering it, so a group split between two Assistants
 * is held by both, `*` holds every group, and an Alternate holds nothing. This
 * deployment's Assistant (`self`) comes first, and is always there, holding
 * nothing if the Map gives it nothing; the others follow in the Map's order.
 */
export function assistantsOf(map: { tags?: unknown } | null | undefined, self: string): AssistantHolding[] {
  const me = self.toLowerCase();
  const groups = new Map<string, Set<MapCategory>>([[me, new Set()]]);
  for (const duty of [...treasureMapDuties(map)].sort((a, b) => a.at - b.at)) {
    const holder = duty.assistants[0];
    if (!holder) continue;
    const held = groups.get(holder) ?? new Set<MapCategory>();
    (duty.group === "everything" ? CATEGORIES : [duty.group]).forEach((group) => held.add(group));
    groups.set(holder, held);
  }
  return [...groups].map(([pubkey, held]) => ({
    pubkey: pubkey === me ? self : pubkey,
    here: pubkey === me,
    categories: CATEGORIES.filter((group) => held.has(group)),
  }));
}

/**
 * The Assistants other than this deployment's that hold at least one Duty
 * category — what "Also working for you" lists. Empty while everything happens
 * on this site, so the Yours view stays one card.
 */
export function othersOf(assistants: AssistantHolding[]): AssistantHolding[] {
  return assistants.filter((a) => !a.here && a.categories.length > 0);
}

const and = (words: string[]) =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/**
 * Where the User's Duties live, a sentence per set of Assistants: the groups
 * that come from them, each Assistant named by the site its NIP-05 verifies on
 * (`siteOf`) or, failing that, by name — this deployment's as "this site",
 * first. A group split between Assistants names them all. Groups nobody holds
 * close it.
 */
export function dutiesSummary(
  assistants: AssistantHolding[],
  siteOf: (pubkey: string) => string | null,
  nameOf: (pubkey: string) => string,
): string {
  const holders = (group: MapCategory) =>
    assistants.filter((a) => a.categories.includes(group)).sort((a, b) => Number(b.here) - Number(a.here));
  const nobody = CATEGORIES.filter((group) => holders(group).length === 0);
  if (nobody.length === 0 && CATEGORIES.every((group) => holders(group).every((a) => a.here))) {
    return "Everything your Assistant does for you happens on this site.";
  }
  // Groups with the same holders share a sentence, in the groups' own order.
  const lines = new Map<string, { groups: MapCategory[]; from: AssistantHolding[] }>();
  for (const group of CATEGORIES) {
    const from = holders(group);
    if (from.length === 0) continue;
    const key = from.map((a) => a.pubkey).join(",");
    lines.set(key, { groups: [...(lines.get(key)?.groups ?? []), group], from });
  }
  const where = (a: AssistantHolding) => (a.here ? "this site" : (siteOf(a.pubkey) ?? nameOf(a.pubkey)));
  const sentences = [...lines.values()].map(
    ({ groups, from }) => `${and(groups.map((group) => LABEL[group]))} come from ${and(from.map(where))}.`,
  );
  if (nobody.length) sentences.push(`Nobody has ${and(nobody.map((group) => LABEL[group]))} yet.`);
  return sentences.join(" ");
}

/** The hosts a Brainstorm Assistant's NIP-05 verifies on: the Deployments, which serve this app. */
const BRAINSTORM_HOSTS = new Set(["brainstorm.nosfabrica.com", "brainstorm-staging.nosfabrica.com"]);

/**
 * Where an Assistant on another site is changed: only its own site holds its
 * key. A Deployment serves this app, so the link goes to its Assistants page;
 * another app's site has no such page, so it goes to the front page of the
 * site its NIP-05 proves.
 */
export function assistantSiteLink(site: string): { href: string; label: string } {
  return BRAINSTORM_HOSTS.has(site.toLowerCase())
    ? { href: `https://${site}/settings?tab=assistants&view=yours`, label: `Open on ${site}` }
    : { href: `https://${site}/`, label: `Open ${site}` };
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
