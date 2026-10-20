/**
 * The NIP-98 style challenge exchange that mints a session, and revoking them.
 */

import type { NostrEvent } from "nostr-tools";
import { authenticatedFetch, extractApiError, fetch, getBrainstormApi } from "./core";

export const authApi = {
  async getAuthChallenge(pubkey: string): Promise<string> {
    const response = await fetch(`${getBrainstormApi()}/authChallenge/${pubkey}`);
    if (!response.ok) {
      throw new Error(`Failed to get auth challenge (${response.status})`);
    }
    const data = await response.json();
    if (!data?.data?.challenge) {
      throw new Error("Invalid challenge response from server");
    }
    return data.data.challenge;
  },

  async verifyAuthChallenge(pubkey: string, signedEvent: NostrEvent) {
    const response = await fetch(`${getBrainstormApi()}/authChallenge/${pubkey}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signed_event: signedEvent }),
    });
    if (!response.ok) {
      throw new Error(`Auth verification failed (${response.status})`);
    }
    const data = await response.json();
    if (!data?.data?.token) {
      throw new Error("No token received from server");
    }
    return data;
  },

  /** Sign out everywhere: every session token issued so far, this one included, stops working. */
  async revokeOwnSessions(): Promise<void> {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/sessions/revoke`, { method: "POST" });
    if (!response.ok) {
      throw new Error((await extractApiError(response)) || `Failed to sign out everywhere (${response.status})`);
    }
  },
};
