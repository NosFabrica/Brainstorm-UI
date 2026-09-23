/**
 * Scheduling policies, who is on them, and the admin overrides that pin a
 * user to one.
 */

import type { AdminUserDetail } from "./admin";
import { adminJson, fetch, jsonBody } from "./core";

export interface SchedulingItem {
  id: number;
  name: string;
  schedule_interval_seconds: number;
  priority: number;
  enabled: boolean;
  is_default: boolean;
  /**
   * Whether the policy may reach a public response at all. A plan pointed at a
   * non-public policy is dropped from `/billing/plans`, so it sells nothing —
   * optional here because older servers don't send it.
   */
  is_public?: boolean;
  manual_quota_limit: number;
  manual_quota_window_seconds: number;
}

export interface CreateSchedulingBody {
  name: string;
  schedule_interval_seconds: number;
  priority?: number;
  enabled?: boolean;
  is_default?: boolean;
  /** Whether a plan mapped to this policy may be sold on the pricing page. */
  is_public?: boolean;
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

export const schedulingApi = {
  async getSchedulingPolicies(): Promise<SchedulingItem[]> {
    return adminJson("/admin/scheduling", "Failed to fetch scheduling policies");
  },

  async createSchedulingPolicy(
    body: CreateSchedulingBody,
  ): Promise<SchedulingItem> {
    return adminJson(
      "/admin/scheduling",
      "Failed to create scheduling policy",
      jsonBody("POST", body),
    );
  },

  async updateSchedulingPolicy(
    id: number,
    body: UpdateSchedulingBody,
  ): Promise<SchedulingItem> {
    return adminJson(
      `/admin/scheduling/${id}`,
      "Failed to update scheduling policy",
      jsonBody("PATCH", body),
    );
  },

  async deleteSchedulingPolicy(id: number): Promise<void> {
    await adminJson(
      `/admin/scheduling/${id}`,
      "Failed to delete scheduling policy",
      { method: "DELETE" },
    );
  },

  async resyncObserver(pubkey: string, target: string) {
    return adminJson(
      `/admin/users/${pubkey}/resync?target=${encodeURIComponent(target)}`,
      "Failed to resync observer",
      { method: "POST" },
    );
  },

  /**
   * Drops an admin's override so billing decides again. Assigning any policy —
   * the default included — records the admin as its source, which billing
   * will neither grant over nor revoke against; only this verb lets go. The
   * server re-reads billing before answering, so the result is the policy in
   * effect now: a paying subscriber comes back on what they pay for.
   */
  async clearUserSchedulingOverride(pubkey: string): Promise<AdminUserDetail> {
    return adminJson(
      `/admin/users/${pubkey}/scheduling/override`,
      "Failed to reset the scheduling override",
      { method: "DELETE" },
      // Waits on a Flash read before it answers.
      30000,
    );
  },

  async assignUserScheduling(pubkey: string, schedulingId: number) {
    return adminJson(
      `/admin/users/${pubkey}/scheduling`,
      "Failed to assign scheduling policy",
      jsonBody("PUT", { scheduling_id: schedulingId }),
    );
  },

  async getSchedulingStats(): Promise<SchedulerStats> {
    return adminJson("/admin/scheduling/stats", "Failed to fetch scheduler stats");
  },

  async getSchedulingPolicyUsers(
    id: number,
    params: { page?: number; size?: number } = {},
  ): Promise<SchedulingUsersPage> {
    const qs = new URLSearchParams();
    if (params.page != null) qs.set("page", String(params.page));
    if (params.size != null) qs.set("size", String(params.size));
    const suffix = qs.toString() ? `?${qs}` : "";
    return adminJson(
      `/admin/scheduling/${id}/users${suffix}`,
      "Failed to fetch policy users",
    );
  },

  async assignPolicyUsers(
    id: number,
    pubkeys: string[],
  ): Promise<{ assigned: number }> {
    return adminJson(
      `/admin/scheduling/${id}/users`,
      "Failed to assign users",
      jsonBody("PUT", { pubkeys }),
      30000,
    );
  },
};
