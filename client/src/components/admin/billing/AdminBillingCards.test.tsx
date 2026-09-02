import { beforeEach, describe, expect, it, vi } from "vitest";
import { timeZoneSetter } from "@/test/utils";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  AdminBillingDivergenceSection,
  AdminBillingSubscription,
  AdminBillingSubscriptionAction,
} from "@/services/api";
import { AdminBillingCards } from "./AdminBillingCards";

const getAdminBillingSubscriptions =
  vi.fn<() => Promise<{ items: AdminBillingSubscription[]; total: number; pages: number }>>();
const getAdminBillingDivergence =
  vi.fn<() => Promise<Record<string, AdminBillingDivergenceSection>>>();
const setAdminBillingBlock =
  vi.fn<(pubkey: string, blocked: boolean) => Promise<{ pubkey: string; blocked: boolean; revoked: boolean }>>();
const resyncAdminBillingSubscription =
  vi.fn<(pubkey: string) => Promise<{ applied: boolean; reason: string }>>();
const getAdminBillingFlashRecordForSubscriber =
  vi.fn<(pubkey: string) => Promise<unknown>>();
const cancelAdminBillingSubscription =
  vi.fn<(pubkey: string, reason?: string) => Promise<AdminBillingSubscriptionAction>>();
const setAdminBillingSubscriptionStatus =
  vi.fn<(pubkey: string, status: "paused" | "active") => Promise<AdminBillingSubscriptionAction>>();
vi.mock("@/services/api", () => ({
  apiClient: {
    getAdminBillingSubscriptions: () => getAdminBillingSubscriptions(),
    getAdminBillingDivergence: () => getAdminBillingDivergence(),
    setAdminBillingBlock: (pubkey: string, blocked: boolean) => setAdminBillingBlock(pubkey, blocked),
    resyncAdminBillingSubscription: (pubkey: string) => resyncAdminBillingSubscription(pubkey),
    getAdminBillingFlashRecordForSubscriber: (pubkey: string) =>
      getAdminBillingFlashRecordForSubscriber(pubkey),
    cancelAdminBillingSubscription: (pubkey: string, reason?: string) =>
      cancelAdminBillingSubscription(pubkey, reason),
    setAdminBillingSubscriptionStatus: (pubkey: string, status: "paused" | "active") =>
      setAdminBillingSubscriptionStatus(pubkey, status),
  },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

// Kind-0 enrichment, same seam the scheduling admin uses.
const fetchProfileMap = vi.fn(async (_pubkeys: string[]) => new Map<string, { name?: string; display_name?: string; picture?: string }>());
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: (pubkeys: string[]) => fetchProfileMap(pubkeys),
}));

const PUBKEY = "a".repeat(64);

function renderCards() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminBillingCards active />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminBillingDivergence.mockResolvedValue({});
  fetchProfileMap.mockResolvedValue(new Map());
});

