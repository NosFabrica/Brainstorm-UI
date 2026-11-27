import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { apiClient } from "@/services/api";
import { requestNewest } from "@/lib/relayRequest";
import { TRUSTED_LIST_KINDS, TRUSTED_PEOPLE_KIND, readTrustedList } from "@/lib/trustedList";

export interface ListMember {
  /** What the list's kind holds: a pubkey (30392), an event id (30393), an address (30394), a NIP-73 id (30395). */
  value: string;
  /** The list's 0–100 score for it; null when the tag doesn't say. */
  score: number | null;
  /** From the content's optional echo, when it carries them. */
  endorsements?: number;
  disputes?: number;
}

export interface LoadedTrustedList {
  kind: number;
  members: ListMember[];
  retracted: boolean;
  relay: string;
  /** brainstorm_server's `tagging-target` (30393/30394): what was tagged. */
  taggingTarget?: string;
  /** The list's address, for opening it in any Nostr app. */
  naddr: string;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** The echo's field for each kind's member (services/tagLists reads the same). */
const ECHO_FIELD: Record<number, string> = { 30392: "pubkey", 30393: "id", 30394: "address", 30395: "id" };

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

/**
 * Members from the kind's member tag (lib/trustedList: the Trusted Lists draft
 * makes the tags the list, the content an optional echo), with the echo's
 * endorsement and dispute counts beside each when it carries them.
 */
function membersOf(event: NostrEvent): ListMember[] {
  const list = readTrustedList(event);
  const echo = new Map<string, Record<string, unknown>>();
  try {
    const parsed = JSON.parse(event.content) as { members?: unknown };
    const field = ECHO_FIELD[list.kind];
    if (Array.isArray(parsed?.members))
      for (const m of parsed.members as Array<Record<string, unknown>>)
        if (typeof m?.[field] === "string") echo.set(String(m[field]).toLowerCase(), m);
  } catch {
    // No echo: the tags are the list.
  }
  return list.entries.map((m) => {
    const e = echo.get(m.value.toLowerCase());
    const endorsements = num(e?.endorsements);
    const disputes = num(e?.disputes);
    return {
      value: m.value,
      score: m.score,
      ...(endorsements !== undefined ? { endorsements } : {}),
      ...(disputes !== undefined ? { disputes } : {}),
    };
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
  kind = TRUSTED_PEOPLE_KIND,
}: {
  observer: string;
  signingPubkey: string;
  dTag: string;
  /** The list's kind, from the run's result: 30392 people, 30393 notes, 30394 addresses. */
  kind?: number;
}): Promise<LoadedTrustedList | null> {
  const relay = await listRelay(observer);
  if (!relay) throw new Error("The server didn't say which relay holds this observer's lists.");
  const listKind = TRUSTED_LIST_KINDS.has(kind) ? kind : TRUSTED_PEOPLE_KIND;
  // eslint-disable-next-line no-restricted-syntax -- relay probe: is the list on the observer's relay right now (docs/adr/0005)
  const event = await requestNewest([relay], { kinds: [listKind], authors: [signingPubkey], "#d": [dTag] }, 8000);
  if (!event) return null;
  const list = readTrustedList(event);
  return {
    kind: listKind,
    members: list.retracted ? [] : membersOf(event),
    retracted: list.retracted,
    relay,
    taggingTarget: list.taggingTarget,
    naddr: nip19.naddrEncode({ kind: listKind, pubkey: signingPubkey, identifier: dTag, relays: [relay] }),
  };
}
