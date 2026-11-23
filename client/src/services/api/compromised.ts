/**
 * Admin calls for compromised keys (brainstorm_server `/admin/compromised`):
 * an account whose nsec leaked. Every Observer asserts it at rank 0, and
 * nothing it follows, mutes, reports or designates counts. The public check
 * every surface reads is services/compromised.
 */

import { authenticatedFetch, extractApiError, getBrainstormApi, jsonBody } from "./core";

export interface NostrEventJson {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** The outcome of the last zeroing, which runs after the admin's PUT answers. */
export type ZeroReport =
  | {
      observers: number;
      relay_read: boolean;
      published: number;
      acked: number;
      complete: boolean;
      neo4j_cleared: number;
      whitelists_updated: number;
      edges_cut?: number;
    }
  | { error: string };

/** One marked account, as admins see it. */
export interface CompromisedPubkey {
  pubkey: string;
  proof_event_id: string;
  proof_event: NostrEventJson;
  successor_pubkey: string | null;
  /** The new account's post about the move (hex id). */
  successor_event_id?: string | null;
  /** From when the key may have been in someone else's hands (naive UTC); unset, the marking time stands in. */
  compromised_since?: string | null;
  reason: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  /** When a zeroing was last asked for (every PUT); older servers don't send it. */
  zero_requested_at?: string | null;
  last_zeroed_at: string | null;
  last_zero_report: ZeroReport | null;
}

/**
 * `PUT /admin/compromised/{pubkey}`. A field left out keeps its stored value, so
 * a new account needs `proof_event` or `proof_event_id`, and a later call may
 * send only what changes (`successor_pubkey: null` clears it). `{}` re-zeroes.
 */
export interface MarkCompromisedBody {
  /** hex, note1… or nevent1…: the server fetches and checks the event. */
  proof_event_id?: string;
  /** The whole signed event, for when no relay the server asks still holds it. */
  proof_event?: NostrEventJson;
  /** npub or hex. */
  successor_pubkey?: string | null;
  /** The new account's post about the move: hex, note1… or nevent1…. */
  successor_event_id?: string | null;
  /** ISO time; one with an offset is stored as UTC. */
  compromised_since?: string | null;
  reason?: string | null;
}

/** `PATCH /admin/compromised/{pubkey}`: these fields only; one left out stays, `null` clears it. */
export type CompromisedMetadataBody = Pick<
  MarkCompromisedBody,
  "successor_pubkey" | "successor_event_id" | "compromised_since" | "reason"
>;

/** The server's sentence (a validation 422's `msg`s included), or the fallback with the status. */
async function readError(response: Response, fallback: string): Promise<string> {
  return (await extractApiError(response)) || `${fallback} (${response.status})`;
}

/** An admin call that failed with an HTTP status; `status` lets a caller tell a gateway timeout from a refusal. */
export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Whether a failed call may still have landed: our timeout, a dropped
 * connection, or a gateway giving up (502/503/504) before the server answered.
 */
export function mayHaveLanded(err: unknown): boolean {
  if (err instanceof AdminRequestError) return err.status === 502 || err.status === 503 || err.status === 504;
  if (err instanceof DOMException) return err.name === "TimeoutError" || err.name === "AbortError";
  return err instanceof TypeError; // fetch's network failure
}

/** One admin call, its error read as a sentence; unwraps a `{ data }` envelope, undefined on a 204. */
async function adminRequest<T>(path: string, fallback: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const response = await authenticatedFetch(`${getBrainstormApi()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new AdminRequestError(await readError(response, fallback), response.status);
  const text = await response.text();
  if (!text) return undefined as T;
  const json = JSON.parse(text);
  return (json?.data ?? json) as T;
}

export const compromisedApi = {
  async listCompromised(): Promise<CompromisedPubkey[]> {
    return adminRequest("/admin/compromised", "Failed to load compromised accounts");
  },

  /**
   * Mark (or update) an account. The server fetches a proof given by id,
   * records it and starts zeroing the account's scores. A current server
   * answers before the zeroing ends (the row is pending until a later list
   * shows `last_zero_report`); an older one waited up to 20 s, hence the long
   * timeout. A timeout or gateway error may still have landed: `mayHaveLanded`.
   */
  async markCompromised(pubkey: string, body: MarkCompromisedBody): Promise<CompromisedPubkey> {
    return adminRequest(
      `/admin/compromised/${encodeURIComponent(pubkey)}`,
      "Failed to mark the account compromised",
      jsonBody("PUT", body),
      60000,
    );
  },

  /** Change only the successor, its post, the time it was taken and/or the note: the proof stays and nothing is zeroed. */
  async updateCompromisedMetadata(pubkey: string, body: CompromisedMetadataBody): Promise<CompromisedPubkey> {
    return adminRequest(
      `/admin/compromised/${encodeURIComponent(pubkey)}`,
      "Failed to save the account",
      jsonBody("PATCH", body),
    );
  },

  async unmarkCompromised(pubkey: string): Promise<void> {
    await adminRequest(`/admin/compromised/${encodeURIComponent(pubkey)}`, "Failed to unmark the account", {
      method: "DELETE",
    });
  },
};
