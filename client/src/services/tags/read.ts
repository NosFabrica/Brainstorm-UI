/** Reading tag events: the hub ∪ the viewer's read relays, with what the store already holds. */
import { fetchEventsByFilter } from "@/services/nostr";
import { readRelaysFor } from "@/lib/relayRouting";
import { eventStore } from "@/lib/eventStore";
import { tagRelays } from "@/config/tagging";
import { activeAccount } from "@/accounts/signing";
import type { NostrEvent } from "./shared";

/**
 * Tag reads: the hub ∪ the viewer's read relays. Kept separate from the trust
 * reader below — the house's TA-signed artifacts are not on the hub.
 *
 * The viewer's half used to be documentation only: this asked `tagRelays()` and
 * nothing else, so the kit's routing rule ("reads query these ∪ the user's read
 * relays") was true of the publish path and false of the read path. A tagging
 * that reached the hub was found; one that only reached the relays the viewer
 * actually reads was not.
 *
 * It is the READ half of their list, per that rule. For the ordinary relay list
 * — unmarked `r` tags, which are both — that also covers everything they write,
 * so their own taggings come back. A list that marks its relays write-only is
 * the one case where it doesn't, and following the rule beats guessing at it.
 *
 * Every tag read in this module funnels through here, so this is the one place
 * the union has to happen.
 */
async function fetchRelayTagEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  const viewer = activeAccount()?.pubkey;
  const relays = viewer ? await readRelaysFor(viewer, tagRelays()) : tagRelays();
  return fetchEventsByFilter(filter, relays) as Promise<NostrEvent[]>;
}

/**
 * What the store already holds — notably our own publishes, so a read never
 * trails our own write while the relays catch up. `limit` is dropped — it caps
 * the relay page, not what we already hold.
 */
function localTagEvents(filter: Record<string, unknown>): NostrEvent[] {
  const { limit: _limit, ...rest } = filter;
  return eventStore.getByFilters(rest as never) as NostrEvent[];
}

function withLocal(relay: NostrEvent[], filter: Record<string, unknown>): NostrEvent[] {
  const byId = new Map(relay.map((ev) => [ev.id, ev]));
  for (const ev of localTagEvents(filter)) byId.set(ev.id, ev);
  return Array.from(byId.values());
}

export async function fetchTagEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return withLocal(await fetchRelayTagEvents(filter), filter);
}

/**
 * Walk the whole assertion history, not just the newest page.
 *
 * A plain `limit` is useless for the catalogue: the hub holds 2928 profile-tag
 * assertions of which **23 are real** — the rest is QA-harness output published
 * in a recent burst. A newest-first page of 2000 therefore contains ~6 real
 * ones, and the catalogue silently under-reports (it claimed "Verified Human,
 * 2 people" for a tag that has 4). Relay filters can't express "has an `a`
 * tag", so we page backwards through `until` until the relay stops giving us
 * anything new.
 *
 * Bounded on both ends: it stops on an empty page, on a timestamp that doesn't
 * advance, or at `maxRounds` — a relay that keeps replaying the same window
 * must not spin here. Today the whole corpus takes 3 rounds.
 */
export async function fetchAllTagEvents(
  filter: Record<string, unknown>,
  { pageSize = 1000, maxRounds = 8 } = {},
): Promise<NostrEvent[]> {
  const seen = new Map<string, NostrEvent>();
  let until: number | undefined;

  for (let round = 0; round < maxRounds; round++) {
    let batch: NostrEvent[];
    try {
      // Relay-only: local events would skew `oldest` and the stop conditions.
      batch = await fetchRelayTagEvents({ ...filter, limit: pageSize, ...(until ? { until } : {}) });
    } catch {
      break; // keep whatever we already have rather than losing the page
    }
    if (!batch.length) break;

    let oldest = Infinity;
    for (const ev of batch) {
      seen.set(ev.id, ev);
      if (ev.created_at < oldest) oldest = ev.created_at;
    }
    if (!Number.isFinite(oldest)) break;
    const next = oldest - 1;
    if (next === until) break; // relay isn't advancing; stop rather than loop
    until = next;
  }
  return withLocal(Array.from(seen.values()), filter);
}
