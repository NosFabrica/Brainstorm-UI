/**
 * The admin console's own reads — stats, users, activity, assistants — plus
 * the assistant profile publishes and Trusted Lists.
 */

import { adminJson, authenticatedFetch, extractApiError, fetch, getBrainstormApi } from "./core";

/** granted ≠ live scheduling; `admin_overrides` shares the shape (source = admin). */
/**
 * One user's scheduling as the server has it after an admin action — for a
 * released override, the policy billing settled on in the same request.
 */
/** This server has no trusted-lists endpoint yet (server PR #86 not deployed). */
export class TrustedListsUnavailableError extends Error {
  constructor() {
    super("Trusted lists aren't available on this server yet.");
    this.name = "TrustedListsUnavailableError";
  }
}

/** One Trusted List a run touched (server PR #86, `TrustedListTagResult`). */
export interface TrustedListTagResult {
  slug: string;
  d_tag: string;
  /** Empty for a retracted row. */
  tag_event_id: string;
  status: "published" | "failed" | "retracted";
  taggings_considered: number;
  member_count: number;
  /** Set when the list failed to publish. */
  error?: string | null;
}

/** What one run did for one observer (server PR #86, `TrustedListRunData`). */
export interface TrustedListRunData {
  observer: string;
  /** The observer's assistant key — the one that signed the lists. */
  signing_pubkey?: string | null;
  /** Every tagging the server holds — global, not this observer's. */
  taggings_in_store: number;
  qualifying_asserters: number;
  dictionary_size: number;
  published: number;
  failed: number;
  retracted: number;
  empty_reason?: "no_taggings_ingested" | "no_qualifying_asserters" | "no_tags_met_use_threshold" | null;
  /** Published and failed lists first (most-used tag first), retracted ones after. */
  tags: TrustedListTagResult[];
}

export interface AdminUserDetail {
  pubkey: string;
  scheduling_id: number | null;
  scheduling_name: string;
}

export const adminApi = {
  /**
   * The kind-10040 rows the server hands a user to publish (`GET /setup/{pubkey}`):
   * which assistant key signs each kind, on which relay. Since PR #86 a bare
   * "30392" row names where that observer's Trusted Lists are published.
   */
  async getSetupRows(pubkey: string): Promise<string[][]> {
    const rows = await adminJson<unknown>(
      `/setup/${pubkey}`,
      "Failed to read setup",
    );
    return Array.isArray(rows) ? rows : [];
  },

  /**
   * Computes and publishes one observer's Trusted Lists now (server PR #86):
   * kind-30392 events built from that observer's web of trust, signed by their
   * assistant key, with lists whose tags no longer qualify retracted. The
   * server does it all before answering — up to about a minute.
   */
  async publishTrustedLists(observer: string): Promise<TrustedListRunData> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/admin/trustedLists/${observer}`,
      { method: "POST", signal: AbortSignal.timeout(120_000) },
    );
    if (response.status === 404 || response.status === 405) throw new TrustedListsUnavailableError();
    if (!response.ok) {
      throw new Error((await extractApiError(response)) || `Failed to publish trusted lists (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? json;
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
};
