/**
 * NIP-17 inbox relays (kind 10050): where a person wants their private
 * messages delivered, and the only place a client may send them. A person with
 * no list is not ready to receive NIP-17 messages, and we don't guess — a
 * guess either gets lost or publishes their conversation somewhere they never
 * chose.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { dedupeRelays, outboxRelays } from "@/lib/relayRouting";

export const DM_RELAY_LIST_KIND = 10050;

/** What we offer someone setting up: relays that hold inboxes behind a login. */
export const SUGGESTED_INBOX_RELAYS = ["wss://auth.nostr1.com/", "wss://relay.0xchat.com/"];

/** At most this many inbox relays are used per person, as NIP-17 recommends keeping the list small. */
export const MAX_INBOX_RELAYS = 3;

/** The relays a kind-10050 names, normalized and de-duplicated. */
export function parseDmRelays(event: Pick<NostrEvent, "tags"> | undefined | null): string[] {
  if (!event) return [];
  const urls = event.tags.filter((t) => t[0] === "relay" && t[1]).map((t) => t[1]);
  return dedupeRelays(urls);
}

/** The tags for a kind-10050 naming `relays`. */
export function dmRelayTags(relays: string[]): string[][] {
  return dedupeRelays(relays).map((url) => ["relay", url]);
}

/** Held now, without asking anyone: undefined when the store has never seen their list. */
export function dmRelaysFromStore(pubkey: string): string[] | undefined {
  const event = eventStore.getReplaceable(DM_RELAY_LIST_KIND, pubkey) as NostrEvent | undefined;
  return event ? parseDmRelays(event) : undefined;
}

/** The answer to "can they receive?" — `relays` empty means no (or not found). */
export interface DmRelayLookup {
  relays: string[];
  /** Their list was found (it may still name nothing usable). */
  found: boolean;
}

const inFlight = new Map<string, Promise<DmRelayLookup>>();

/**
 * Someone's inbox relays: from the store if held, else from their outbox
 * relays and the profile indexers. `fresh` skips the store, for the moment
 * before sending, when a stale list would misdeliver.
 */
export function loadDmRelays(
  pubkey: string,
  { timeoutMs = 4000, fresh = false }: { timeoutMs?: number; fresh?: boolean } = {},
): Promise<DmRelayLookup> {
  if (!fresh) {
    const held = dmRelaysFromStore(pubkey);
    if (held) return Promise.resolve({ relays: held, found: true });
  }
  const key = `${pubkey}:${fresh ? 1 : 0}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = (async () => {
    const where = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: Math.min(timeoutMs, 2500) }).catch(
      () => PROFILE_RELAYS,
    );
    const event = await loadReplaceable(DM_RELAY_LIST_KIND, pubkey, { relays: where, timeoutMs, fromRelays: fresh });
    const held = event ?? (eventStore.getReplaceable(DM_RELAY_LIST_KIND, pubkey) as NostrEvent | undefined);
    return { relays: parseDmRelays(held), found: !!held };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Several people at once — the lookups share the loader's batching window. */
export async function loadDmRelaysFor(pubkeys: string[], opts?: { timeoutMs?: number; fresh?: boolean }) {
  const unique = [...new Set(pubkeys)];
  const results = await Promise.all(
    unique.map((pk) => loadDmRelays(pk, opts).catch(() => ({ relays: [], found: false }))),
  );
  return new Map(unique.map((pk, i) => [pk, results[i]] as const));
}
