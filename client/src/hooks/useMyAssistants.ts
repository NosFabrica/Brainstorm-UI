import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "nostr-tools";
import { ASSISTANT_TAGS, NOSTR_USER_TAG_Z, type AssistantTagKey } from "@/config/assistants";
import { tagRelays } from "@/config/tagging";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";
import { parseCoordinate } from "@/lib/dlistFields";
import { myAssistantRows, type MyAssistantRow } from "@/lib/myAssistants";
import { newestPerAddress } from "@/lib/newestPerAddress";
import { PROFILE_RELAYS } from "@/lib/relays";
import { dedupeRelays, readRelaysFor } from "@/lib/relayRouting";
import { offeredDuties, treasureMapDuties, type Duty } from "@/lib/treasureMap";
import { apiClient } from "@/services/api";
import type { AssistantDefinitions } from "@/services/assistants";
import { fetchEventsByFilter } from "@/services/nostr";

const READ_MS = 8000;

/** Each Assistant tag's definition address, from config. */
const DEFINITIONS = ASSISTANT_TAGS.map((tag) => ({ key: tag.key, at: parseCoordinate(tag.coordinate) })).filter(
  (d): d is { key: AssistantTagKey; at: NonNullable<typeof d.at> } => !!d.at,
);

export type TreasureMapStatus = "loading" | "found" | "none";

export interface MyAssistants {
  /** In no promised order (lib/myAssistants orderRows sorts them by name). */
  rows: MyAssistantRow[];
  /** The first ask has finished: "none tagged" and "no definition" need it. */
  settled: boolean;
  /** Each tag's definition, by key, where one was found: what a new tagging points at. */
  definitions: AssistantDefinitions;
  /** The Map's duties, then those the reader's Brainstorm Assistant offers that the Map doesn't name. */
  duties: Duty[];
  mapStatus: TreasureMapStatus;
  /** The Treasure Map itself (kind 10040), once found. */
  map: NostrEvent | null;
}

/**
 * The reader's Assistants (lib/myAssistants) and the duties their Treasure
 * Map gives out (lib/treasureMap), live from the EventStore (ADR 0005).
 *
 * Taggings are asked wherever either app may have put them: the tag hub, the
 * reader's read relays, and the general relays Tapestry publishes to (all in
 * PROFILE_RELAYS). Their deletions are asked beside them — a kind 5 by the
 * reader naming kind 39999 (NIP-09 `k`), as Tapestry's withdrawal writes —
 * and the store drops what those delete. The ask returns nothing for the same
 * reason: a copy it returned would join the result past the store's deletes.
 *
 * The tags' definitions are asked beside them: a tag is only offered once
 * its definition is found, as Tapestry's page does.
 *
 * The local row is the Assistant Brainstorm hosts for the reader (`ta_pubkey`),
 * once the server has said which.
 *
 * What that Assistant offers is the server's own word, `GET /setup/{pubkey}`:
 * the Map rows it hands the reader to publish, and the Concept duties planned
 * beside them (lib/treasureMap `offeredDuties`). A server that can't say
 * offers nothing: the Map's duties stand alone.
 */
export function useMyAssistants(viewer: string | null | undefined): MyAssistants {
  const { taPubkey } = useHasMywot();
  const filters = useMemo(
    () =>
      viewer
        ? [
            { kinds: [39999], authors: [viewer], "#z": [NOSTR_USER_TAG_Z] },
            { kinds: [5], authors: [viewer], "#k": ["39999"] },
            {
              kinds: [39999],
              authors: [...new Set(DEFINITIONS.map((d) => d.at.pubkey))],
              "#d": DEFINITIONS.map((d) => d.at.d),
            },
          ]
        : null,
    [viewer],
  );
  const taggings = useStoreEvents(viewer ? `my-assistants:${viewer}` : null, filters, async () => {
    if (!viewer || !filters) return;
    const relays = dedupeRelays([...tagRelays(), ...(await readRelaysFor(viewer, PROFILE_RELAYS))]);
    await Promise.all(filters.map((filter) => fetchEventsByFilter(filter, relays, READ_MS)));
  });
  const rows = useMemo(
    () => (viewer ? myAssistantRows({ viewer, local: taPubkey, taggings: taggings.events }) : []),
    [viewer, taPubkey, taggings.events],
  );

  const definitions = useMemo(() => {
    const out: AssistantDefinitions = {};
    for (const { key, at } of DEFINITIONS) {
      const [found] = newestPerAddress(
        taggings.events.filter(
          (ev) => ev.kind === 39999 && ev.pubkey === at.pubkey && ev.tags.some((t) => t[0] === "d" && t[1] === at.d),
        ),
      );
      if (found) out[key] = found.id;
    }
    return out;
  }, [taggings.events]);

  const map = useTrustProviderList(viewer);
  const setup = useQuery({
    queryKey: ["setup-rows", viewer],
    queryFn: () => apiClient.getSetupRows(viewer!),
    enabled: !!viewer,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const offered = useMemo(() => offeredDuties(setup.data), [setup.data]);
  const duties = useMemo(() => treasureMapDuties(map.event, offered), [map.event, offered]);
  const mapStatus: TreasureMapStatus = map.event ? "found" : map.settled ? "none" : "loading";

  return { rows, settled: taggings.settled, definitions, duties, mapStatus, map: map.event ?? null };
}
