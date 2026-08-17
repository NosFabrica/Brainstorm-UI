import { env } from "@/lib/runtimeEnv";
import {
  clearSession,
  ensureSession,
  getSessionToken,
  isSessionDeferredError,
  refreshSession,
  SessionDeferredError,
} from "@/accounts/session";
import { EXTENSION_COLD_BOOT_WAIT_MS, waitForExtension } from "@/accounts/login";
import { accountManager } from "@/accounts";
import { activeAccount } from "@/accounts/signing";

const RAW_API_URL = env.VITE_API_URL;
const API_BASE_URL = RAW_API_URL.replace(/\/+$/, "");

if (!API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    "[api] VITE_API_URL is not set. The frontend cannot reach the Brainstorm Backend. " +
      "Set VITE_API_URL at build time (see README and Dockerfile).",
  );
}

// One-time cleanup of the legacy environment-switch key from prior versions.
try {
  localStorage.removeItem("brainstorm_api_env");
} catch {
  // ignore (e.g. SSR / private mode)
}

function getBrainstormApi(): string {
  return API_BASE_URL;
}

// One-time cleanup of stale Vespa preferences from prior versions.
try {
  localStorage.removeItem("brainstorm_vespa_weights");
  localStorage.removeItem("brainstorm_search_backend");
} catch {
  // ignore
}

let isRedirectingToLogin = false;

export function isAuthRedirecting(): boolean {
  return isRedirectingToLogin;
}

/**
 * The Session ended and could not be renewed. It costs the Active Account its
 * token, not its place on this device — the Account is still listed and signing
 * back in is one tap.
 *
 * The redirect is a last resort, not the response: it is what stops a page
 * rendering an identity the backend just refused, and it is only the right answer
 * when there is nothing else on this device to be. Where another Account is held,
 * leaving the route alone lets the switcher offer it — bouncing to the landing
 * page would throw away a session the user still has. We do not pick the
 * replacement for them; whether that Signer can actually sign is a probe the
 * picker already makes properly.
 */
function handleUnauthorized() {
  const account = activeAccount();
  if (account) clearSession(account);
  if (accountManager.accounts.some((held) => held !== account)) return;
  isRedirectingToLogin = true;
  window.location.href = "/";
}

/** Healed, waiting for the user, or genuinely unusable — three different answers. */
type ReauthResult = "ok" | "deferred" | "failed";

/**
 * Mint a fresh Session for the Active Account, in the background: this is a 401
 * from whatever query happened to fire, not something the user asked for. A
 * Locked Account that would have to ask for a password defers instead — the next
 * user-initiated action mints one. Concurrent 401s share one exchange, so a
 * signer is asked to approve at most once.
 */
async function silentReauth(staleToken?: string): Promise<ReauthResult> {
  const account = activeAccount();
  if (!account) return "failed";
  // Someone else got here first. When a token expires with several queries in
  // flight they all 401, and the ones landing after the first exchange settled
  // are complaining about a token that no longer exists — minting again would
  // cost one signer approval per stale request, and `refreshSession` would clear
  // the fresh token on its way to doing it.
  if (staleToken !== undefined && currentToken() !== undefined && currentToken() !== staleToken) {
    return "ok";
  }
  // A 401 on a cold boot can beat the extension's own injection; v1 waited here too.
  if (account.type === "extension") await waitForExtension(EXTENSION_COLD_BOOT_WAIT_MS);
  try {
    await refreshSession(account, { background: true });
    return "ok";
  } catch (err) {
    return isSessionDeferredError(err) ? "deferred" : "failed";
  }
}

/**
 * Mint the Session the deferred path skipped — the unlock card and the "sign in
 * again" query state both end here. User-initiated, so unlocking on the way
 * through is exactly what was asked for; a declined unlock travels back out.
 */
export async function resumeSession(): Promise<void> {
  const account = activeAccount();
  if (!account) return;
  await ensureSession(account);
}

/** The Active Account's token, or undefined — signed out, or Session-less. */
function currentToken(): string | undefined {
  const account = activeAccount();
  return account && getSessionToken(account);
}

