/**
 * A release's files (kind 30063's `e` tags: NIP-51's 1063s, NIP-82's 3063s),
 * live from the store (ADR 0005). Asked by id from the release's own relay
 * hints, the Zap Store relay — where the asset events live; the search relay
 * does not index them (docs/search/RELAY-ASKS.md #6) — and the profile relays.
 * Anything at those ids that is not a file is not one of its files.
 */
import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { MAX_REF_HINTS } from "@/hooks/useNoteRefs";
import { FILE_METADATA_KIND, SOFTWARE_ASSET_KIND, type Release } from "@/lib/release";
import type { MinimalEvent } from "@/lib/noteRefs";
import { PROFILE_RELAYS } from "@/lib/relays";
import { ZAPSTORE_RELAY_URL } from "@/lib/zapstoreRelay";
import { fetchEventsByIds } from "@/services/nostr";

export function useReleaseAssets(release: Release): { assets: MinimalEvent[]; settled: boolean } {
  const ids = useMemo(() => release.assets.map((a) => a.id), [release]);
  const key = ids.join(",");
  const relays = useMemo(
    () => [
      ...new Set([
        ...release.assets.flatMap((a) => (a.relay ? [a.relay] : [])).slice(0, MAX_REF_HINTS),
        ZAPSTORE_RELAY_URL,
        ...PROFILE_RELAYS,
      ]),
    ],
    [release],
  );
  const filters = useMemo(() => (key ? [{ ids: key.split(",") }] : null), [key]);
  const found = useStoreEvents(key ? `release-assets:${key}` : null, filters, () => fetchEventsByIds(ids, relays));
  const assets = useMemo(() => {
    const byId = new Map(
      (found.events as MinimalEvent[])
        .filter((e) => e.kind === FILE_METADATA_KIND || e.kind === SOFTWARE_ASSET_KIND)
        .map((e) => [e.id, e]),
    );
    // In the release's own order.
    return ids.flatMap((id) => byId.get(id) ?? []);
  }, [found.events, ids]);
  return { assets, settled: !key || found.settled };
}
