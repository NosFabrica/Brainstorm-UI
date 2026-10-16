/**
 * Addressable events by address (`kind:pubkey:d`), live from the store (ADR
 * 0005): a listing's shipping options, a collection's products, a review's
 * product. One ask for all of them, store-first; a held copy draws at once
 * and a newer one replaces it. `settled` says the ask is back, so a page can
 * tell "still looking" from "not found" — and an ask keyed on what these
 * events name waits for it (CODING_STANDARDS: settled before dependents).
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchAddressableEvents } from "@/services/nostr";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { capHints, mergeNewest } from "@/hooks/useNoteRefs";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { PROFILE_RELAYS } from "@/lib/relays";
import { addrCoord, parseATag, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";

const byCoord = (events: MinimalEvent[]) =>
  new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

export function useAddressedEvents(addresses: readonly string[]): {
  get: (address: string) => NostrEvent | undefined;
  settled: boolean;
} {
  // Keyed on the values: an address's `d` may hold any character.
  const key = JSON.stringify([...new Set(addresses)].sort());
  const addrs = useMemo(
    () => (JSON.parse(key) as string[]).map((a) => parseATag(a)).filter((a): a is AddressRef => a !== null),
    [key],
  );
  const held = useHeldReplaceables(addrs);
  const asked = useStoreEvents(addrs.length ? `addressed:${key}` : null, null, async () =>
    Array.from((await fetchAddressableEvents(capHints(addrs), PROFILE_RELAYS)).values()),
  );
  const found = useMemo(
    () => mergeNewest(addrs, held, byCoord(asked.events as MinimalEvent[])),
    [addrs, held, asked.events],
  );
  const settled = !addrs.length || asked.settled;
  return useMemo(
    () => ({
      get: (address: string) => {
        const a = parseATag(address);
        return a ? (found.get(addrCoord(a)) as NostrEvent | undefined) : undefined;
      },
      settled,
    }),
    [found, settled],
  );
}