async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = currentToken();
  if (!token) {
    const reauth = await silentReauth();
    // Deferred is not expired: the Account is fine and the key is simply asleep,
    // so nothing is wiped and nobody is redirected. The caller renders the
    // "sign in again to see this" state instead.
    if (reauth === "deferred") throw new SessionDeferredError();
    if (reauth === "failed") {
      handleUnauthorized();
      throw new Error("No session token found");
    }
    token = currentToken();
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, access_token: token! },
  });
  if (response.status === 401) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    const reauth = await silentReauth(token);
    if (reauth === "deferred") throw new SessionDeferredError();
    if (reauth === "ok") {
      const newToken = currentToken();
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...options.headers, access_token: newToken! },
      });
      if (retryResponse.status === 401 || retryResponse.status === 403) {
        handleUnauthorized();
        throw new Error("Session expired. Please log in again.");
      }
      return retryResponse;
    }
    handleUnauthorized();
    throw new Error(detail || "Session expired. Please log in again.");
  }
  if (response.status === 403) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    throw new Error(detail || `Request forbidden (${response.status})`);
  }
  return response;
}

/**
 * Fetch that attaches auth when a session exists, but degrades gracefully for
 * anonymous visitors. Used for public, anon-viewable data (profile overview,
 * stats, connections) so the NosFabrica "house" perspective can be served
 * without a login. When a session is present we delegate to
 * `authenticatedFetch` (with silent re-auth + redirect-on-expiry). When there
 * is no session at all we do a plain fetch with NO redirect side effects, so
 * anonymous browsing never wipes localStorage or bounces to the home page.
 */
async function optionalAuthFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  // An Account with no Session still counts: `authenticatedFetch` mints one, and
  // a deferred mint falls through to the anonymous read below.
  if (activeAccount()) {
    try {
      return await authenticatedFetch(url, options);
    } catch (err) {
      // A deferred Session says nothing about public data. Serve it anonymously
      // rather than leaving a signed-in reader worse off than a signed-out one.
      if (isSessionDeferredError(err)) return fetch(url, options);
      throw err;
    }
  }
  return fetch(url, options);
}

/**
 * Pull the backend's `detail`/`message` off a non-ok JSON response so 4xx/5xx
 * (incl. 409/422) surface a human error. Returns "" if the body isn't JSON.
 */
async function extractApiError(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  return data?.detail || data?.message || "";
}

export interface SchedulingItem {
  id: number;
  name: string;
  schedule_interval_seconds: number;
  priority: number;
  enabled: boolean;
  is_default: boolean;
  manual_quota_limit: number;
  manual_quota_window_seconds: number;
}

export interface CreateSchedulingBody {
  name: string;
  schedule_interval_seconds: number;
  priority?: number;
  enabled?: boolean;
  is_default?: boolean;
  manual_quota_limit?: number;
  manual_quota_window_seconds?: number;
}

export type UpdateSchedulingBody = Partial<CreateSchedulingBody>;

export interface SchedulerStats {
  throughput_per_day: number;
  demand_per_day: number;
  median_publish_seconds: number | null;
  lane_depths: Record<string, number>;
  tier_slip_seconds: Record<string, number>;
}

export interface SchedulingUserItem {
  pubkey: string;
  last_time_published_graperank: string | null;
}

