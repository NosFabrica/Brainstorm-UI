/**
 * Reading a user: profile, overview, stats, connections, alerts, the path
 * between two people, and the brainstorm request records keyed to them.
 */

import { authenticatedFetch, fetch, getBrainstormApi, optionalAuthFetch } from "./core";

/** Follows-graph shortest-path result from `GET /shortestPath`. */
export interface ShortestPath {
  from: string;
  to: string;
  reachable: boolean;
  hops: number;
  /** Ordered hex pubkeys from `from` to `to` (inclusive); one random shortest path. */
  path: string[];
  /** Total number of shortest paths of this length. */
  pathCount: number;
  /** True when `pathCount` hit the server cap (show as "N+"). */
  pathCountCapped: boolean;
  maxHops: number;
}

/** One account in the observer's network, with its verified trust signals. */
export interface NetworkAlertEntry {
  pubkey: string;
  influence: number;
  /** 1 = direct follow, 2 = extended network. */
  hops: number;
  verifiedFollowerCount: number;
  verifiedMuterCount: number;
  verifiedReporterCount: number;
  /** Reporter count at/above which the account is treated as flagged. */
  reporterThreshold: number;
}

/** `data` payload of `/networkAlerts`. */
export interface NetworkAlertsData {
  observerPubkey: string;
  directFollows: NetworkAlertEntry[];
  extendedNetwork: NetworkAlertEntry[];
  directFollowsTruncated: boolean;
  extendedNetworkTruncated: boolean;
}

/** True when an account's verified reporters meet/exceed its flag threshold. */
export function isFlaggedAlert(e: NetworkAlertEntry): boolean {
  return e.reporterThreshold > 0 && e.verifiedReporterCount >= e.reporterThreshold;
}

export const usersApi = {
  async getUserHistory() {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/history`,
      {
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch user history (${response.status})`);
    }
    return await response.json();
  },

  async getUserByPubkey(pubkey: string) {
    const response = await optionalAuthFetch(
      `${getBrainstormApi()}/user/${pubkey}`,
      {
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
    }
    return await response.json();
  },

  async getUserOverview(pubkey: string) {
    const url = `${getBrainstormApi()}/user/${pubkey}/overview`;
    const response = await optionalAuthFetch(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user overview (${response.status})`);
    }
    return await response.json();
  },

  /**
   * Network Alerts (David's `/networkAlerts`, brainstorm_server): for the given
   * observer, the trust signals on the people IN their network — direct follows
   * (hops=1) and the extended network (hops=2). Each entry carries verified
   * follower/muter/reporter counts and the reporter threshold; an account is
   * "flagged" when `verifiedReporterCount >= reporterThreshold`. Reads from
   * neo4j, so it's SLOW for populated observers (~10s until PR #59 precomputes
   * verifiedFollowers) — always load it async and off the page's critical path.
   * Accepts hex or npub; returns the hex `observerPubkey`.
   */
  async getNetworkAlerts(
    observer: string,
    opts?: { limit?: number },
  ): Promise<{ code: number; message: string | null; data: NetworkAlertsData }> {
    const params = new URLSearchParams({ observer });
    params.set("limit", String(opts?.limit ?? 100));
    const url = `${getBrainstormApi()}/networkAlerts?${params.toString()}`;
    const response = await optionalAuthFetch(url, {
      // Generous timeout: this endpoint is ~10s for real observers today.
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch network alerts (${response.status})`);
    }
    return await response.json();
  },

  async getUserStats(
    pubkey: string,
    opts?: {
      // Force the unauthenticated "house" POV (stable for every viewer) instead
      // of the logged-in viewer's personalized perspective. Used by public pages.
      house?: boolean;
    },
  ) {
    // No params: the bands are fixed server-side and the verified line comes
    // from the observer's saved preset.
    const url = `${getBrainstormApi()}/user/${pubkey}/stats`;
    const response = await (opts?.house ? fetch : optionalAuthFetch)(url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user stats (${response.status})`);
    }
    return await response.json();
  },

  /**
   * Follows-graph distance from `from` to `to` (the "hops" / degree metric):
   * `{ reachable, hops, path[], pathCount, pathCountCapped, maxHops }`. `from`/`to`
   * are hex pubkeys or npubs; the endpoint returns ONE randomly-chosen shortest
   * path per call (re-call for a different one). `from` is required — there is no
   * house default, so callers pass an explicit pubkey (the logged-in viewer's).
   */
  async getShortestPath(opts: { from: string; to: string }): Promise<ShortestPath> {
    const params = new URLSearchParams({ from: opts.from, to: opts.to });
    const url = `${getBrainstormApi()}/shortestPath?${params.toString()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch shortest path (${response.status})`);
    }
    const json = await response.json();
    return json?.data as ShortestPath;
  },

  async getUserConnections(
    pubkey: string,
    kind:
      | "followed_by"
      | "following"
      | "muted_by"
      | "muting"
      | "reported_by"
      | "reporting"
      | "flagged",
    opts?: {
      limit?: number;
      cursor?: string;
      order?: "asc" | "desc";
      tier?:
        | "high"
        | "medium_high"
        | "medium"
        | "medium_low"
        | "low"
        | "low_and_reported_by_2_or_more_trusted_pubkeys";
      // Verified for this `kind` under the observer's saved preset (strict `>`
      // its per-relationship cutoff). Ignored for kind=flagged.
      verified_only?: boolean;
      with_total?: boolean;
      // Force the unauthenticated "house" POV (stable for every viewer).
      house?: boolean;
    },
  ) {
    const params = new URLSearchParams();
    params.set("kind", kind);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.order) params.set("order", opts.order);
    if (opts?.tier) params.set("tier", opts.tier);
    if (opts?.verified_only) params.set("verified_only", "true");
    if (opts?.with_total) params.set("with_total", "true");
    const url = `${getBrainstormApi()}/user/${pubkey}/connections?${params.toString()}`;
    const response = await (opts?.house ? fetch : optionalAuthFetch)(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${kind} (${response.status})`);
    }
    return await response.json();
  },

  // Ingest a freshly-signed onboarding kind-3 follow list synchronously, so the
  // backend has the user's follows BEFORE GrapeRank is triggered (no relay-
  // propagation wait). Throws an Error carrying `.status` so the caller can
  // branch on 429 (rate-limit — don't retry) vs transient errors (retry).
  async submitFollowList(signedEvent: Record<string, unknown>) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/followList`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_event: signedEvent }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      let detail = body?.detail || body?.message || `Failed to ingest follow list (${response.status})`;
      if (typeof detail === "object") detail = JSON.stringify(detail);
      const err = new Error(detail) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    return await response.json(); // { code, message, data: { followCount } }
  },

  async getBrainstormRequest(requestId: string) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/brainstormRequest/${requestId}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Failed to fetch brainstorm request (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async createBrainstormRequest(data: { pubkey: string; [key: string]: unknown }) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/brainstormRequest/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Failed to create brainstorm request (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async getBrainstormPubkey(nostrPubkey: string) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/brainstormPubkey/${nostrPubkey}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Failed to lookup pubkey (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  },
};
