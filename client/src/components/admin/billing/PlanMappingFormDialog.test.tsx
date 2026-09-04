import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminBillingPlanMapping, FlashPlanItem, FlashServiceItem, SchedulingItem } from "@/services/api";
import { PlanMappingFormDialog } from "./PlanMappingFormDialog";

// Flash's account as the server reads it live: one service, two plans, one of
// them already mapped (the row under edit in most tests here).
const SERVICES: FlashServiceItem[] = [{ id: "9c1e", name: "Brainstorm", description: null, signup_url: null }];
const PLANS: FlashPlanItem[] = [
  { id: "4f2a", service_id: "9c1e", name: "Priority", amount_minor: 200, currency: "USD", billing_interval: "monthly", status: "active", sort_order: 0, mapping_id: 1 },
  { id: "beef", service_id: "9c1e", name: "Staging - Daily", amount_minor: 10, currency: "USD", billing_interval: "daily", status: "active", sort_order: 1, mapping_id: null },
];
const getAdminBillingFlashServices = vi.fn<() => Promise<FlashServiceItem[]>>();
const getAdminBillingFlashServicePlans = vi.fn<(serviceId: string) => Promise<FlashPlanItem[]>>();
vi.mock("@/services/api", () => ({
  apiClient: {
    getAdminBillingFlashServices: () => getAdminBillingFlashServices(),
    getAdminBillingFlashServicePlans: (id: string) => getAdminBillingFlashServicePlans(id),
  },
}));

const POLICIES: SchedulingItem[] = [
  {
    id: 7,
    name: "Priority",
    schedule_interval_seconds: 604800,
    priority: 5,
    enabled: true,
    is_default: false,
    manual_quota_limit: 20,
    manual_quota_window_seconds: 604800,
  },
];

const PLAN: AdminBillingPlanMapping = {
  id: 1,
  flash_service_id: "9c1e",
  flash_plan_id: "4f2a",
  scheduling_id: 7,
  is_active: true,
};

function renderForm(props: Partial<React.ComponentProps<typeof PlanMappingFormDialog>> = {}) {
  const onSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PlanMappingFormDialog
        open
        mode="edit"
        initial={PLAN}
        policies={POLICIES}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onSubmit;
}

beforeEach(() => {
  getAdminBillingFlashServices.mockReset().mockResolvedValue(SERVICES);
  getAdminBillingFlashServicePlans.mockReset().mockResolvedValue(PLANS);
});

describe("PlanMappingFormDialog — picking a Flash plan instead of typing its ids", () => {
  it("lists Flash's plans by name and price, and a pick fills both ids", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ mode: "create", initial: undefined });

    // The one service selects itself; its plans read as a customer would see them.
    const planSelect = await screen.findByTestId("select-plan-flash-plan");
    await waitFor(() => expect(getAdminBillingFlashServicePlans).toHaveBeenCalledWith("9c1e"));
    const daily = await screen.findByRole("option", { name: /Staging - Daily · \$0\.10 per day/ });
    await user.selectOptions(planSelect, daily);
    await user.selectOptions(screen.getByTestId("select-plan-scheduling"), "7");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(onSubmit).toHaveBeenCalledWith({
      flash_service_id: "9c1e",
      flash_plan_id: "beef",
      scheduling_id: 7,
      is_active: true,
    });
    // Nothing typed anywhere: the ids came from the pick.
    expect(screen.queryByTestId("input-plan-plan-id")).not.toBeInTheDocument();
  });
});

