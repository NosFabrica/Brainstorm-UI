import { nip19 } from "nostr-tools";
import type { CompromisedPubkey, MarkCompromisedBody, NostrEventJson } from "@/services/api";

const HEX64 = /^[0-9a-f]{64}$/i;

/** npub or 64-hex → hex; null for anything else. */
export function parseAccount(input: string): string | null {
  const v = input.trim();
  if (HEX64.test(v)) return v.toLowerCase();
  try {
    const d = nip19.decode(v);
    if (d.type === "npub") return d.data as string;
    if (d.type === "nprofile") return (d.data as { pubkey: string }).pubkey;
  } catch {
    /* not a NIP-19 string */
  }
  return null;
}

/** hex, note1… or nevent1… — kept as typed: an nevent's relay hints are read by the server. */
export function isEventPointer(input: string): boolean {
  const v = input.trim();
  if (HEX64.test(v)) return true;
  try {
    const t = nip19.decode(v).type;
    return t === "note" || t === "nevent";
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A `datetime-local` value (the admin's own time zone) → ISO UTC for the
 * server; null when empty; an error for a time it can't read or one ahead of now.
 */
export function sinceFromInput(local: string): { iso: string | null; error?: undefined } | { error: string } {
  const v = local.trim();
  if (!v) return { iso: null };
  const t = Date.parse(v); // no offset: read as local time
  if (!Number.isFinite(t)) return { error: "The time it was taken isn't a date and time." };
  if (t > Date.now()) return { error: "The time it was taken can't be in the future." };
  return { iso: new Date(t).toISOString() };
}

/** The server's naive-UTC time → a `datetime-local` value in the admin's time zone; "" when unset. */
export function inputFromSince(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A hex event id → note1… for showing; anything else as it is. */
export function noteOf(id: string): string {
  try {
    return nip19.noteEncode(id);
  } catch {
    return id;
  }
}

export interface MarkForm {
  account: string;
  /** "id": a pointer the server fetches; "json": the whole signed event pasted. */
  proofMode: "id" | "json";
  proofId: string;
  proofJson: string;
  successor: string;
  /** The new account's post about the move: an event pointer. */
  successorPost: string;
  /** `datetime-local`: when the key was taken, in the admin's time zone. */
  since: string;
  reason: string;
}

export const EMPTY_FORM: MarkForm = {
  account: "",
  proofMode: "id",
  proofId: "",
  proofJson: "",
  successor: "",
  successorPost: "",
  since: "",
  reason: "",
};

export type ProofForm = Pick<MarkForm, "proofMode" | "proofId" | "proofJson">;

/** The proof half of a `PUT`: a pointer kept as typed, or the pasted event whole; or what's wrong with it. */
export function buildProof(
  form: ProofForm,
): { body: Pick<MarkCompromisedBody, "proof_event_id" | "proof_event">; error?: undefined } | { error: string } {
  if (form.proofMode === "id") {
    if (!isEventPointer(form.proofId)) return { error: "The proof must be an nevent, a note, or a hex event id." };
    return { body: { proof_event_id: form.proofId.trim() } };
  }
  let event: unknown;
  try {
    event = JSON.parse(form.proofJson);
  } catch {
    return { error: "The proof event isn't valid JSON." };
  }
  const e = event as Partial<NostrEventJson>;
  if (!e || typeof e.id !== "string" || typeof e.sig !== "string" || typeof e.pubkey !== "string") {
    return { error: "The proof event needs its id, pubkey and sig: paste the whole signed event." };
  }
  return { body: { proof_event: e as NostrEventJson } };
}

/**
 * The `PUT` for a new account, or the first thing wrong with the form. The
 * server checks the proof's id and signature; this only catches what can be
 * caught before a round-trip.
 */
export function buildMarkRequest(
  form: MarkForm,
): { pubkey: string; body: MarkCompromisedBody; error?: undefined } | { error: string } {
  const pubkey = parseAccount(form.account);
  if (!pubkey) return { error: "The account must be an npub or a 64-character hex pubkey." };

  const proof = buildProof(form);
  if (proof.error !== undefined) return { error: proof.error };
  const body: MarkCompromisedBody = { ...proof.body };

  if (form.successor.trim()) {
    const successor = parseAccount(form.successor);
    if (!successor) return { error: "The new account must be an npub or a 64-character hex pubkey." };
    if (successor === pubkey) return { error: "The new account can't be the compromised one." };
    body.successor_pubkey = successor;
  }
  if (form.successorPost.trim()) {
    if (!isEventPointer(form.successorPost)) {
      return { error: "Their post about the move must be an nevent, a note, or a hex event id." };
    }
    body.successor_event_id = form.successorPost.trim();
  }
  const since = sinceFromInput(form.since);
  if (since.error !== undefined) return { error: since.error };
  if (since.iso) body.compromised_since = since.iso;
  if (form.reason.trim()) body.reason = form.reason.trim();
  return { pubkey, body };
}

export type ZeroState = "pending" | "complete" | "incomplete" | "failed";

/**
 * Where the zeroing stands for a row: pending while it hasn't reported since it
 * was last asked for (every PUT; a metadata PATCH asks for none).
 */
export function zeroState(row: CompromisedPubkey): ZeroState {
  const report = row.last_zero_report;
  if (!report || !row.last_zeroed_at) return "pending";
  const requested = row.zero_requested_at ?? row.updated_at;
  if (Date.parse(row.last_zeroed_at) < Date.parse(requested)) return "pending";
  if ("error" in report) return "failed";
  return report.complete && report.relay_read ? "complete" : "incomplete";
}

/** The server's timestamps are naive UTC: read them as such, not as local time. */
function utcMs(iso: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

/** One line on what the last zeroing did, or why it didn't. */
export function zeroSummary(row: CompromisedPubkey, now: number = Date.now()): string {
  const report = row.last_zero_report;
  if (!report || zeroState(row) === "pending") {
    const started = utcMs(row.zero_requested_at ?? row.updated_at);
    const secs = Number.isFinite(started) ? Math.max(0, Math.round((now - started) / 1000)) : null;
    const running = secs === null ? "" : secs < 90 ? ` for ${secs} s` : ` for ${Math.round(secs / 60)} min`;
    return `Still zeroing${running}; this refreshes until it lands.`;
  }
  if ("error" in report) return `Failed: ${report.error}`;
  const parts = [
    `${report.acked}/${report.observers} Observers' assertions re-signed at rank 0`,
    `${report.edges_cut ?? 0} of its own ratings cut`,
    `${report.neo4j_cleared} stored scores cleared`,
    `${report.whitelists_updated} whitelists updated`,
  ];
  if (!report.relay_read) parts.push("the relay couldn't be read, so only the DB's list was used");
  return parts.join(" · ");
}
