/**
 * A Compromised account: its key is in someone else's hands (CONTEXT.md).
 *
 * The server keeps the record — who, since when, the event proving it, and the
 * owner's new key once known — and answers for it publicly at `/compromised`
 * (brainstorm_server). This is that answer in the UI's own shape.
 */
export interface ProofEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
}

export interface CompromisedStatus {
  pubkey: string;
  /**
   * From when its content may be anyone's, epoch seconds: the earliest we know
   * of. The server's record says when it was marked, which is after the key
   * changed hands, so the owner's proof post (and our own estimate, for an
   * account in config/compromised) can only move it earlier.
   */
  since: number | null;
  proofEventId: string | null;
  /** The proof, held whole: whoever has the key can delete it from the relays. */
  proofEvent: ProofEvent | null;
  /** The owner's new account, once known. */
  successorPubkey: string | null;
  /** The new account's own post about the move: shown with it, so the reader hears it from the owner. */
  successorEventId: string | null;
}

const HEX64 = /^[0-9a-f]{64}$/i;

const hexOrNull = (v: unknown): string | null => (typeof v === "string" && HEX64.test(v) ? v.toLowerCase() : null);

function proofEventOf(v: unknown): ProofEvent | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const id = hexOrNull(e.id);
  const pubkey = hexOrNull(e.pubkey);
  if (!id || !pubkey || typeof e.kind !== "number" || typeof e.created_at !== "number") return null;
  return {
    id,
    pubkey,
    kind: e.kind,
    created_at: e.created_at,
    content: typeof e.content === "string" ? e.content : "",
    tags: Array.isArray(e.tags) ? (e.tags as string[][]) : [],
  };
}

/** The earlier of two moments, either of which may be unknown. */
export function earliest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** One `/compromised` result → a status, or null for an account that isn't marked. */
export function statusFromServer(row: unknown): CompromisedStatus | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const pubkey = hexOrNull(r.pubkey);
  if (!pubkey || r.compromised !== true) return null;
  // The server's timestamps are naive UTC (no offset), which Date.parse would read as local time.
  const at =
    typeof r.since === "string" ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(r.since) ? r.since : `${r.since}Z`) : NaN;
  const proofEvent = proofEventOf(r.proof_event);
  const markedAt = Number.isFinite(at) ? Math.floor(at / 1000) : null;
  return {
    pubkey,
    since: earliest(markedAt, proofEvent?.created_at ?? null),
    proofEventId: hexOrNull(r.proof_event_id) ?? proofEvent?.id ?? null,
    proofEvent,
    successorPubkey: hexOrNull(r.successor_pubkey),
    // Not in the server's record today; ours carries it (config/compromised).
    successorEventId: null,
  };
}

/**
 * Where a piece of content stands against its author's compromise:
 * - `proof`: the owner's own post saying it happened — posted with the key already taken;
 * - `before`: posted before the key changed hands, so still the owner's;
 * - `after`: posted since, or at a time we can't place — it may be anyone's.
 */
export type ContentStanding = "proof" | "before" | "after";

export function contentStanding(
  status: CompromisedStatus,
  content: { postedAt?: number; eventId?: string },
): ContentStanding {
  if (content.eventId && content.eventId === status.proofEventId) return "proof";
  if (status.since !== null && content.postedAt !== undefined && content.postedAt < status.since) return "before";
  return "after";
}
