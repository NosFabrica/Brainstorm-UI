/**
 * The page of an event an activity names — by id, or by address. One path for
 * every surface that links what a reaction, a zap or a score is about (the
 * activity pages, the quoted card, the result rows).
 */
import { nip19 } from "nostr-tools";
import type { EventRef } from "@/lib/activity";
import { parseATag } from "@/lib/noteRefs";
import { neventFor } from "@/lib/shareId";

export function refPath(ref: EventRef): string {
  if (ref.id) return `/e/${neventFor(ref.id, ref.relay ? [ref.relay] : [])}`;
  const a = ref.addr ? parseATag(ref.addr, ref.relay) : null;
  if (!a) return "#";
  try {
    return `/e/${nip19.naddrEncode({ kind: a.kind, pubkey: a.pubkey, identifier: a.identifier, relays: a.relays })}`;
  } catch {
    return "#";
  }
}
