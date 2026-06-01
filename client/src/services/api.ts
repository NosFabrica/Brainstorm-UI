import { extractAdminFlag } from "@/lib/jwt";
import { env } from "@/lib/runtimeEnv";
import { clearUserCache, signEventLocally, hasLocalSecretKey } from "./nostr";

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

let isReauthenticating = false;
let reauthPromise: Promise<boolean> | null = null;
let isRedirectingToLogin = false;

export function isAuthRedirecting(): boolean {
  return isRedirectingToLogin;
}

/**
 * True only when a real session token is present. Use this (not just the
 * presence of `nostr_user`) to gate any call that goes through
 * `authenticatedFetch` (e.g. getSelf), because that path wipes storage and
 * hard-redirects to "/" on a 401. A stale `nostr_user` without a token must
 * never trigger that redirect on public/anonymous pages.
 */
export function hasSessionToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem("brainstorm_session_token");
  } catch {
    return false;
  }
}

function handleUnauthorized() {
  isRedirectingToLogin = true;
  localStorage.removeItem("brainstorm_session_token");
  localStorage.removeItem("nostr_user");
  try { sessionStorage.removeItem("brainstorm_sk_hex"); } catch {}
  window.location.href = "/";
}

async function waitForNostrExtension(maxWait = 3000): Promise<boolean> {
  if (window.nostr) return true;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 100));
    if (window.nostr) return true;
  }
  return false;
}

