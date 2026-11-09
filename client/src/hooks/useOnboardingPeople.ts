import { useQueries } from "@tanstack/react-query";
import { HOUSE_POV, fetchFromSearch, suggestProfiles } from "@/services/search";
import { fetchProfileMap } from "@/services/nostr";
import { resolveHouseObserver } from "@/services/trustSource";
import { HAND_PICKED, ONBOARDING_TOPICS, houseListTitle, type OnboardingTopic } from "@/lib/onboardingTopics";
import { PEOPLE_PER_TOPIC, pickTopicPeople, type SuggestedPerson } from "@/lib/onboardingPeople";
import { TRUSTED_PEOPLE_KIND, readTrustedList } from "@/lib/trustedList";

/**
 * Every list the house publishes, by title — asked once and shared by every
 * topic (picking all eleven used to send eleven identical requests). A failed
 * ask isn't kept, so the next topic picked tries again.
 */
let houseLists: Promise<Map<string, string[]>> | null = null;
function allHouseLists(): Promise<Map<string, string[]>> {
  houseLists ??= (async () => {
    const house = await resolveHouseObserver().catch(() => null);
    if (!house) return new Map<string, string[]>();
    const events = await fetchFromSearch([{ kinds: [TRUSTED_PEOPLE_KIND], authors: [house] }], { timeoutMs: 4000 });
    const byTitle = new Map<string, string[]>();
    for (const event of events) {
      const list = readTrustedList(event);
      if (!byTitle.has(list.title))
        byTitle.set(
          list.title,
          list.members.map((m) => m.pubkey),
        );
    }
    return byTitle;
  })().catch((err) => {
    houseLists = null;
    throw err;
  });
  return houseLists;
}

/** The house's list for a topic, best first; null when none is published. */
async function houseList(topic: OnboardingTopic): Promise<string[] | null> {
  const lists = await allHouseLists().catch(() => new Map<string, string[]>());
  return lists.get(houseListTitle(topic)) ?? null;
}

async function loadTopicPeople(topic: OnboardingTopic): Promise<SuggestedPerson[]> {
  const listed = await houseList(topic);
  const lead = listed ?? HAND_PICKED[topic.key];
  const [profiles, found] = await Promise.all([
    fetchProfileMap(lead),
    lead.length >= PEOPLE_PER_TOPIC
      ? Promise.resolve([])
      : suggestProfiles(`${topic.words} sort:followers`, { pov: HOUSE_POV }, { limit: 24 }),
  ]);
  return pickTopicPeople({
    topic: topic.key,
    listed,
    curated: HAND_PICKED[topic.key],
    profiles,
    found,
    size: PEOPLE_PER_TOPIC,
  });
}

/**
 * The people the first run suggests for each picked topic (lib/onboardingPeople):
 * asked once a topic is picked, kept for the visit.
 */
export function useOnboardingPeople(topics: string[]): {
  byTopic: Record<string, SuggestedPerson[]>;
  loading: boolean;
} {
  const picked = ONBOARDING_TOPICS.filter((t) => topics.includes(t.key));
  const results = useQueries({
    queries: picked.map((topic) => ({
      queryKey: ["onboarding-people", topic.key],
      queryFn: () => loadTopicPeople(topic),
      staleTime: Infinity,
      retry: 1,
    })),
  });
  const byTopic: Record<string, SuggestedPerson[]> = {};
  picked.forEach((topic, i) => {
    if (results[i].data) byTopic[topic.key] = results[i].data;
  });
  return { byTopic, loading: results.some((r) => r.isPending) };
}
