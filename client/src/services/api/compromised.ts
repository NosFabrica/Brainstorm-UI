/**
 * Compromised keys (brainstorm_server `compromised_pubkey`): an account whose
 * nsec leaked. Every Observer asserts it at rank 0, and nothing it follows,
 * mutes, reports or designates counts. Anyone may ask whether a key is marked
 * (`/compromised`); admins mark and unmark them (`/admin/compromised`).
 */

import { authenticatedFetch, extractApiError, fetch, getBrainstormApi, jsonBody } from "./core";

/** The public answer for one account. */
export interface CompromisedStatus {
  pubkey: string;
  compromised: boolean;
  /** When it was marked (ISO, server time); null when it isn't. */
  since: string | null;
  proof_event_id: string | null;
  /** The event proving the compromise, kept whole: the key's new holder can delete it from relays. */
  proof_event: NostrEventJson | null;
  /** The owner's new key, once known (hex). */
  successor_pubkey: string | null;
}

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
  reason: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
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
  reason?: string | null;
}

/**
 * FastAPI answers a validation 422 with `detail` as a list of `{loc, msg}`;
 * everything else here sends a sentence. Either way, a sentence for a toast.
 */
async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response
    .clone()
    .json()
    .catch(() => null);
  if (Array.isArray(data?.detail)) {
    const msgs = data.detail
      .map((d: { msg?: unknown }) => (typeof d?.msg === "string" ? d.msg.replace(/^Value error, /, "") : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  return (await extractApiError(response)) || `${fallback} (${response.status})`;
}

/** One admin call, its error read as a sentence; unwraps a `{ data }` envelope, undefined on a 204. */
async function adminRequest<T>(path: string, fallback: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const response = await authenticatedFetch(`${getBrainstormApi()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(await readError(response, fallback));
  const text = await response.text();
  if (!text) return undefined as T;
  const json = JSON.parse(text);
  return (json?.data ?? json) as T;
}

export const compromisedApi = {
  /** Whether one account is marked. Public: no session needed. Null when the server can't say. */
  async getCompromisedStatus(pubkey: string, timeoutMs: number = 8000): Promise<CompromisedStatus | null> {
    try {
      const response = await fetch(`${getBrainstormApi()}/compromised/${pubkey}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const json = await response.json();
      return (json?.data ?? null) as CompromisedStatus | null;
    } catch {
      return null;
    }
  },

  /** The marked accounts among up to 500 pubkeys (hex). Empty when the server can't say. */
  async checkCompromised(pubkeys: string[], timeoutMs: number = 8000): Promise<Map<string, CompromisedStatus>> {
    const out = new Map<string, CompromisedStatus>();
    if (!pubkeys.length) return out;
    try {
      const response = await fetch(`${getBrainstormApi()}/compromised`, {
        ...jsonBody("POST", { pubkeys: pubkeys.slice(0, 500) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return out;
      const json = (await response.json()) as { data?: { results?: CompromisedStatus[] } };
      for (const r of json.data?.results ?? []) {
        if (r?.compromised && typeof r.pubkey === "string") out.set(r.pubkey, r);
      }
    } catch {
      // unknown reads as unmarked, like a failed trust-signals batch
    }
    return out;
  },

  async listCompromised(): Promise<CompromisedPubkey[]> {
    return adminRequest("/admin/compromised", "Failed to load compromised accounts");
  },

  /**
   * Mark (or update) an account. The server fetches a proof given by id, then
   * zeroes the account's scores and answers with the outcome in
   * `last_zero_report` (it waits up to 20 s; a longer zeroing lands after the
   * answer, which a later list shows), so this can take a while.
   */
  async markCompromised(pubkey: string, body: MarkCompromisedBody): Promise<CompromisedPubkey> {
    return adminRequest(
      `/admin/compromised/${encodeURIComponent(pubkey)}`,
      "Failed to mark the account compromised",
      jsonBody("PUT", body),
      60000,
    );
  },

  async unmarkCompromised(pubkey: string): Promise<void> {
    await adminRequest(`/admin/compromised/${encodeURIComponent(pubkey)}`, "Failed to unmark the account", {
      method: "DELETE",
    });
  },
};