async function silentReauth(): Promise<boolean> {
  if (isReauthenticating && reauthPromise) return reauthPromise;

  isReauthenticating = true;
  reauthPromise = (async () => {
    try {
      const storedUser = localStorage.getItem("nostr_user");
      if (!storedUser) return false;

      const user = JSON.parse(storedUser);
      if (!user?.pubkey) return false;

      const hasSk = hasLocalSecretKey();
      if (!hasSk) {
        const extensionReady = await waitForNostrExtension();
        if (!extensionReady) return false;
      }

      const challengeResponse = await fetch(
        `${getBrainstormApi()}/authChallenge/${user.pubkey}`,
      );
      if (!challengeResponse.ok) return false;
      const challengeData = await challengeResponse.json();
      const challenge = challengeData?.data?.challenge;
      if (!challenge) return false;

      const event = {
        kind: 22242,
        tags: [
          ["t", "brainstorm_login"],
          ["challenge", challenge],
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: user.pubkey,
      };

      const signedEvent = await signEventLocally(event);

      const verifyResponse = await fetch(
        `${getBrainstormApi()}/authChallenge/${user.pubkey}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signed_event: signedEvent }),
        },
      );
      if (!verifyResponse.ok) return false;
      const verifyData = await verifyResponse.json();
      const token = verifyData?.data?.token;
      if (!token) return false;

      localStorage.setItem("brainstorm_session_token", token);
      try {
        const storedUserStr = localStorage.getItem("nostr_user");
        if (storedUserStr) {
          const storedUserObj = JSON.parse(storedUserStr);
          storedUserObj.isAdmin = extractAdminFlag(token);
          localStorage.setItem("nostr_user", JSON.stringify(storedUserObj));
          clearUserCache();
        }
      } catch {}
      return true;
    } catch {
      return false;
    } finally {
      isReauthenticating = false;
      reauthPromise = null;
    }
  })();

  return reauthPromise;
}

async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = localStorage.getItem("brainstorm_session_token");
  if (!token) {
    const reauthOk = await silentReauth();
    if (!reauthOk) {
      handleUnauthorized();
      throw new Error("No session token found");
    }
    token = localStorage.getItem("brainstorm_session_token");
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, access_token: token! },
  });
  if (response.status === 401) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail || data?.message || "";
    const reauthOk = await silentReauth();
    if (reauthOk) {
      const newToken = localStorage.getItem("brainstorm_session_token");
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
  const hasSession =
    !!localStorage.getItem("brainstorm_session_token") ||
    !!localStorage.getItem("nostr_user");
  if (hasSession) {
    return authenticatedFetch(url, options);
  }
  return fetch(url, options);
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

  async getSelf() {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/self`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user data (${response.status})`);
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
    const response = await optionalAuthFetch(
      `${getBrainstormApi()}/user/${pubkey}/overview`,
      {
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch user overview (${response.status})`);
    }
    return await response.json();
  },

  async getUserStats(
    pubkey: string,
    opts?: {
      verified_threshold?: number;
      tier_high?: number;
      tier_trusted?: number;
      tier_neutral?: number;
    },
  ) {
    const params = new URLSearchParams();
    if (opts?.verified_threshold != null)
      params.set("verified_threshold", String(opts.verified_threshold));
    if (opts?.tier_high != null)
      params.set("tier_high", String(opts.tier_high));
    if (opts?.tier_trusted != null)
      params.set("tier_trusted", String(opts.tier_trusted));
    if (opts?.tier_neutral != null)
      params.set("tier_neutral", String(opts.tier_neutral));
    const qs = params.toString();
    const url = `${getBrainstormApi()}/user/${pubkey}/stats${qs ? `?${qs}` : ""}`;
    const response = await optionalAuthFetch(url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user stats (${response.status})`);
    }
    return await response.json();
  },

  async getUserConnections(
    pubkey: string,
    kind:
      | "followed_by"
      | "following"
      | "muted_by"
      | "muting"
      | "reported_by"
      | "reporting",
    opts?: { limit?: number; cursor?: string },
  ) {
    const params = new URLSearchParams();
    params.set("kind", kind);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    const url = `${getBrainstormApi()}/user/${pubkey}/connections?${params.toString()}`;
    const response = await optionalAuthFetch(url, {
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

  async getGrapeRankResult() {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/graperankResult`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch GrapeRank data (${response.status})`);
    }
    return await response.json();
  },

  async searchByText(
    text: string,
    onlyRanked: boolean = true,
    timeoutMs: number = 15000,
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
    });
    const response = await fetch(
      `${getBrainstormApi()}/search/byText?${params.toString()}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    return await response.json();
  },

  async searchProfilesLegacyMeili(
    text: string,
    pov: "house" | "user" = "house",
    userPubkey?: string,
    limit: number = 50,
    timeoutMs: number = 15000,
  ): Promise<{
    success: boolean;
    hits: Array<Record<string, unknown>>;
    estimatedTotalHits?: number;
  }> {
    const params = new URLSearchParams({
      q: text,
      limit: String(limit),
      offset: "0",
      wotPov: pov,
    });
    if (pov === "user" && userPubkey) params.set("userPubkey", userPubkey);
    const response = await fetch(
      `https://brainstorm.world/api/search/profiles/meili?${params.toString()}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }
    const data = await response.json();
    if (!data?.success) {
      throw new Error("Search service unavailable");
    }
    return {
      success: true,
      hits: Array.isArray(data.hits) ? data.hits : [],
      estimatedTotalHits:
        typeof data.estimatedTotalHits === "number"
          ? data.estimatedTotalHits
          : undefined,
    };
  },

  /**
   * Look up a single profile's NosFabrica ("house") perspective `wot_rank`
   * (returned 0..100 by Meili). Used by the Profile page to render the dual
   * meter regardless of entry point (Search, Network, deep link), since the
   * per-profile overview endpoint doesn't yet accept a `wotPov` parameter.
   * Returns null if the pubkey isn't in the Meili index or if no rank field
   * is present on the matching hit.
   */
  async lookupNosfabricaRank(
    hexPubkey: string,
    npub: string,
    timeoutMs: number = 8000,
  ): Promise<number | null> {
    if (!hexPubkey || !npub) return null;
    try {
      // Query by npub — Meili indexes both hex pubkey and npub as searchable
      // fields; npub is the more discriminating token.
      const res = await this.searchProfilesLegacyMeili(npub, "house", undefined, 5, timeoutMs);
      const targetHex = hexPubkey.toLowerCase();
      const hit = res.hits.find(h => typeof h.pubkey === "string" && (h.pubkey as string).toLowerCase() === targetHex);
      if (!hit) return null;
      const raw =
        (typeof hit.wot_rank === "number" && Number.isFinite(hit.wot_rank) ? (hit.wot_rank as number) : null) ??
        (typeof (hit as Record<string, unknown>).wotRank === "number" && Number.isFinite((hit as Record<string, unknown>).wotRank as number) ? ((hit as Record<string, unknown>).wotRank as number) : null) ??
        (typeof (hit as Record<string, unknown>).rank === "number" && Number.isFinite((hit as Record<string, unknown>).rank as number) ? ((hit as Record<string, unknown>).rank as number) : null);
      return raw;
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
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/publishAssistantProfile`,
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
