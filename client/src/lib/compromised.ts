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
  /** When it was marked, epoch seconds. */
  since: number | null;
  proofEventId: string | null;
  /** The proof, held whole: whoever has the key can delete it from the relays. */
  proofEvent: ProofEvent | null;
  /** The owner's new account, once known. */
  successorPubkey: string | null;
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

/** One `/compromised` result → a status, or null for an account that isn't marked. */
export function statusFromServer(row: unknown): CompromisedStatus | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const pubkey = hexOrNull(r.pubkey);
  if (!pubkey || r.compromised !== true) return null;
  const at = typeof r.since === "string" ? Date.parse(r.since) : NaN;
  const proofEvent = proofEventOf(r.proof_event);
  return {
    pubkey,
    since: Number.isFinite(at) ? Math.floor(at / 1000) : null,
    proofEventId: hexOrNull(r.proof_event_id) ?? proofEvent?.id ?? null,
    proofEvent,
    successorPubkey: hexOrNull(r.successor_pubkey),
  };
}
