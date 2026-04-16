import { extractAdminFlag } from "@/lib/jwt";
import { clearUserCache } from "./nostr";

export type ApiEnvironment = "staging" | "production";

const API_URLS: Record<ApiEnvironment, string> = {
  staging: "https://brainstormserver-staging.nosfabrica.com",
  production: "https://brainstormserver.nosfabrica.com",
};

const ENV_STORAGE_KEY = "brainstorm_api_env";

export function getApiEnvironment(): ApiEnvironment {
  const token = localStorage.getItem("brainstorm_session_token");
  const isAdmin = token ? extractAdminFlag(token) : false;
  if (!isAdmin) return "staging";
  const stored = localStorage.getItem(ENV_STORAGE_KEY);
  if (stored === "production") return "production";
  return "staging";
}

export function setApiEnvironment(env: ApiEnvironment): void {
  localStorage.setItem(ENV_STORAGE_KEY, env);
}

export function getApiBaseUrl(): string {
  return API_URLS[getApiEnvironment()];
}

function getBrainstormApi(): string {
  return getApiBaseUrl();
}

let isReauthenticating = false;
let reauthPromise: Promise<boolean> | null = null;
let isRedirectingToLogin = false;

export function isAuthRedirecting(): boolean {
  return isRedirectingToLogin;
}

function handleUnauthorized() {
  isRedirectingToLogin = true;
  localStorage.removeItem("brainstorm_session_token");
  localStorage.removeItem("nostr_user");
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

      const extensionReady = await waitForNostrExtension();
      if (!extensionReady) return false;

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

      const signedEvent = await window.nostr!.signEvent(event);

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
    const response = await authenticatedFetch(
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

  async verifyNsecEncryption() {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/nsec-encryption/verify`,
      { method: "POST", signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Verify encryption failed (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
  },

  async rotateNsecEncryption() {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/nsec-encryption/rotate`,
      { method: "POST", signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      let detail = errorData?.detail || errorData?.message || "";
      if (typeof detail === "object") detail = JSON.stringify(detail);
      throw new Error(detail || `Rotate encryption key failed (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
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
