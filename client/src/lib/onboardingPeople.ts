/**
 * Who the first run suggests for a topic (pages/WelcomePage). The house's
 * list for the topic leads when one is published; otherwise the built-in
 * hand-picked people (lib/onboardingTopics). Only when that leaves too few is
 * the topic topped up from a house-ranked search — and never with bots,
 * faceless accounts, repeats, or Bitcoin accounts outside the Bitcoin topic:
 * a raw search matches names, which is how "Gaming News" turned up twice.
 */

/** A suggested person, as the first run shows them. */
export interface SuggestedPerson {
  pubkey: string;
  name: string;
  picture: string;
  nip05?: string;
}

/** What a profile gives the picker; a kind 0's content or a search hit. */
interface ProfileLike {
  name?: string;
  display_name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  bot?: boolean;
}

const BITCOIN = /bitcoin|₿|\bbtc\b|\bsats?\b/i;

/**
 * A name without the tags feeds and bots carry: "Reuters / @Reuters (RSS
 * Feed)" is "Reuters", "GameSpot :press:" is "GameSpot".
 */
export function cleanDisplayName(raw: string): string {
  return (
    raw
      .replace(/\s+\/\s+@\S.*$/, "")
      .replace(/\s*\((?:[^)]*\b(?:rss|feed|bot|newsbot)\b[^)]*)\)/gi, "")
      .replace(/\s*:[a-z0-9_+-]+:/gi, "")
      // Trailing check marks, with or without their emoji variation selector.
      .replace(/(?:\s|✔|✅|️)+$/u, "")
      .trim()
  );
}

function personOf(pubkey: string, p: ProfileLike | undefined): SuggestedPerson | null {
  if (!p?.picture) return null;
  const name = cleanDisplayName(p.display_name || p.displayName || p.name || "");
  if (!name) return null;
  return { pubkey, name, picture: p.picture, ...(p.nip05 ? { nip05: p.nip05 } : {}) };
}

export function pickTopicPeople({
  topic,
  listed,
  curated,
  profiles,
  found,
  size,
}: {
  topic: string;
  /** The house's list for the topic, best first; null when none is published. */
  listed: string[] | null;
  /** The built-in hand-picked people, for when there is no list. */
  curated: string[];
  /** Profiles for the listed or hand-picked people. */
  profiles: Map<string, ProfileLike>;
  /** A house-ranked search for the topic, to top up from. */
  found: Array<ProfileLike & { pubkey: string }>;
  size: number;
}): SuggestedPerson[] {
  const lead = (listed ?? curated).flatMap((pk) => {
    const person = personOf(pk, profiles.get(pk));
    return person ? [person] : [];
  });
  const people = lead.slice(0, size);
  const names = new Set(people.map((p) => p.name.toLowerCase()));
  for (const hit of found) {
    if (people.length >= size) break;
    if (hit.bot || people.some((p) => p.pubkey === hit.pubkey)) continue;
    const person = personOf(hit.pubkey, hit);
    if (!person || names.has(person.name.toLowerCase())) continue;
    if (topic !== "bitcoin" && BITCOIN.test(person.name)) continue;
    names.add(person.name.toLowerCase());
    people.push(person);
  }
  return people;
}

/** How many people a topic suggests, and how many of those start ticked. */
export const PEOPLE_PER_TOPIC = 6;
export const PRESELECTED_PER_TOPIC = 3;
