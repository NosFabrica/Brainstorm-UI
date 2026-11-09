import { useQueries } from "@tanstack/react-query";
import { HOUSE_POV, fetchFromSearch, suggestProfiles } from "@/services/search";
import { fetchProfileMap } from "@/services/nostr";
import { resolveHouseObserver } from "@/services/trustSource";
import { HAND_PICKED, ONBOARDING_TOPICS, houseListTitle, type OnboardingTopic } from "@/lib/onboardingTopics";
import { PEOPLE_PER_TOPIC, pickTopicPeople, type SuggestedPerson } from "@/lib/onboardingPeople";
import { TRUSTED_PEOPLE_KIND, readTrustedList } from "@/lib/trustedList";

/** The house's list for a topic, best first; null when none is published. */
async function houseList(topic: OnboardingTopic): Promise<string[] | null> {
  const house = await resolveHouseObserver().catch(() => null);
  if (!house) return null;
  const events = await fetchFromSearch([{ kinds: [TRUSTED_PEOPLE_KIND], authors: [house] }], { timeoutMs: 4000 });
  const event = events.find((e) => readTrustedList(e).title === houseListTitle(topic));
  return event ? readTrustedList(event).members.map((m) => m.pubkey) : null;
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