describe("PlanMappingFormDialog — the two decisions, with the plan picked from Flash", () => {
  it("arrives prefilled from an unmapped row and shows what Flash says about that plan", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({
      mode: "create",
      initial: { flash_service_id: "9c1e", flash_plan_id: "beef", scheduling_id: 7, is_active: true },
    });

    const planSelect = await screen.findByTestId("select-plan-flash-plan");
    await waitFor(() => expect((planSelect as HTMLSelectElement).value).toBe("beef"));
    expect((screen.getByTestId("select-plan-service") as HTMLSelectElement).value).toBe("9c1e");
    expect(screen.getByTestId("plan-picker-facts")).toHaveTextContent(/active/);

    await user.click(screen.getByTestId("button-plan-mapping-submit"));
    expect(onSubmit).toHaveBeenCalledWith({ flash_service_id: "9c1e", flash_plan_id: "beef", scheduling_id: 7, is_active: true });
  });

  it("keeps the two decisions Flash cannot make", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await screen.findByRole("option", { name: /Priority · \$2\.00 per month/ });
    await user.click(screen.getByTestId("checkbox-plan-active"));
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(screen.getByTestId("select-plan-scheduling")).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({ is_active: false });
  });

  it("sends only what changed, and warns before re-pointing a mapping at another plan", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    const planSelect = await screen.findByTestId("select-plan-flash-plan");
    await screen.findByRole("option", { name: /Staging - Daily/ });
    expect(screen.queryByTestId("plan-mapping-reidentify-warning")).not.toBeInTheDocument();

    await user.selectOptions(planSelect, "beef");

    expect(screen.getByTestId("plan-mapping-reidentify-warning")).toHaveTextContent(/only while nobody has bought it/);
    await user.click(screen.getByTestId("button-plan-mapping-submit"));
    expect(onSubmit).toHaveBeenCalledWith({ flash_plan_id: "beef" });
  });

  it("marks a plan another mapping already claims, and one Flash no longer offers", async () => {
    getAdminBillingFlashServicePlans.mockResolvedValue([
      ...PLANS,
      { id: "old1", service_id: "9c1e", name: "Legacy", amount_minor: 500, currency: "USD", billing_interval: "monthly", status: "archived", sort_order: 2, mapping_id: null },
    ]);
    const user = userEvent.setup();
    renderForm({ mode: "create", initial: undefined });

    const planSelect = await screen.findByTestId("select-plan-flash-plan");
    // Priority is mapping #1's plan; in a create it reads as taken.
    expect(await screen.findByRole("option", { name: /Priority .* already mapped/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Legacy .* not offered by Flash/ })).toBeInTheDocument();

    await user.selectOptions(planSelect, "4f2a");
    expect(screen.getByTestId("plan-picker-taken-warning")).toHaveTextContent(/Already mapped \(#1\)/);

    await user.selectOptions(planSelect, "old1");
    expect(screen.getByTestId("plan-picker-inactive-warning")).toHaveTextContent(/isn't offering this plan/);
  });

  it("does not call the plan under edit taken — it is this mapping's own", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: /Priority · \$2\.00 per month/ });
    expect(screen.queryByRole("option", { name: /Priority .* already mapped/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-picker-facts")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-picker-taken-warning")).not.toBeInTheDocument();
    // Still an edit that can save without touching the plan.
    await user.click(screen.getByTestId("checkbox-plan-active"));
    expect(screen.queryByTestId("plan-mapping-reidentify-warning")).not.toBeInTheDocument();
  });

  it("keeps an edited mapping whose plan Flash no longer lists, and says so", async () => {
    getAdminBillingFlashServicePlans.mockResolvedValue([PLANS[1]]);
    const user = userEvent.setup();
    const onSubmit = renderForm();

    expect(await screen.findByRole("option", { name: /4f2a — not in Flash's list/ })).toBeInTheDocument();
    expect((screen.getByTestId("select-plan-flash-plan") as HTMLSelectElement).value).toBe("4f2a");
    await user.click(screen.getByTestId("checkbox-plan-active"));
    await user.click(screen.getByTestId("button-plan-mapping-submit"));
    expect(onSubmit).toHaveBeenCalledWith({ is_active: false });
  });

  it("refuses a mapping with no plan chosen rather than creating a dead row", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ mode: "create", initial: undefined });

    await screen.findByTestId("select-plan-flash-plan");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(screen.getByText("Choose a Flash plan")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("falls back to typed ids, with the reason, when Flash's list cannot be read", async () => {
    getAdminBillingFlashServices.mockRejectedValue(new Error("Flash timed out"));
    const user = userEvent.setup();
    const onSubmit = renderForm({ mode: "create", initial: undefined });

    expect(await screen.findByTestId("plan-picker-fallback")).toHaveTextContent(/Flash timed out/);
    await user.type(screen.getByTestId("input-plan-service-id"), "9c1e");
    await user.type(screen.getByTestId("input-plan-plan-id"), "beef");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(onSubmit).toHaveBeenCalledWith({ flash_service_id: "9c1e", flash_plan_id: "beef", scheduling_id: 7, is_active: true });
  });

  it("says when the chosen policy can never reach the pricing page", async () => {
    renderForm({ policies: [{ ...POLICIES[0], is_public: false }] });
    expect(screen.getByTestId("plan-mapping-nonpublic-warning")).toHaveTextContent(/won't appear on the pricing page/);
  });
});
