/**
 * GrapeRank: triggering a run, reading a result, the preset, and the
 * house-perspective trust signals every ring and flag chip reads.
 */

import { authenticatedFetch, fetch, getBrainstormApi, optionalAuthFetch } from "./core";

/** An author's Influence and Flagged verdict, as a ring and a flag chip draw them. */
export interface TrustSignals {
  influence: number | null;
  flagged: boolean;
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

/** null when the request failed — not the same answer as "nobody here is rated". */
async function postTrustSignals(
  send: (url: string, options: RequestInit) => Promise<Response>,
  pubkeys: string[],
  timeoutMs: number,
): Promise<Map<string, TrustSignals> | null> {
  const out = new Map<string, TrustSignals>();
  try {
    const response = await send(`${getBrainstormApi()}/user/trustSignals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkeys }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      data?: { results?: { pubkey?: unknown; influence?: unknown; flagged?: unknown }[] };
    };
    for (const r of json.data?.results ?? []) {
      if (typeof r.pubkey !== "string") continue;
      out.set(r.pubkey, {
        influence: typeof r.influence === "number" && Number.isFinite(r.influence) ? r.influence : null,
        flagged: r.flagged === true,
      });
    }
  } catch {
    return null;
  }
  return out;
}

export const grapeRankApi = {
  async triggerGrapeRank() {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/graperank`, {
      method: "POST",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      const status = response.status;
      const lowerDetail = detail.toLowerCase();
      let friendlyMessage: string;
      if (status === 502 || status === 503 || status === 504) {
        friendlyMessage = "The Brainstorm server is temporarily unavailable. Please wait a few minutes and try again.";
      } else if (
        status === 429 ||
        lowerDetail.includes("rate") ||
        lowerDetail.includes("too many") ||
        lowerDetail.includes("wait") ||
        lowerDetail.includes("cooldown")
      ) {
        friendlyMessage = "Please wait a few minutes before recalculating. The server needs time between requests.";
      } else {
        friendlyMessage = "Something went wrong. Please wait a moment and try again.";
      }
      throw new Error(friendlyMessage);
    }
    return await response.json();
  },

  async getGrapeRankResult() {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/graperankResult`);
    if (!response.ok) {
      throw new Error(`Failed to fetch GrapeRank data (${response.status})`);
    }
    return await response.json();
  },

  /**
   * `influence` (0..1) — from our own backend, always the house POV (an
   * *unauthenticated* request), regardless of whether a viewer is logged in.
   * Asks Trust signals, not `/overview`: on production `/overview` also counts
   * followers and took 22–37s for large accounts (2026-11-17), where Trust
   * signals answers in ~0.2s. A non-hex key (Trust signals rejects it) still
   * goes through `/overview`. Returns null if the backend has no score for the
   * pubkey (not yet indexed by Brainstorm) or the request fails.
   */
  async getHouseInfluence(pubkey: string, timeoutMs: number = 8000): Promise<number | null> {
    if (!pubkey) return null;
    if (HEX_PUBKEY.test(pubkey)) {
      const found = await postTrustSignals(fetch, [pubkey.toLowerCase()], timeoutMs);
      return found?.get(pubkey.toLowerCase())?.influence ?? null;
    }
    try {
      // Plain fetch (no session token) → NosFabrica/house perspective.
      const response = await fetch(`${getBrainstormApi()}/user/${pubkey}/overview`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { data?: { influence?: unknown } };
      const influence = json?.data?.influence;
      return typeof influence === "number" && Number.isFinite(influence) ? influence : null;
    } catch {
      return null;
    }
  },

  /**
   * Trust signals for many authors in one unauthenticated call (house
   * Perspective). Never throws: a failed batch answers null, so a caller that
   * remembers answers can tell "unrated" from "couldn't ask".
   */
  async getTrustSignals(pubkeys: string[], timeoutMs: number = 8000): Promise<Map<string, TrustSignals> | null> {
    return postTrustSignals(fetch, pubkeys, timeoutMs);
  },

  /** The same batch from the signed-in viewer's Perspective (house when signed out); null when it failed. */
  async getMyTrustSignals(pubkeys: string[], timeoutMs: number = 8000): Promise<Map<string, TrustSignals> | null> {
    return postTrustSignals(optionalAuthFetch, pubkeys, timeoutMs);
  },

  async getGrapeRankPreset(): Promise<{
    code?: number;
    message?: string;
    data?: { preset?: string };
  }> {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/graperank/preset`);
    if (!response.ok) {
      throw new Error(`Failed to load your trust perspective preset (${response.status}).`);
    }
    return await response.json();
  },

  async setGrapeRankPreset(
    preset: "DEFAULT" | "PERMISSIVE" | "RESTRICTIVE",
  ): Promise<{ code?: number; message?: string; data?: { preset?: string } }> {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/graperank/preset`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    if (!response.ok) {
      throw new Error(`Couldn't save your trust perspective. Please try again (${response.status}).`);
    }
    return await response.json();
  },

  async triggerUserGraperank(pubkey: string) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/brainstormPubkey/${pubkey}/trigger_graperank`,
      { method: "POST", signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Failed to trigger GrapeRank (${response.status})`);
    }
    return await response.json();
  },
};
