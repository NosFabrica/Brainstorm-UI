/**
 * Subscriptions, Flash's own records, and the admin billing surface:
 * plan mappings, the roster, blocks, cancellations and the divergence report.
 */

import { adminJson, authenticatedFetch, extractApiError, fetch, getBrainstormApi, jsonBody } from "./core";

/**
 * Flash's own record for one subscription. The body is returned verbatim (no
 * `data` unwrap — it's Flash's, not ours).
 *
 * The failure the caller must not misread is 404 vs 503: "Flash has no such
 * subscription" is grounds for dismissing a row, "we couldn't reach Flash" is
 * grounds for trying later. The server's `detail` already says which; this only
 * keeps the two from collapsing into one generic message.
 */
async function readFlashRecord(path: string): Promise<unknown> {
  const response = await authenticatedFetch(`${getBrainstormApi()}${path}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const detail = await extractApiError(response);
    if (detail) throw new Error(detail);
    throw new Error(
      response.status === 404
        ? "Flash has no subscription for this record."
        : `Couldn't read Flash's record (${response.status}).`,
    );
  }
  return await response.json();
}

/**
 * One operator write against a subscription in Flash. Consequential and slow —
 * it is a round trip to Flash and back, plus the re-read that follows — so it
 * carries the 30s budget the other Flash-backed calls use.
 *
 * The server already tells a refused credential (502, "the key may not carry
 * the scope") apart from an unreachable Flash (503) in its `detail`; passing
 * that through verbatim is what keeps them apart here.
 */
async function writeBillingSubscription(
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  what: string,
): Promise<AdminBillingSubscriptionAction> {
  return adminJson(path, `Couldn't ${what}`, jsonBody(method, body), 30000);
}

/**
 * Settle one signup that named nobody. Separate from the write above because
 * the handle is different: these rows have no pubkey, only a Flash id, and it
 * comes off a report rather than out of our own roster — so it is escaped
 * rather than trusted to be path-shaped.
 *
 * Every refusal here is a sentence the server wrote ("Flash says this
 * subscription already belongs to a different user"), so it is passed through
 * verbatim rather than restated as a status code.
 */
async function writeUnresolved(
  subscriptionId: string,
  verb: "attribute" | "dismiss",
  body: Record<string, unknown>,
  what: string,
): Promise<AdminBillingResolution> {
  return adminJson(
    `/admin/billing/unresolved/${encodeURIComponent(subscriptionId)}/${verb}`,
    `Couldn't ${what}`,
    jsonBody("POST", body),
    30000,
  );
}

/**
 * One row of the admin Billing tab — the server's BillingSubscriptionItem
 * (see /docs on the server). Pubkey-keyed, so every row is an attributed
 * subscriber; the unsettled/unmatched cases live in /admin/billing/divergence.
 * `flash_status` is Flash's open status set, passed through verbatim.
 */
export interface AdminBillingSubscription {
  pubkey: string;
  flash_status: string;
  flash_subscription_id?: string | null;
  current_period_end?: string | null;
  /** Set means this subscription ends then, whatever `flash_status` says. */
  cancel_effective_date?: string | null;
  last_synced_at?: string | null;
  last_sync_error?: string | null;
  granted_scheduling_id?: number | null;
  granted_scheduling_name?: string | null;
  scheduling_id?: number | null;
  scheduling_name?: string | null;
  scheduling_source: string;
  billing_blocked: boolean;
  /** The paid period's start; with `current_period_end` the row reads as a span. */
  current_period_start?: string | null;
  /** When they're charged again — a renewal that is due vs one that silently stopped. */
  next_billing_date?: string | null;
}

/**
 * What Flash did, beside what the server then did about it.
 *
 * `cancellation_scheduled` is the field to read after a cancel — never
 * `flash_status`, which stays `active` until `cancel_effective_date` lands
 * because this account cancels at period end.
 */
export interface AdminBillingSubscriptionAction {
  pubkey: string;
  subscription_id: string;
  flash_status: string;
  cancel_effective_date?: string | null;
  cancellation_scheduled: boolean;
  /** Whether the re-read that followed actually moved the user's tier. */
  applied: boolean;
  /**
   * The server's EntitlementReason, or `reread_failed` when the write landed in
   * Flash and the re-read that follows it did not. That case is a success in
   * Flash and a stale roster here — do not report it as a failed action.
   */
  reason: string;
}

/**
 * How a signup that named nobody was settled. `applied` false is a decision,
 * not a failure, and `entitlement_reason` (the server's EntitlementReason) is
 * what says which decision — so report it as an answer, never as a no-op.
 */
export interface AdminBillingResolution {
  subscription_id: string;
  /** `attributed` or `dismissed`. */
  resolution: string;
  pubkey: string | null;
  applied: boolean;
  /** Absent only on a dismissal, which runs no grant. */
  entitlement_reason?: string | null;
  /** How many stored webhook deliveries stopped being unsettled by this. */
  events_settled: number;
}

/** One kind of billing disagreement; `truncated` means the list admits it's capped. */
/**
 * The server's `SubscriptionView` — what GET /user/subscription answers.
 * `policy` is what they receive (their scheduling assignment; there is no
 * tier string), `plan` is which one they bought priced from Flash's snapshot,
 * the four dates come off the row, `manage_url` is Flash's portal. No `rail`:
 * Flash exposes no payment method. Normalized by services/subscription.ts.
 */
export interface SubscriptionView {
  policy: { id: number; name: string; schedule_interval_seconds?: number; is_default: boolean } | null;
  plan: { plan_id: string | null; amount_minor: number | null; currency: string | null; billing_interval: string | null; is_active: boolean } | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  cancel_effective_date: string | null;
  manage_url: string | null;
}

/** POST /user/subscription/refresh: the view plus what the given id turned
 *  out to be (server 4093c93). Absent on older servers. */
export interface RefreshSubscriptionView extends SubscriptionView {
  verification?: "verified" | "mismatch" | "unknown" | "not_given" | "unavailable";
}

/**
 * One section of the divergence report. Rows are typed per section below (as
 * the server's OpenAPI names them); the untyped alias stays for a kind this
 * build doesn't know yet, which the tab renders verbatim.
 */
export interface DivergenceSection<R = Record<string, unknown>> {
  count: number;
  truncated: boolean;
  rows: R[];
}

export type AdminBillingDivergenceSection = DivergenceSection;

export type DivergenceKind =
  | "policy_mismatch"
  | "admin_overrides"
  | "stale_syncs"
  | "failing_syncs"
  | "unresolved_signups"
  | "unmapped_plans"
  | "unrecognised_statuses"
  | "exhausted_events"
  | "abandoned_checkouts"
  | "retired_plan_subscribers";

export interface PolicyMismatchRow {
  pubkey: string;
  flash_status: string;
  granted_scheduling_id: number | null;
  scheduling_id: number | null;
  scheduling_source: string;
}

export interface StaleSyncRow {
  pubkey: string;
  flash_status: string;
  last_synced_at: string | null;
}

export interface FailingSyncRow {
  pubkey: string;
  last_sync_error: string | null;
  last_synced_at: string | null;
}

export interface UnresolvedSignupRow {
  id: number;
  event: string;
  created_at: string | null;
  process_error: string | null;
  flash_subscription_id: string | null;
}

export interface UnmappedPlanRow extends UnresolvedSignupRow {
  external_ref: string | null;
  flash_service_id: string | null;
  flash_plan_id: string | null;
}

export interface UnrecognisedStatusRow {
  flash_status: string;
  subscribers: number;
}

export interface ExhaustedEventRow {
  id: number;
  event: string;
  attempts: number;
  process_error: string | null;
}

export interface AbandonedCheckoutRow {
  pubkey: string;
  flash_subscription_id: string | null;
  sync_error_since: string | null;
}

export interface RetiredPlanSubscriberRow {
  pubkey: string;
  flash_subscription_id: string | null;
  flash_status: string;
  billing_plan_id: number | null;
  granted_scheduling_id: number | null;
}

/** The whole report. Known kinds typed; the index signature keeps a future
 *  kind renderable. Every field is read tolerantly — a lagging server may omit some. */
export type AdminBillingDivergenceReport = Partial<{
  policy_mismatch: DivergenceSection<PolicyMismatchRow>;
  admin_overrides: DivergenceSection<PolicyMismatchRow>;
  stale_syncs: DivergenceSection<StaleSyncRow>;
  failing_syncs: DivergenceSection<FailingSyncRow>;
  unresolved_signups: DivergenceSection<UnresolvedSignupRow>;
  unmapped_plans: DivergenceSection<UnmappedPlanRow>;
  unrecognised_statuses: DivergenceSection<UnrecognisedStatusRow>;
  exhausted_events: DivergenceSection<ExhaustedEventRow>;
  abandoned_checkouts: DivergenceSection<AbandonedCheckoutRow>;
  retired_plan_subscribers: DivergenceSection<RetiredPlanSubscriberRow>;
}> &
  Record<string, DivergenceSection | undefined>;

/** One `billing_plan` row: which Flash plan grants what, and whether we sell it. */
/** One service on our Flash account, as `GET /admin/billing/flash/services` lists it. */
export interface FlashServiceItem {
  id: string;
  name: string;
  description?: string | null;
  signup_url?: string | null;
}

/**
 * One plan as Flash offers it, from `GET /admin/billing/flash/services/{id}/plans`.
 * `mapping_id` is set when a mapping already claims it, so a picker can show it
 * as taken. `status` is Flash's ("active" when they offer it); their set is open.
 */
export interface FlashPlanItem {
  id: string;
  service_id: string;
  name: string;
  description?: string | null;
  amount_minor?: number | null;
  currency: string;
  billing_interval?: string | null;
  status: string;
  sort_order: number;
  signup_url?: string | null;
  mapping_id?: number | null;
}

export interface AdminBillingPlanMapping {
  id: number;
  flash_service_id: string;
  flash_plan_id: string;
  /** The policy this plan grants. It *is* the tier — there is no tier string. */
  scheduling_id: number;
  /**
   * Whether WE sell it — not Flash's plan status, which says whether THEY offer
   * it. Withdrawing a plan from sale does not change what subscribers receive.
   */
  is_active: boolean;
}

/**
 * A mapping is two decisions and nothing else. The server REFUSES a body
 * carrying a price, period or copy rather than ignoring it — those are read
 * from Flash, and silently dropping them would let this form claim an edit
 * that never happened.
 */
export interface CreateAdminBillingPlanBody {
  flash_service_id: string;
  flash_plan_id: string;
  scheduling_id: number;
  is_active?: boolean;
}

/**
 * A PATCH writes every field it includes, so callers must send only what the
 * admin actually changed — an untouched form is how a staging scheduling policy
 * ended up named "string" with a zero cadence.
 */
export type UpdateAdminBillingPlanBody = Partial<CreateAdminBillingPlanBody>;

export const billingApi = {
  /**
   * Look up a single profile's NosFabrica ("house") perspective trust score —
   * ---- subscription ----
   *
   * The backend's record of what the user is paying for. Note this only
   * *reports* entitlement — what a paying account actually gets is a scheduling
   * policy applied server-side, so a failure here costs a label, not a benefit.
   * See docs/payments/FLASH-INTEGRATION.md.
   */
  async getSubscription(timeoutMs: number = 15000): Promise<SubscriptionView> {
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
  /**
   * "Did my payment land?" — re-reads Flash directly and applies the result.
   *
   * Pass the `subscriptionId` the checkout redirect named and the server
   * verifies THAT subscription with Flash, granting only if it carries the
   * signed-in caller's reference — so a stranger's id yields nothing. Omit it
   * (a `pending` return, and the poll) and the server reads by reference.
   *
   * The redirect's `ref` is never sent: the token already says who this is.
   * Rate-limited server-side — poll with a floor, not a hammer.
   */
  async refreshSubscription(
    subscriptionId?: string,
    timeoutMs: number = 15000,
  ): Promise<RefreshSubscriptionView> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/subscription/refresh`,
      {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        ...(subscriptionId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscription_id: subscriptionId }),
            }
          : {}),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to refresh subscription (${response.status})`);
    }
    const json = await response.json();
    return json?.data;
  },

  /**
   * What's on offer — public, unauthenticated (the pricing page's audience is
   * logged-out visitors). An empty `plans` array means this instance has no
   * billing configured, which is the signal that hides the entry points.
   */
  async getBillingPlans(timeoutMs: number = 15000): Promise<{ plans: unknown[] }> {
    const response = await fetch(`${getBrainstormApi()}/billing/plans`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Failed to load billing plans (${response.status})`);
    }
    const json = await response.json();
    return json?.data ?? { plans: [] };
  },

  /**
   * Admin billing roster — the server's paginated Page[BillingSubscriptionItem]
   * (`{items, total, page, size, pages}`; see the server's /docs). Resync and
   * block/unblock are wired below; plan mappings stay Flash-dashboard work.
   */
  async getAdminBillingSubscriptions(
    page: number = 1,
    size: number = 100,
  ): Promise<{ items: AdminBillingSubscription[]; total: number; pages: number }> {
    const body = await adminJson<{
      items?: AdminBillingSubscription[];
      total?: number;
      pages?: number;
    }>(
      `/admin/billing/subscriptions?page=${page}&size=${size}`,
      "Failed to fetch billing subscriptions",
    );
    return {
      items: (body?.items ?? []) as AdminBillingSubscription[],
      total: typeof body?.total === "number" ? body.total : 0,
      pages: typeof body?.pages === "number" ? body.pages : 1,
    };
  },

  /**
   * The services on our Flash account, read live — what the mapping dialog's
   * service picker lists, so nobody types a UUID.
   */
  async getAdminBillingFlashServices(): Promise<FlashServiceItem[]> {
    const body = await adminJson<{ services?: FlashServiceItem[] } | FlashServiceItem[]>(
      "/admin/billing/flash/services",
      "Failed to read Flash's services",
    );
    return (Array.isArray(body) ? body : (body?.services ?? [])) as FlashServiceItem[];
  },

  /**
   * The plans Flash offers on one service, read live, each marked with the
   * mapping that already claims it — so the picker can show a plan as taken.
   */
  async getAdminBillingFlashServicePlans(serviceId: string): Promise<FlashPlanItem[]> {
    const body = await adminJson<{ plans?: FlashPlanItem[] } | FlashPlanItem[]>(
      `/admin/billing/flash/services/${encodeURIComponent(serviceId)}/plans`,
      "Failed to read Flash's plans",
    );
    return (Array.isArray(body) ? body : (body?.plans ?? [])) as FlashPlanItem[];
  },

  /**
   * Every Flash plan → entitlement mapping, active or not — the plan editor's
   * list, and what lets the Scheduling tab badge the policies paid plans grant.
   */
  async getAdminBillingPlanMappings(): Promise<AdminBillingPlanMapping[]> {
    const body = await adminJson<{
      plans?: AdminBillingPlanMapping[];
      items?: AdminBillingPlanMapping[];
    } | AdminBillingPlanMapping[]>(
      "/admin/billing/plans",
      "Failed to fetch billing plan mappings",
    );
    const list = Array.isArray(body) ? body : (body?.plans ?? body?.items ?? []);
    return list as AdminBillingPlanMapping[];
  },

  /** Map a Flash plan to what it grants. It is for sale as soon as this lands. */
  async createAdminBillingPlan(
    body: CreateAdminBillingPlanBody,
  ): Promise<AdminBillingPlanMapping> {
    return adminJson(
      "/admin/billing/plans",
      "Failed to create billing plan mapping",
      jsonBody("POST", body),
    );
  },

  /**
   * Correct a mapping in place — the only repair mechanism there is, since
   * nothing can read a Flash plan back to check it.
   *
   * Send only changed fields: every field included is written. The Flash ids
   * are refused with a 409 once anyone has bought the mapping, because
   * rewriting them would retroactively change what those people bought.
   */
  async updateAdminBillingPlan(
    id: number,
    body: UpdateAdminBillingPlanBody,
  ): Promise<AdminBillingPlanMapping> {
    return adminJson(
      `/admin/billing/plans/${id}`,
      "Failed to update billing plan mapping",
      jsonBody("PATCH", body),
    );
  },

  /**
   * Re-read one subscriber from Flash now and re-apply entitlement. Nothing is
   * granted from a cached value: the server fetches Flash's own view, decides,
   * and writes. `reason` is the server's EntitlementReason — `applied` false
   * with a reason like `held` or `unknown_plan` means it deliberately changed
   * nothing, not that the call failed.
   */
  async resyncAdminBillingSubscription(
    pubkey: string,
  ): Promise<{ applied: boolean; reason: string }> {
    return adminJson(
      `/admin/billing/subscriptions/${pubkey}/resync`,
      "Failed to resync subscription",
      { method: "POST" },
      30000,
    );
  },

  /**
   * Bar a subscriber from paid entitlement, or lift the bar. Blocking also
   * revokes a policy *billing* granted (`revoked` says whether it did); an
   * admin-assigned one is left alone. Unblocking never re-grants on its own —
   * the next Flash event or a resync does.
   *
   * The subscription is untouched either way: they keep being charged until
   * someone cancels or refunds in Flash.
   */
  async setAdminBillingBlock(
    pubkey: string,
    blocked: boolean,
  ): Promise<{ pubkey: string; blocked: boolean; revoked: boolean }> {
    return adminJson(
      `/admin/billing/subscriptions/${pubkey}/block`,
      `Failed to ${blocked ? "block" : "unblock"} billing`,
      { method: blocked ? "POST" : "DELETE" },
    );
  },

  /**
   * Cancel one subscriber's subscription in Flash, on an operator's behalf.
   *
   * The support path only — subscribers still cancel in Flash's portal. Read
   * `cancellation_scheduled` on the result, never `flash_status`.
   */
  async cancelAdminBillingSubscription(
    pubkey: string,
    reason?: string,
  ): Promise<AdminBillingSubscriptionAction> {
    const trimmed = reason?.trim();
    return writeBillingSubscription(
      `/admin/billing/subscriptions/${pubkey}/cancel`,
      "POST",
      trimmed ? { reason: trimmed } : {},
      "cancel the subscription",
    );
  },

  /** Pause a subscriber's subscription, or put it back. */
  async setAdminBillingSubscriptionStatus(
    pubkey: string,
    status: "paused" | "active",
  ): Promise<AdminBillingSubscriptionAction> {
    return writeBillingSubscription(
      `/admin/billing/subscriptions/${pubkey}/status`,
      "PATCH",
      { status },
      status === "paused" ? "pause the subscription" : "resume the subscription",
    );
  },

  /**
   * What Flash itself says about one record, unmodified — `livemode` plus the
   * whole `subscriptions` array, including the extra rows the server's normal
   * lookup disambiguates away. Read-only: nothing is applied.
   *
   * Two sub-resources because each row has exactly one handle: a subscriber is
   * looked up by pubkey, an unresolved signup only by its Flash id.
   */
  async getAdminBillingFlashRecordForSubscriber(pubkey: string): Promise<unknown> {
    return readFlashRecord(`/admin/billing/subscriptions/${pubkey}/flash`);
  },

  async getAdminBillingFlashRecordForUnresolved(subscriptionId: string): Promise<unknown> {
    return readFlashRecord(
      `/admin/billing/unresolved/${encodeURIComponent(subscriptionId)}/flash`,
    );
  },

  /**
   * Attach a signup that named nobody to the person who made it. `pubkey` must
   * already be hex — the server accepts nothing else, and the caller is where
   * an npub gets decoded, so a bad paste is refused before it costs a round
   * trip. Grants exactly what a webhook for the same subscription would.
   */
  async attributeAdminBillingUnresolved(
    subscriptionId: string,
    pubkey: string,
  ): Promise<AdminBillingResolution> {
    return writeUnresolved(subscriptionId, "attribute", { pubkey }, "attribute the signup");
  },

  /** Write a signup off as nobody's. Grants nothing and never asks Flash. */
  async dismissAdminBillingUnresolved(
    subscriptionId: string,
  ): Promise<AdminBillingResolution> {
    return writeUnresolved(subscriptionId, "dismiss", {}, "dismiss the signup");
  },

  /**
   * "Everything nobody has settled" — sections of billing disagreements keyed
   * by kind (server-defined), each with free-form rows. This is where
   * unattributed/unmatched signups surface, since the roster is pubkey-keyed.
   */
  async getAdminBillingDivergence(): Promise<AdminBillingDivergenceReport> {
    const body = await adminJson<AdminBillingDivergenceReport>(
      "/admin/billing/divergence",
      "Failed to fetch billing divergence",
    );
    return body ?? ({} as AdminBillingDivergenceReport);
  },
};
