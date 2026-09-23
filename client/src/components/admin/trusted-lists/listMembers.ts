import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { apiClient } from "@/services/api";
import { requestNewest } from "@/lib/relayRequest";

export interface ListMember {
  pubkey: string;
  /** The list's integer score for them; null when the event doesn't say. */
  score: number | null;
  endorsements?: number;
  disputes?: number;
}

export interface LoadedTrustedList {
  members: ListMember[];
  retracted: boolean;
  relay: string;
  /** The list's address, for opening it in any Nostr app. */
  naddr: string;
}

const HEX = /^[0-9a-f]{64}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Where an observer's Trusted Lists live: the relay on `/setup`'s "30392" row,
 * else the Trusted Assertions relay — the server's own fallback for
 * TRUSTED_LIST_RELAY.
 */
async function listRelay(observer: string): Promise<string | null> {
  const rows = await apiClient.getSetupRows(observer);
  const row = rows.find((r) => r[0] === "30392") ?? rows.find((r) => r[0] === "30382:rank");
  return row?.[2] || null;
}

/** Members from the content's `members` (with endorsements), else the `p` tags. */
function membersOf(event: NostrEvent): ListMember[] {
  try {
    const parsed = JSON.parse(event.content) as { members?: unknown };
    if (Array.isArray(parsed?.members)) {
      return (parsed.members as Array<Record<string, unknown>>)
        .filter((m) => typeof m?.pubkey === "string" && HEX.test(m.pubkey as string))
        .map((m) => ({
          pubkey: m.pubkey as string,
          score: num(m.score) ?? null,
          endorsements: num(m.endorsements),
          disputes: num(m.disputes),
        }));
    }
  } catch {
    // Not JSON — fall through to the tags.
  }
  return event.tags
    .filter((t) => t[0] === "p" && HEX.test(t[1] ?? ""))
    .map((t) => {
      const score = t[3] !== undefined && t[3] !== "" ? Number(t[3]) : NaN;
      return { pubkey: t[1], score: Number.isFinite(score) ? score : null };
    });
}

/**
 * One published Trusted List, read back from the relay: the newest copy at its
 * address (a retraction is a newer copy), or null when the relay doesn't have it.
 */
export async function loadTrustedList({
  observer,
  signingPubkey,
  dTag,
}: {
  observer: string;
  signingPubkey: string;
  dTag: string;
}): Promise<LoadedTrustedList | null> {
  const relay = await listRelay(observer);
  if (!relay) throw new Error("The server didn't say which relay holds this observer's lists.");
  const event = await requestNewest([relay], { kinds: [30392], authors: [signingPubkey], "#d": [dTag] }, 8000);
  if (!event) return null;
  const retracted = event.tags.some((t) => t[0] === "status" && t[1] === "retracted");
  return {
    members: retracted ? [] : membersOf(event),
    retracted,
    relay,
    naddr: nip19.naddrEncode({ kind: 30392, pubkey: signingPubkey, identifier: dTag, relays: [relay] }),
  };
}
