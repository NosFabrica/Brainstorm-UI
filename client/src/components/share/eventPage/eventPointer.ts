import { nip19 } from "nostr-tools";

export type EventPointer = { id: string; relays?: string[]; author?: string };

/** A `note`, an `nevent` or a bare hex id, as the event it points at. */
export function decodeEventId(raw: string): EventPointer | null {
  const s = raw.replace(/^nostr:/, "");
  try {
    const d = nip19.decode(s);
    if (d.type === "note") return { id: d.data as string };
    if (d.type === "nevent") {
      const e = d.data as { id: string; relays?: string[]; author?: string };
      return { id: e.id, relays: e.relays, author: e.author };
    }
  } catch {
    /* fall through */
  }
  if (/^[0-9a-f]{64}$/i.test(s)) return { id: s.toLowerCase() };
  return null;
}
