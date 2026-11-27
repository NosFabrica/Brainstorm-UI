/** Publishing taggings to the hub and the author's outbox, and reading the tagging back to confirm it. */
import { pool, fetchEventsByFilter } from "@/services/nostr";
import { dedupeRelays, outboxRelays } from "@/lib/relayRouting";
import { eventStore } from "@/lib/eventStore";
import { tagRelays } from "@/config/tagging";
import type { NostrEvent } from "./shared";

/**
 * Publish to (tag hub ∪ the author's own write relays), per the kit's routing
 * rule — and to NOTHING else.
 *
 * Deliberately not `publishRelaysFor`, which floors every publish with
 * `PROFILE_RELAYS`. That floor is right for an ordinary note and wrong here: it
 * would scatter tag assertions across five general relays that no tag reader
 * queries, and it would override a user who narrowed their set through
 * `setTagRelays`. The hub is the fallback this surface has; it needs no other.
 *
 * (The subject's inbox is not in the union either, and that is also on purpose:
 * a tag assertion is a claim ABOUT someone — see `NOT_ADDRESSED_TO_P_TAGS`.)
 *
 * `also` names relays a record's own contract adds — a place review goes to
 * the index too, where the other app that reads it looks.
 */
export async function publishTagEvent(
  signed: Record<string, unknown>,
  also: string[] = [],
): Promise<{ accepted: number; total: number }> {
  return publishTo(signed, [...tagRelays(), ...also]);
}

/**
 * A record that is no list event — a review (kind 34259), its removal — to the
 * author's own write relays and `also` (the index, where the other apps read
 * reviews), never the hub: it keeps list kinds and reactions only, and refuses
 * the rest (the places and books contracts). An author with no relay list
 * reaches `also` alone.
 */
export async function publishToOutbox(
  signed: Record<string, unknown>,
  also: string[],
): Promise<{ accepted: number; total: number }> {
  return publishTo(signed, also);
}

async function publishTo(
  signed: Record<string, unknown>,
  more: string[],
): Promise<{ accepted: number; total: number }> {
  const author = signed.pubkey as string;
  const relays = dedupeRelays([...(await outboxRelays(author, [])), ...more]);
  const responses = await pool.publish(relays, signed as never);
  const accepted = responses.filter((r) => r.ok).length;
  const total = responses.length || relays.length;
  if (!accepted) {
    throw new Error(responses.find((r) => !r.ok)?.message || "No relay accepted the event");
  }
  eventStore.add(signed as never);
  return { accepted, total };
}

/** How often a tagging is asked for before it is called unconfirmed, how long between, and how long each ask may take. */
const CONFIRM_TRIES = 3;
const CONFIRM_TIMEOUT_MS = 2500;
/** Test seam: the wait between asks is wall-clock, so a test whose relays never keep the tagging shrinks it. */
export const __confirmWait = { ms: 600 };

/**
 * "Did my tag save?" A publish succeeds when ONE relay says OK, and a relay can
 * say OK and not keep an event (a write policy, a restart, a sync that never
 * ran). To the person tagging, that read exactly like a tagging that saved,
 * until it was missing the next day.
 *
 * So the tagging — the last event of the sequence, the one that points at the
 * target — is read back by id from the relays every tag page reads, past the
 * local store, which holds our own publish whether a relay kept it or not. A
 * relay can take a moment to serve what it just took, so it is asked a few
 * times. `confirmed: false` is not a failure: the relays accepted it and we
 * could not see it there, which the caller says in those words.
 */
export async function readBack<T extends { published: { id: string }[]; failedAt?: unknown }>(
  result: T,
): Promise<T & { confirmed: boolean }> {
  const tagging = result.failedAt ? undefined : result.published[result.published.length - 1];
  if (!tagging) return { ...result, confirmed: false };
  for (let attempt = 0; attempt < CONFIRM_TRIES; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, __confirmWait.ms));
    const found = await (
      fetchEventsByFilter({ ids: [tagging.id] }, tagRelays(), CONFIRM_TIMEOUT_MS) as Promise<NostrEvent[]>
    ).catch(() => [] as NostrEvent[]);
    if (found.some((e) => e.id === tagging.id)) return { ...result, confirmed: true };
  }
  return { ...result, confirmed: false };
}
