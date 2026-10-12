/**
 * A list someone pasted to find it: its address — an `naddr`, or the
 * `kind:pubkey:d` coordinate itself — or one version of it by id (an
 * `nevent`, a `note`, a 64-hex id). Only list headers (kind 39998, or 9998
 * by id) are lists; anything else isn't one, and a typo stays a typo — this
 * reads what was pasted, it doesn't repair it.
 */
import { nip19 } from "nostr-tools";
import { formatCoordinate, parseCoordinate } from "@/lib/dlistFields";

export type ListRef =
  { type: "address"; coordinate: string; relays: string[] } | { type: "id"; id: string; relays: string[] };

const HEX64 = /^[0-9a-f]{64}$/;

export function parseListRef(raw: string): ListRef | null {
  const s = raw.trim().replace(/^nostr:/, "");
  if (!s) return null;
  if (HEX64.test(s)) return { type: "id", id: s, relays: [] };
  const coordinate = parseCoordinate(s);
  if (coordinate)
    return coordinate.kind === 39998 ? { type: "address", coordinate: formatCoordinate(coordinate), relays: [] } : null;
  try {
    const d = nip19.decode(s);
    if (d.type === "naddr")
      return d.data.kind === 39998
        ? {
            type: "address",
            coordinate: `${d.data.kind}:${d.data.pubkey}:${d.data.identifier}`,
            relays: d.data.relays ?? [],
          }
        : null;
    if (d.type === "nevent")
      return d.data.kind === undefined || d.data.kind === 39998 || d.data.kind === 9998
        ? { type: "id", id: d.data.id, relays: d.data.relays ?? [] }
        : null;
    if (d.type === "note") return { type: "id", id: d.data, relays: [] };
  } catch {
    // not bech32: words to search by
  }
  return null;
}
