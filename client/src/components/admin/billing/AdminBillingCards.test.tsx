import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminBillingDivergenceSection, AdminBillingSubscription } from "@/services/api";
import { AdminBillingCards } from "./AdminBillingCards";

const getAdminBillingSubscriptions =
  vi.fn<() => Promise<{ items: AdminBillingSubscription[]; total: number; pages: number }>>();
const getAdminBillingDivergence =
  vi.fn<() => Promise<Record<string, AdminBillingDivergenceSection>>>();
const setAdminBillingBlock =
  vi.fn<(pubkey: string, blocked: boolean) => Promise<{ pubkey: string; blocked: boolean; revoked: boolean }>>();
const resyncAdminBillingSubscription =
  vi.fn<(pubkey: string) => Promise<{ applied: boolean; reason: string }>>();
vi.mock("@/services/api", () => ({
  apiClient: {
    getAdminBillingSubscriptions: () => getAdminBillingSubscriptions(),
    getAdminBillingDivergence: () => getAdminBillingDivergence(),
    setAdminBillingBlock: (pubkey: string, blocked: boolean) => setAdminBillingBlock(pubkey, blocked),
    resyncAdminBillingSubscription: (pubkey: string) => resyncAdminBillingSubscription(pubkey),
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
