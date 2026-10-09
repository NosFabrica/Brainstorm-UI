import { useMemo } from "react";
import { fetchEventsByAuthors } from "@/services/nostr";
import { useDmEngine, useDmRooms, useDmState, useMutedPeople } from "@/hooks/useDirectMessages";
import { useMyFollows } from "@/hooks/useMyFollows";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { roomKey } from "@/lib/dm/rooms";
import { interactionSummary, type InteractionSummary } from "@/lib/interactionSummary";

const KINDS = [1, 6, 7];
const LIMIT = 500;

/**
 * The reader's history with each of `pubkeys` (lib/interactionSummary), from
 * their own data: follows and mutes, the 1:1 chats opened on this device, and
 * one read of their own notes, reposts and reactions that tag any of them.
 *
 * `dmPartial` is true while the inbox is still opening or paused, so the page
 * can say messages are "on this device" rather than claim there are none.
 */
export function useMyInteractions(me: string, pubkeys: string[]) {
  const { follows } = useMyFollows();
  const muted = useMutedPeople(me);
  const engine = useDmEngine();
  const rooms = useDmRooms(engine);
  const dm = useDmState(engine);

  const sorted = useMemo(() => [...new Set(pubkeys)].sort(), [pubkeys]);
  const key = me && sorted.length ? `my-interactions:${me}:${sorted.join(",")}` : null;
  const filters = useMemo(
    () => (key ? [{ kinds: KINDS, authors: [me], "#p": sorted, limit: LIMIT }] : null),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const mine = useStoreEvents(key, filters, () =>
    fetchEventsByAuthors([me], { kinds: KINDS, "#p": sorted, limit: LIMIT }),
  );

  const byRoom = useMemo(() => new Map(rooms.map((r) => [r.key, r])), [rooms]);
  const summaryOf = (pubkey: string): InteractionSummary =>
    interactionSummary(pubkey, {
      me,
      follows,
      muted,
      dmRoom: byRoom.get(roomKey([me, pubkey])),
      myEvents: mine.events,
    });
  const dmPartial = dm.status !== "ready" || !!dm.paused || dm.queued > 0;
  return { summaryOf, dmPartial, settled: mine.settled };
}
