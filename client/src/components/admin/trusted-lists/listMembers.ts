import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { apiClient } from "@/services/api";
import { requestNewest } from "@/lib/relayRequest";
import { parseCoordinate } from "@/lib/dlistFields";

/** People (`p` members), events by id (`e`), addressable events by coordinate (`a`). */
export type TrustedListKind = 30392 | 30393 | 30394;

/** A result's kind as a list kind; a server older than its tagged-content lists sends none. */
export const listKindOf = (kind: number | null | undefined): TrustedListKind =>
  kind === 30393 || kind === 30394 ? kind : 30392;

interface MemberScore {
  /** The list's integer score for them; null when the event doesn't say. */
  score: number | null;
  endorsements?: number;
  disputes?: number;
}

/** Who or what a list names, by the field its content uses: a pubkey, an event id or a coordinate. */
export type ListMember = MemberScore & ({ pubkey: string } | { id: string } | { address: string });

export interface LoadedTrustedList {
  kind: TrustedListKind;
  members: ListMember[];
  retracted: boolean;
  relay: string;
  /** The list's address, for opening it in any Nostr app. */
  naddr: string;
}

const HEX = /^[0-9a-f]{64}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const isAddress = (v: unknown): v is string => typeof v === "string" && parseCoordinate(v) !== null;

/**
 * Each kind's member: its tag, the field the content names it by, and the check a value passes
 * (ADR `trusted-lists/0002` D3, D5). Only that tag is read: a Tapestry 30393 also carries an `a`
 * and a `p` back to its tag, and those are not members.
 */
const MEMBER: Record<TrustedListKind, { tag: string; field: string; valid: (v: unknown) => v is string }> = {
  30392: { tag: "p", field: "pubkey", valid: isHex },
  30393: { tag: "e", field: "id", valid: isHex },
  30394: { tag: "a", field: "address", valid: isAddress },
};

/**
 * Where an observer's Trusted Lists live: the relay on `/setup`'s row for the
 * list's kind, else its "30392" row, else the Trusted Assertions relay — the
 * server's own fallback for TRUSTED_LIST_RELAY.
 */
async function listRelay(observer: string, kind: TrustedListKind): Promise<string | null> {
  const rows = await apiClient.getSetupRows(observer);
  const row =
    rows.find((r) => r[0] === String(kind)) ??
    rows.find((r) => r[0] === "30392") ??
    rows.find((r) => r[0] === "30382:rank");
  return row?.[2] || null;
}

/** Members from the content's `members` (with endorsements), else the member tags. */
function membersOf(event: NostrEvent, kind: TrustedListKind): ListMember[] {
  const { tag, field, valid } = MEMBER[kind];
  const member = (value: string, score: MemberScore) => ({ [field]: value, ...score }) as ListMember;
  try {
    const parsed = JSON.parse(event.content) as { members?: unknown };
    if (Array.isArray(parsed?.members)) {
      return (parsed.members as Array<Record<string, unknown>>)
        .filter((m) => valid(m?.[field]))
        .map((m) =>
          member(m[field] as string, {
            score: num(m.score) ?? null,
            endorsements: num(m.endorsements),
            disputes: num(m.disputes),
          }),
        );
    }
  } catch {
    // Not JSON — fall through to the tags.
  }
  return event.tags
    .filter((t) => t[0] === tag && valid(t[1]))
    .map((t) => {
      const score = t[3] !== undefined && t[3] !== "" ? Number(t[3]) : NaN;
      return member(t[1], { score: Number.isFinite(score) ? score : null });
    });
}

/**
 * One published Trusted List, read back from the relay: the newest copy at its
 * address (a retraction is a newer copy), or null when the relay doesn't have it.
 * The address is the list's own kind's, never 30392's for a list of notes or items.
 */
export async function loadTrustedList({
  observer,
  signingPubkey,
  dTag,
  kind = 30392,
}: {
  observer: string;
  signingPubkey: string;
  dTag: string;
  kind?: TrustedListKind;
}): Promise<LoadedTrustedList | null> {
  const relay = await listRelay(observer, kind);
  if (!relay) throw new Error("The server didn't say which relay holds this observer's lists.");
  const event = await requestNewest([relay], { kinds: [kind], authors: [signingPubkey], "#d": [dTag] }, 8000);
  if (!event) return null;
  const retracted = event.tags.some((t) => t[0] === "status" && t[1] === "retracted");
  return {
    kind,
    members: retracted ? [] : membersOf(event, kind),
    retracted,
    relay,
    naddr: nip19.naddrEncode({ kind, pubkey: signingPubkey, identifier: dTag, relays: [relay] }),
  };
}