describe("AdminBillingCards (server's Page[BillingSubscriptionItem] schema)", () => {
  it("renders the roster: npub, open-set status, blocked flag, scheduler linkage", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 2,
      pages: 1,
      items: [
        {
          pubkey: PUBKEY,
          flash_status: "active",
          flash_subscription_id: "7d3b",
          current_period_end: "2026-09-25T00:00:00Z",
          last_synced_at: "2026-08-31T00:00:00Z",
          last_sync_error: null,
          granted_scheduling_name: "priority-weekly",
          scheduling_source: "billing",
          billing_blocked: false,
        },
        {
          pubkey: "b".repeat(64),
          flash_status: "some_future_status",
          current_period_end: null,
          granted_scheduling_name: null,
          scheduling_name: "default",
          scheduling_source: "manual",
          billing_blocked: true,
        },
      ],
    });

    // The first subscriber has a kind-0; the second doesn't.
    fetchProfileMap.mockResolvedValue(new Map([[PUBKEY, { display_name: "Lira Flint", picture: "https://x/p.jpg" }]]));

    renderCards();

    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    // Profile name replaces the bare npub once kind-0 resolves (npub stays as detail).
    const row1 = screen.getByTestId(`billing-sub-${PUBKEY.slice(0, 8)}`);
    await waitFor(() => expect(row1.textContent).toContain("Lira Flint"));
    expect(row1.textContent).toContain("npub1");
    expect(row1.textContent).toContain("priority-weekly");
    // Source is its own column, not folded into the scheduling cell.
    expect(screen.getByTestId(`billing-source-${PUBKEY.slice(0, 8)}`).textContent).toBe("billing");
    expect(screen.getByTestId(`billing-source-${"b".repeat(8)}`).textContent).toBe("manual");
    // Every row carries the admin actions menu.
    expect(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`)).toBeInTheDocument();
    expect(screen.getByTestId(`billing-actions-${"b".repeat(8)}`)).toBeInTheDocument();
    // Unknown statuses render, blocked shows its flag — nothing crashes.
    const row2 = screen.getByTestId(`billing-sub-${"b".repeat(8)}`);
    expect(row2.textContent).toContain("some_future_status");
    expect(screen.getByTestId(`billing-blocked-${"b".repeat(8)}`)).toBeInTheDocument();
  });

  it("opens the actions menu: every verb live, each explaining itself", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 2,
      pages: 1,
      items: [
        { pubkey: PUBKEY, flash_status: "active", flash_subscription_id: "7d3b", scheduling_source: "billing", billing_blocked: false },
        { pubkey: "b".repeat(64), flash_status: "pending", scheduling_source: "manual", billing_blocked: false },
      ],
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    const view = await screen.findByTestId("billing-action-view-flash");
    expect(view.getAttribute("aria-disabled")).not.toBe("true");
    const resync = screen.getByTestId("billing-action-resync");
    expect(resync.getAttribute("aria-disabled")).not.toBe("true");
    expect(resync.textContent).toContain("Re-reads this subscription from Flash");
    const block = screen.getByTestId("billing-action-block");
    expect(block.getAttribute("aria-disabled")).not.toBe("true");
    // The surprise is spelled out where the decision is made.
    expect(block.textContent).toContain("keeps charging");
    await userEvent.keyboard("{Escape}");

    // No subscription id → nothing in Flash to view; that item disables too.
    await userEvent.click(screen.getByTestId(`billing-actions-${"b".repeat(8)}`));
    const view2 = await screen.findByTestId("billing-action-view-flash");
    expect(view2.getAttribute("aria-disabled")).toBe("true");
  });

  it("blocks only after confirmation, and says the charge continues", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [{ pubkey: PUBKEY, flash_status: "active", scheduling_source: "billing", billing_blocked: false }],
    });
    setAdminBillingBlock.mockResolvedValue({ pubkey: PUBKEY, blocked: true, revoked: true });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-block"));

    // Nothing has happened yet — the dialog is the gate.
    const dialog = await screen.findByTestId("dialog-billing-block-confirm");
    expect(dialog.textContent).toContain("keeps charging them");
    expect(setAdminBillingBlock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("button-billing-block-confirm"));
    await waitFor(() => expect(setAdminBillingBlock).toHaveBeenCalledWith(PUBKEY, true));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("still charging") }),
      ),
    );
  });

  it("unblocks straight away, and admits it doesn't re-grant by itself", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [{ pubkey: PUBKEY, flash_status: "active", scheduling_source: "default", billing_blocked: true }],
    });
    setAdminBillingBlock.mockResolvedValue({ pubkey: PUBKEY, blocked: false, revoked: false });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-block"));

    // No confirmation for lifting a bar.
    expect(screen.queryByTestId("dialog-billing-block-confirm")).toBeNull();
    await waitFor(() => expect(setAdminBillingBlock).toHaveBeenCalledWith(PUBKEY, false));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("resync applies it") }),
      ),
    );
  });

  it("resyncs, and translates a no-op reason instead of looking broken", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [{ pubkey: PUBKEY, flash_status: "past_due", scheduling_source: "billing", billing_blocked: false }],
    });
    resyncAdminBillingSubscription.mockResolvedValue({ applied: false, reason: "held" });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-resync"));

    await waitFor(() => expect(resyncAdminBillingSubscription).toHaveBeenCalledWith(PUBKEY));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Nothing changed",
          description: expect.stringContaining("Tier left as-is"),
        }),
      ),
    );
  });

  it("surfaces a failed write instead of silently doing nothing", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [{ pubkey: PUBKEY, flash_status: "active", scheduling_source: "billing", billing_blocked: false }],
    });
    resyncAdminBillingSubscription.mockRejectedValue(new Error("Failed to resync subscription (502)"));

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-resync"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Failed to resync subscription (502)" }),
      ),
    );
  });

  it("shows Flash's own record, every row of it, without changing anything", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [{ pubkey: PUBKEY, flash_status: "active", flash_subscription_id: "7d3b", scheduling_source: "billing", billing_blocked: false }],
    });
    // The multi-row case a resync would disambiguate away — the reason to look.
    getAdminBillingFlashRecordForSubscriber.mockResolvedValue({
      livemode: true,
      subscriptions: [
        { id: "old", status: "expired", ref: PUBKEY },
        { id: "7d3b", status: "active", ref: PUBKEY },
      ],
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-flash-record"));

    await waitFor(() => expect(getAdminBillingFlashRecordForSubscriber).toHaveBeenCalledWith(PUBKEY));
    const json = await screen.findByTestId("billing-flash-record-json");
    expect(json.textContent).toContain("\"old\"");
    expect(json.textContent).toContain("\"7d3b\"");
    expect(json.textContent).toContain("livemode");
    // Both rows are called out, so the disagreement is visible at a glance.
    expect(screen.getByTestId("dialog-billing-flash-record").textContent).toContain("2 rows");
    // Looking is not acting.
    expect(resyncAdminBillingSubscription).not.toHaveBeenCalled();
    expect(setAdminBillingBlock).not.toHaveBeenCalled();
  });

  it("keeps \"Flash has no such subscription\" apart from \"couldn't reach Flash\"", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [{ pubkey: PUBKEY, flash_status: "active", scheduling_source: "billing", billing_blocked: false }],
    });
    getAdminBillingFlashRecordForSubscriber.mockRejectedValue(
      new Error("Could not reach Flash, so we do not know what it says. Nothing was changed."),
    );

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-flash-record"));

    // The server's wording survives to the admin — dismissing a real customer
    // because an outage read as an absence is the failure this prevents.
    const error = await screen.findByTestId("billing-flash-record-error");
    expect(error.textContent).toContain("Could not reach Flash");
    expect(error.textContent).not.toContain("no subscription");
  });

  it("searches by profile name or npub, and sorts by column", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 2,
      pages: 1,
      items: [
        { pubkey: PUBKEY, flash_status: "active", current_period_end: "2026-09-25T00:00:00Z", scheduling_source: "billing", billing_blocked: false },
        { pubkey: "b".repeat(64), flash_status: "expired", current_period_end: "2026-08-01T00:00:00Z", scheduling_source: "default", billing_blocked: false },
      ],
    });
    fetchProfileMap.mockResolvedValue(new Map([[PUBKEY, { display_name: "Lira Flint" }]]));

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId(`billing-sub-${PUBKEY.slice(0, 8)}`).textContent).toContain("Lira Flint"));

    // Search by name narrows to the matching row.
    fireEvent.change(screen.getByTestId("input-billing-search"), { target: { value: "lira" } });
    expect(screen.queryByTestId(`billing-sub-${"b".repeat(8)}`)).toBeNull();
    expect(screen.getByTestId(`billing-sub-${PUBKEY.slice(0, 8)}`)).toBeInTheDocument();

    // Clearing restores; sorting by status reorders (asc puts "active" first, desc flips).
    fireEvent.change(screen.getByTestId("input-billing-search"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("sort-billing-status"));
    let rows = screen.getAllByTestId(/^billing-sub-/);
    expect(rows[0].textContent).toContain("active");
    fireEvent.click(screen.getByTestId("sort-billing-status"));
    rows = screen.getAllByTestId(/^billing-sub-/);
    expect(rows[0].textContent).toContain("expired");
  });

  it("surfaces the divergence report, honoring its truncation admission", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({ total: 0, pages: 0, items: [] });
    getAdminBillingDivergence.mockResolvedValue({
      unmatched_signups: {
        count: 3,
        truncated: true,
        rows: [{ flash_subscription_id: "sub_pierre", status: "active" }],
      },
      settled_kind: { count: 0, truncated: false, rows: [] },
    });

    renderCards();

    await waitFor(() => expect(screen.getByTestId("billing-divergence-unmatched_signups")).toBeInTheDocument());
    const block = screen.getByTestId("billing-divergence-unmatched_signups");
    expect(block.textContent).toContain("sub_pierre");
    expect(block.textContent).toContain("list capped");
    // Zero-count sections don't clutter the card.
    expect(screen.queryByTestId("billing-divergence-settled_kind")).toBeNull();
    expect(screen.getByTestId("billing-subscribers-empty")).toBeInTheDocument();
  });

  it("renders both halves of the split signup report without special-casing either", async () => {
    // The server split one section into two; the panel is generic by design, so
    // this asserts that generosity actually holds for the new pair of shapes.
    getAdminBillingSubscriptions.mockResolvedValue({ total: 0, pages: 0, items: [] });
    getAdminBillingDivergence.mockResolvedValue({
      unresolved_signups: {
        count: 1,
        truncated: false,
        rows: [
          {
            id: 41,
            event: "subscription.activated",
            process_error: "no_reference",
            flash_subscription_id: "sub_pierre",
          },
        ],
      },
      unmapped_plans: {
        count: 1,
        truncated: false,
        rows: [
          {
            id: 42,
            event: "subscription.renewed",
            process_error: "unknown_plan",
            flash_subscription_id: "sub_amara",
            external_ref: PUBKEY,
            flash_service_id: "9c1e",
            flash_plan_id: "4f2a",
          },
        ],
      },
    });

    renderCards();

    const signups = await screen.findByTestId("billing-divergence-unresolved_signups");
    const plans = screen.getByTestId("billing-divergence-unmapped_plans");
    // Headers read as English off the key alone.
    expect(signups.textContent).toContain("unresolved signups");
    expect(plans.textContent).toContain("unmapped plans");
    // Each section shows the fields its own fix needs: the service/plan pair an
    // admin would map, and — for a signup that named nobody — nothing but the
    // Flash id, because Flash's payload carries no contact details to show.
    expect(plans.textContent).toContain("9c1e");
    expect(plans.textContent).toContain("4f2a");
    expect(signups.textContent).not.toContain("9c1e");
    // The one value the block does treat specially still links out, in both.
    for (const [block, id] of [
      [signups, "sub_pierre"],
      [plans, "sub_amara"],
    ] as const) {
      const link = Array.from(block.querySelectorAll("a")).find((a) => a.textContent === id);
      expect(link?.getAttribute("href")).toContain(id);
    }
  });

  it("says so plainly when nothing is unsettled", async () => {
    getAdminBillingSubscriptions.mockResolvedValue({ total: 0, pages: 0, items: [] });

    renderCards();

    await waitFor(() => expect(screen.getByTestId("billing-divergence-empty")).toBeInTheDocument());
  });

  it("shows an honest error state when the endpoint isn't there yet", async () => {
    getAdminBillingSubscriptions.mockRejectedValue(new Error("Failed to fetch billing subscriptions (404)"));

    renderCards();

    // The component retries once by design, so the error surfaces after a beat.
    await waitFor(() => expect(screen.getByTestId("billing-subscribers-error")).toBeInTheDocument(), {
      timeout: 4000,
    });
  });
});

describe("AdminBillingCards — the day Flash named, wherever the operator is", () => {
  const setTimeZone = timeZoneSetter();

  it("shows a date-only period end unshifted, and localises a real instant", async () => {
    setTimeZone("America/Los_Angeles");
    getAdminBillingSubscriptions.mockResolvedValue({
      total: 1,
      pages: 1,
      items: [
        {
          pubkey: PUBKEY,
          flash_status: "active",
          // The period end is the day Flash named; the sync is our own instant.
          current_period_end: "2026-09-20",
          last_synced_at: "2026-09-20T02:00:00Z",
          scheduling_source: "billing",
          billing_blocked: false,
        },
      ],
    });

    renderCards();

    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    const row = screen.getByTestId("table-billing-subscribers");
    expect(row).toHaveTextContent("Sep 20, 2026");
    expect(row).toHaveTextContent("Sep 19, 2026");
  });
});

// ---------------------------------------------------------------------------
// Acting on a subscription without leaving the tab
//
// Subscribers still cancel in Flash's portal; this is the support path, for an
// admin already looking at the row.
// ---------------------------------------------------------------------------
function rosterOf(overrides: Partial<AdminBillingSubscription> = {}) {
  return {
    total: 1,
    pages: 1,
    items: [
      {
        pubkey: PUBKEY,
        flash_status: "active",
        flash_subscription_id: "7d3b",
        scheduling_source: "billing",
        billing_blocked: false,
        ...overrides,
      } as AdminBillingSubscription,
    ],
  };
}

const CANCEL_SCHEDULED: AdminBillingSubscriptionAction = {
  pubkey: PUBKEY,
  subscription_id: "7d3b",
  // Flash accepted the cancellation and still calls them active — the account
  // cancels at period end.
  flash_status: "active",
  cancel_effective_date: "2026-09-20",
  cancellation_scheduled: true,
  applied: false,
  reason: "held",
};

describe("cancelling and pausing from the billing tab", () => {
  it("cancels only after the admin agrees, and names who it affects", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    fetchProfileMap.mockResolvedValue(new Map([[PUBKEY, { display_name: "Lira Flint" }]]));
    cancelAdminBillingSubscription.mockResolvedValue(CANCEL_SCHEDULED);

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));

    const dialog = await screen.findByTestId("dialog-billing-cancel-confirm");
    expect(cancelAdminBillingSubscription).not.toHaveBeenCalled();
    const who = screen.getByTestId("billing-cancel-confirm-who");
    expect(who.textContent).toContain("Lira Flint");
    // Never the raw hex — the same rule the tier picker holds to.
    expect(dialog.textContent).not.toContain(PUBKEY);

    await userEvent.click(screen.getByTestId("button-billing-cancel-confirm"));
    await waitFor(() => expect(cancelAdminBillingSubscription).toHaveBeenCalledWith(PUBKEY, ""));
  });

  it("reports a scheduled cancellation by its date, not as a failure", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockResolvedValue(CANCEL_SCHEDULED);

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-confirm"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Cancellation scheduled",
          description: expect.stringContaining("Sep 20, 2026"),
        }),
      ),
    );
    // Not a destructive toast: it worked.
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("says so plainly when Flash ended it there and then", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockResolvedValue({
      ...CANCEL_SCHEDULED,
      flash_status: "canceled",
      cancel_effective_date: null,
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-confirm"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Subscription cancelled" }),
      ),
    );
  });

  it("does not claim success when Flash scheduled nothing", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockResolvedValue({
      ...CANCEL_SCHEDULED,
      cancel_effective_date: null,
      cancellation_scheduled: false,
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-confirm"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });

  it("passes the operator's reason to the server", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockResolvedValue(CANCEL_SCHEDULED);

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.type(await screen.findByTestId("input-billing-cancel-reason"), "Refunded");
    await userEvent.click(screen.getByTestId("button-billing-cancel-confirm"));

    await waitFor(() =>
      expect(cancelAdminBillingSubscription).toHaveBeenCalledWith(PUBKEY, "Refunded"),
    );
  });

  it("leaves the subscription alone when the admin backs out", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-dismiss"));

    await waitFor(() =>
      expect(screen.queryByTestId("dialog-billing-cancel-confirm")).not.toBeInTheDocument(),
    );
    expect(cancelAdminBillingSubscription).not.toHaveBeenCalled();
  });

  it("pauses after confirmation, naming the person", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    setAdminBillingSubscriptionStatus.mockResolvedValue({
      ...CANCEL_SCHEDULED,
      flash_status: "paused",
      cancel_effective_date: null,
      cancellation_scheduled: false,
      applied: true,
      reason: "revoked",
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-pause"));

    const dialog = await screen.findByTestId("dialog-billing-pause-confirm");
    expect(setAdminBillingSubscriptionStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId("billing-pause-confirm-who").textContent).toContain("npub1");
    expect(dialog.textContent).not.toContain(PUBKEY);

    await userEvent.click(screen.getByTestId("button-billing-pause-confirm"));
    await waitFor(() =>
      expect(setAdminBillingSubscriptionStatus).toHaveBeenCalledWith(PUBKEY, "paused"),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Subscription paused" })),
    );
  });

  it("confirms a resume too — it restarts a charge", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf({ flash_status: "paused" }));
    setAdminBillingSubscriptionStatus.mockResolvedValue({
      ...CANCEL_SCHEDULED,
      cancel_effective_date: null,
      cancellation_scheduled: false,
      applied: true,
      reason: "granted",
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-pause"));

    const dialog = await screen.findByTestId("dialog-billing-resume-confirm");
    expect(setAdminBillingSubscriptionStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId("billing-resume-confirm-who").textContent).toContain("npub1");
    expect(dialog.textContent).not.toContain(PUBKEY);

    await userEvent.click(screen.getByTestId("button-billing-resume-confirm"));
    await waitFor(() =>
      expect(setAdminBillingSubscriptionStatus).toHaveBeenCalledWith(PUBKEY, "active"),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Subscription resumed" })),
    );
  });

  it("re-reads the roster after either action", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockResolvedValue(CANCEL_SCHEDULED);

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    expect(getAdminBillingSubscriptions).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-confirm"));

    await waitFor(() => expect(getAdminBillingSubscriptions).toHaveBeenCalledTimes(2));
  });

  it("hands a refused key on to the operator as its own sentence", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockRejectedValue(
      new Error(
        "Flash refused our credentials, so nothing was changed. The API key may not carry the scope needed to manage subscriptions; retrying will not help.",
      ),
    );

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-confirm"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringContaining("scope needed to manage subscriptions"),
        }),
      ),
    );
  });

  it("admits when the write landed but the re-read did not", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());
    cancelAdminBillingSubscription.mockResolvedValue({
      ...CANCEL_SCHEDULED,
      applied: false,
      reason: "reread_failed",
    });

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));
    await userEvent.click(await screen.findByTestId("billing-action-cancel"));
    await userEvent.click(await screen.findByTestId("button-billing-cancel-confirm"));

    // Cancelled in Flash — so not a failure — but the roster is a step behind
    // and the operator is told so rather than left to believe it is current.
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Cancellation scheduled",
          description: expect.stringContaining("a step behind"),
        }),
      ),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("offers nothing to act on where we hold no Flash subscription", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(
      rosterOf({ flash_subscription_id: null }),
    );

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));

    expect((await screen.findByTestId("billing-action-cancel")).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("billing-action-pause").getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps the ways of looking at Flash beside the ways of acting on it", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(rosterOf());

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId(`billing-actions-${PUBKEY.slice(0, 8)}`));

    expect(await screen.findByTestId("billing-action-view-flash")).toBeInTheDocument();
    expect(screen.getByTestId("billing-action-flash-record")).toBeInTheDocument();
    expect(screen.getByTestId("link-flash-dashboard")).toBeInTheDocument();
  });

  it("shows a scheduled cancellation on the roster, where the status cannot", async () => {
    getAdminBillingSubscriptions.mockResolvedValue(
      rosterOf({
        current_period_end: "2026-09-20T00:00:00Z",
        cancel_effective_date: "2026-09-20",
      }),
    );

    renderCards();
    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());

    const row = screen.getByTestId(`billing-sub-${PUBKEY.slice(0, 8)}`);
    expect(row.textContent).toContain("active");
    expect(screen.getByTestId(`billing-ends-${PUBKEY.slice(0, 8)}`).textContent).toContain("Ends");
  });
});
