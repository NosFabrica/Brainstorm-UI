/**
 * What a designated trust provider is actually doing: how many people it
 * holds kind-30382 assertions for, and when it last published. A
 * designation's page shows this — the payoff of pointing readers at a
 * relay is that the relay is live and working.
 *
 * scores.brainstorm.world answers no COUNT (probed 2026-09-23), so the count
 * is a bounded read: up to the cap, and "cap+" beyond it. Newest first is
 * the relay's default order, so the first event carries the freshness.
 */
import { pool } from "@/lib/relayPool";
import { searchOnce } from "@/lib/searchOnce";

export const FOOTPRINT_CAP = 200;

export interface AssertionFootprint {
  /** People the provider holds an assertion for — the cap when capped. */
  people: number;
  capped: boolean;
  /** When the provider last published, epoch seconds. */
  updatedAt: number;
}

/**
 * Counted from what the provider signed and the store kept (lib/searchOnce on
 * the provider's own relay), one per person assessed: a relay padding the
 * count with another key's assertions, or forged ones, made a dead provider
 * look busy.
 */
export async function fetchAssertionFootprint(
  providerPubkey: string,
  relayUrl: string,
  timeoutMs = 6000,
): Promise<AssertionFootprint | null> {
  let relay: ReturnType<typeof pool.relay> | null;
  try {
    relay = pool.relay(relayUrl);
  } catch {
    relay = null;
  }
  const { events } = await searchOnce(
    { kinds: [30382], authors: [providerPubkey], limit: FOOTPRINT_CAP },
    { relay, timeoutMs },
  );
  const people = new Set<string>();
  let updatedAt = 0;
  for (const event of events) {
    if (event.kind !== 30382 || event.pubkey !== providerPubkey) continue;
    people.add(event.tags.find((t) => t[0] === "d")?.[1] ?? "");
    if (event.created_at > updatedAt) updatedAt = event.created_at;
  }
  if (!people.size) return null;
  return { people: people.size, capped: events.length >= FOOTPRINT_CAP, updatedAt };
}