export interface SchedulingUsersPage {
  items: SchedulingUserItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

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

export const apiClient = {
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

  async verifyAuthChallenge(pubkey: string, signedEvent: any) {
    const response = await fetch(
      `${getBrainstormApi()}/authChallenge/${pubkey}/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed_event: signedEvent }),
      },
    );
    if (!response.ok) {
      throw new Error(`Auth verification failed (${response.status})`);
    }
    const data = await response.json();
    if (!data?.data?.token) {
      throw new Error("No token received from server");
    }
    return data;
  },

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

  async getSchedulingPolicies(): Promise<SchedulingItem[]> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to fetch scheduling policies (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async createSchedulingPolicy(
    body: CreateSchedulingBody,
  ): Promise<SchedulingItem> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to create scheduling policy (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async updateSchedulingPolicy(
    id: number,
    body: UpdateSchedulingBody,
  ): Promise<SchedulingItem> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to update scheduling policy (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async deleteSchedulingPolicy(id: number): Promise<void> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling/${id}`,
      { method: "DELETE", signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to delete scheduling policy (${response.status})`,
      );
    }
  },

  async resyncObserver(pubkey: string, target: string) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/users/${pubkey}/resync?target=${encodeURIComponent(target)}`,
      { method: "POST", signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to resync observer (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async assignUserScheduling(pubkey: string, schedulingId: number) {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/users/${pubkey}/scheduling`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduling_id: schedulingId }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to assign scheduling policy (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async getSchedulingStats(): Promise<SchedulerStats> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling/stats`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to fetch scheduler stats (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async getSchedulingPolicyUsers(
    id: number,
    params: { page?: number; size?: number } = {},
  ): Promise<SchedulingUsersPage> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set("page", String(params.page));
    if (params.size != null) qs.set("size", String(params.size));
    const suffix = qs.toString() ? `?${qs}` : "";
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling/${id}/users${suffix}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to fetch policy users (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async assignPolicyUsers(
    id: number,
    pubkeys: string[],
  ): Promise<{ assigned: number }> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/scheduling/${id}/users`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkeys }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      throw new Error(
        (await extractApiError(response)) ||
          `Failed to assign users (${response.status})`,
      );
    }
    const json = await response.json();
    return json?.data ?? json;
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

  async triggerGrapeRank() {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/graperank`,
      {
        method: "POST",
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      const status = response.status;
      const lowerDetail = detail.toLowerCase();
      let friendlyMessage: string;
      if (status === 502 || status === 503 || status === 504) {
        friendlyMessage =
          "The Brainstorm server is temporarily unavailable. Please wait a few minutes and try again.";
      } else if (
        status === 429 ||
        lowerDetail.includes("rate") ||
        lowerDetail.includes("too many") ||
        lowerDetail.includes("wait") ||
        lowerDetail.includes("cooldown")
      ) {
        friendlyMessage =
          "Please wait a few minutes before recalculating. The server needs time between requests.";
      } else {
        friendlyMessage =
          "Something went wrong. Please wait a moment and try again.";
      }
      throw new Error(friendlyMessage);
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

  async getGrapeRankResult() {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/graperankResult`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch GrapeRank data (${response.status})`);
    }
    return await response.json();
  },

  /**
   * Check whether the logged-in user is allowed to search from their own
   * trust perspective ("search observer"). Requires authentication.
   * Returns the boolean `data` field from `/user/isSearchObserver`.
   */
  async getIsSearchObserver(timeoutMs: number = 15000): Promise<boolean> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/isSearchObserver`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`Failed to check search observer status (${response.status})`);
    }
    const json = await response.json();
    return json?.data === true;
  },

  /**
   * Free-text profile search via the Brainstorm backend `/search/byText`.
   * When `ownPubkey` is true the search is run from the logged-in user's own
   * trust perspective and the request is authenticated (session token sent);
   * otherwise it runs from NosFabrica's perspective without authentication.
   */
  async searchByText(
    text: string,
    onlyRanked: boolean = true,
    ownPubkey: boolean = false,
    timeoutMs: number = 15000,
    maxHits?: number,
  ): Promise<{
    code: number;
    message: string | null;
    data: {
      query: string;
      numResults: number;
      results: Array<Record<string, unknown>>;
    };
  }> {
    const params = new URLSearchParams({
      text,
      onlyRanked: String(onlyRanked),
      ownPubkey: String(ownPubkey),
    });
    if (typeof maxHits === "number" && Number.isFinite(maxHits)) {
      params.set("maxHits", String(Math.trunc(maxHits)));
    }
    const url = `${getBrainstormApi()}/search/byText?${params.toString()}`;
    const response = ownPubkey
      ? await authenticatedFetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      : await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    return await response.json();
  },

  /**
   * Look up a single profile's NosFabrica ("house") perspective trust score —
   * ---- subscription ----
   *
   * The backend's record of what the user is paying for. Note this only
   * *reports* entitlement — what a supporter actually gets is a scheduling
   * policy applied server-side, so a failure here costs a label, not a benefit.
   * See docs/payments/FLASH-INTEGRATION.md.
   */
  async getSubscription(timeoutMs: number = 15000): Promise<{
    tier: string;
    status: string;
    current_period_end: string | null;
    rail: string | null;
  }> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/subscription`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch subscription (${response.status})`);
    }
    const json = await response.json();
    return json?.data;
  },

  /** Cancel at period end. Flash's own policy decides when it takes effect. */
  async cancelSubscription(timeoutMs: number = 15000): Promise<void> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/subscription`,
      { method: "DELETE", signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`Failed to cancel subscription (${response.status})`);
    }
  },

  /**
   * `influence` (0..1) — from our own backend. Issues an *unauthenticated*
   * `/user/{pubkey}/overview` request so the result is always the house POV
   * (the default observer), regardless of whether a viewer is logged in. Used
   * by the Profile page's dual meter and the share page's network-trust score.
   * Returns null if the backend has no overview for the pubkey (not yet indexed
   * by Brainstorm) or the request fails.
   */
  async getHouseInfluence(
    pubkey: string,
    timeoutMs: number = 8000,
  ): Promise<number | null> {
    if (!pubkey) return null;
    try {
      // Plain fetch (no session token) → NosFabrica/house perspective.
      const response = await fetch(`${getBrainstormApi()}/user/${pubkey}/overview`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const json = await response.json();
      // Overview responses are wrapped: { code, message, data: { influence } }.
      const influence = (json as { data?: { influence?: unknown } })?.data?.influence;
      return typeof influence === "number" && Number.isFinite(influence) ? influence : null;
    } catch {
      return null;
    }
  },

  async getGrapeRankPreset(): Promise<{
    code?: number;
    message?: string;
    data?: { preset?: string };
  }> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/graperank/preset`,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to load your trust perspective preset (${response.status}).`,
      );
    }
    return await response.json();
  },

  async setGrapeRankPreset(
    preset: "DEFAULT" | "PERMISSIVE" | "RESTRICTIVE",
  ): Promise<{ code?: number; message?: string; data?: { preset?: string } }> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/graperank/preset`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Couldn't save your trust perspective. Please try again (${response.status}).`,
      );
    }
    return await response.json();
  },

  async publishDefaultAssistantProfile(): Promise<{
    code?: number;
    message?: string;
    name?: string;
    event_id?: string;
    assistant_pubkey?: string;
    data?: { event_id?: string; assistant_pubkey?: string; name?: string };
  }> {
    let response: Response;
    try {
      response = await authenticatedFetch(
        `${getBrainstormApi()}/user/assistantProfile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch (err) {
      // Network/transport-level failures (TypeError: Failed to fetch, AbortError, DNS, CORS, etc.)
      throw new Error("The assistant service is unavailable right now.");
    }
    if (response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error("The assistant service is unavailable right now.");
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      // Log technical details for debugging, but surface a friendly message to the user.
      // eslint-disable-next-line no-console
      console.warn("[assistantProfile] publish failed", { status: response.status, detail });
      throw new Error("Could not publish your assistant right now. Please try again in a moment.");
    }
    return await response.json();
  },

  async publishBrainstormAssistantProfile(profile: { name?: string; about?: string; picture?: string; banner?: string; lud16?: string; nip05?: string; website?: string }) {
    // Publishes the user's assistant kind-0 metadata event. The backend route is
    // `/user/assistantProfile` (there is no `/user/publishAssistantProfile`); the
    // profile fields are sent as the body and ignored by the server if unused.
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/assistantProfile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (response.status === 404) {
      throw new Error("404 - Endpoint not found");
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Publish failed (${response.status})`);
    }
    return await response.json();
  },

  async getAdminStats(): Promise<{
    totalUsers: number;
    scoredUsers: number;
    spAdopters: number;
    totalReports: number;
    queueDepth: number;
  } | null> {
    try {
      const response = await authenticatedFetch(
        `${getBrainstormApi()}/admin/stats`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) return null;
      const json = await response.json();
      const stats = json?.data ?? json;
      return {
        totalUsers: stats?.total_users ?? stats?.totalUsers ?? 0,
        scoredUsers: stats?.scored_users ?? stats?.scoredUsers ?? 0,
        spAdopters: stats?.sp_adopters ?? stats?.spAdopters ?? 0,
        totalReports: stats?.total_reports ?? stats?.totalReports ?? 0,
        queueDepth: stats?.queue_depth ?? stats?.queueDepth ?? 0,
      };
    } catch {
      return null;
    }
  },

  async getAdminUsers(params: {
    search?: string;
    sort?: string;
    order?: string;
    days?: number;
    page?: number;
    size?: number;
  } = {}) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.sort) qs.set("sort", params.sort);
    if (params.order) qs.set("order", params.order);
    if (params.days) qs.set("days", params.days.toString());
    if (params.page) qs.set("page", params.page.toString());
    if (params.size) qs.set("size", params.size.toString());
    const url = `${getBrainstormApi()}/admin/users${qs.toString() ? `?${qs}` : ""}`;
    const response = await authenticatedFetch(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch admin users (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async getAdminUserHistory(pubkey: string, params: { page?: number; size?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", params.page.toString());
    if (params.size) qs.set("size", params.size.toString());
    const url = `${getBrainstormApi()}/admin/users/${pubkey}/history${qs.toString() ? `?${qs}` : ""}`;
    const response = await authenticatedFetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user history (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async getAdminActivity(params: { page?: number; size?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", params.page.toString());
    if (params.size) qs.set("size", params.size.toString());
    const url = `${getBrainstormApi()}/admin/activity${qs.toString() ? `?${qs}` : ""}`;
    const response = await authenticatedFetch(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch admin activity (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
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

  async getAdminAssistantStats(): Promise<{
    totalAssistants: number;
    totalPublishes: number;
    publishes24h: number;
    publishes7d: number;
    lastPublishAt: string | null;
  } | null> {
    try {
      const response = await authenticatedFetch(
        `${getBrainstormApi()}/admin/assistants/stats`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) return null;
      const json = await response.json();
      const stats = json?.data ?? json;
      return {
        totalAssistants: stats?.total_assistants ?? stats?.totalAssistants ?? 0,
        totalPublishes: stats?.total_publishes ?? stats?.totalPublishes ?? 0,
        publishes24h: stats?.publishes_24h ?? stats?.publishes24h ?? 0,
        publishes7d: stats?.publishes_7d ?? stats?.publishes7d ?? 0,
        lastPublishAt: stats?.last_publish_at ?? stats?.lastPublishAt ?? null,
      };
    } catch {
      return null;
    }
  },

  async getAdminAssistants(params: {
    search?: string;
    page?: number;
    size?: number;
  } = {}): Promise<{
    items: {
      owner_pubkey: string;
      assistant_pubkey?: string | null;
      event_id?: string | null;
      publish_count: number;
      first_published_at?: string | null;
      last_published_at?: string | null;
    }[];
    total: number;
    page: number;
    pages: number;
    size: number;
  } | null> {
    try {
      const qs = new URLSearchParams();
      if (params.search) qs.set("search", params.search);
      if (params.page) qs.set("page", params.page.toString());
      if (params.size) qs.set("size", params.size.toString());
      const url = `${getBrainstormApi()}/admin/assistants${qs.toString() ? `?${qs}` : ""}`;
      const response = await authenticatedFetch(url, {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return null;
      const json = await response.json();
      const data = json?.data ?? json;
      return {
        items: data?.items ?? [],
        total: data?.total ?? 0,
        page: data?.page ?? 1,
        pages: data?.pages ?? 1,
        size: data?.size ?? (params.size ?? 25),
      };
    } catch {
      return null;
    }
  },

  async getAdminAssistantHistory(ownerPubkey: string, params: { page?: number; size?: number } = {}): Promise<{
    items: { event_id: string; published_at: string; status?: string | null }[];
    total: number;
    page: number;
    pages: number;
  } | null> {
    try {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", params.page.toString());
      if (params.size) qs.set("size", params.size.toString());
      const url = `${getBrainstormApi()}/admin/assistants/${ownerPubkey}/history${qs.toString() ? `?${qs}` : ""}`;
      const response = await authenticatedFetch(url, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;
      const json = await response.json();
      const data = json?.data ?? json;
      return {
        items: data?.items ?? [],
        total: data?.total ?? 0,
        page: data?.page ?? 1,
        pages: data?.pages ?? 1,
      };
    } catch {
      return null;
    }
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
