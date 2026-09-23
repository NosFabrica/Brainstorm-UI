/**
 * A Primal pretty URL to the Nostr entity it names. The grammar is
 * lib/clientLinks; this is the lookup: the NIP-05 name to a pubkey (one
 * cross-origin JSON read — primal.net allows it), then the article by
 * coordinate from the relays, with its author — or the person.
 *
 * Cached for the session by the canonical ref, failures included (as link
 * previews and Fountain items are): the inline slot and the card gate that
 * both ask about one link agree, and ask once. A transient relay miss pins a
 * link as a plain link until reload; that is the trade.
 */
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { clientLinkKey, type ClientRef } from "@/lib/clientLinks";
import { resolveNip05 } from "@/lib/nip05";
import { fetchAddressableEvents, fetchProfileMap } from "@/services/nostr";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

export type ClientLinkEntity =
  | { kind: "article"; event: NostrEvent; author?: ProfileLite }
  | { kind: "profile"; pubkey: string; npub: string; profile?: ProfileLite };

const pending = new Map<string, Promise<ClientLinkEntity | null>>();
const settled = new Map<string, ClientLinkEntity | null>();

async function lookup(ref: ClientRef): Promise<ClientLinkEntity | null> {
  const pubkey = await resolveNip05(`${ref.name}@primal.net`);
  if (!pubkey) return null;
  if (ref.kind === "profile") {
    const profile = (await fetchProfileMap([pubkey]).catch(() => new Map())).get(pubkey) as ProfileLite | undefined;
    return { kind: "profile", pubkey, npub: nip19.npubEncode(pubkey), profile };
  }
  const found = await fetchAddressableEvents([{ kind: 30023, pubkey, identifier: ref.identifier }]);
  const event = found.get(`30023:${pubkey}:${ref.identifier}`);
  if (!event) return null;
  const author = (await fetchProfileMap([pubkey]).catch(() => new Map())).get(pubkey) as ProfileLite | undefined;
  return { kind: "article", event: event as NostrEvent, author };
}

export function resolveClientLink(ref: ClientRef): Promise<ClientLinkEntity | null> {
  const key = clientLinkKey(ref);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const promise = lookup(ref)
    .catch(() => null)
    .then((entity) => {
      settled.set(key, entity);
      return entity;
    });
  pending.set(key, promise);
  return promise;
}

/** What is already known about a ref: the entity, null when it resolved to nothing, undefined while unasked or in flight. */
export function peekClientLink(ref: ClientRef): ClientLinkEntity | null | undefined {
  return settled.get(clientLinkKey(ref));
}

/** Test seam. */
export function __resetClientLinks(): void {
  pending.clear();
  settled.clear();
}
