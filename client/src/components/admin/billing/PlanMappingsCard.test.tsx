import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminBillingPlanMapping, SchedulingItem } from "@/services/api";
import { PlanMappingsCard } from "./PlanMappingsCard";

const getAdminBillingPlanMappings = vi.fn<() => Promise<AdminBillingPlanMapping[]>>();
const getSchedulingPolicies = vi.fn<() => Promise<SchedulingItem[]>>();
const createAdminBillingPlan = vi.fn<(body: unknown) => Promise<AdminBillingPlanMapping>>();
const updateAdminBillingPlan =
  vi.fn<(id: number, body: unknown) => Promise<AdminBillingPlanMapping>>();

const getBillingPlans = vi.fn<() => Promise<{ plans: unknown[] }>>(async () => ({ plans: [] }));
vi.mock("@/services/api", () => ({
  apiClient: {
    getBillingPlans: () => getBillingPlans(),
    getAdminBillingPlanMappings: () => getAdminBillingPlanMappings(),
    getSchedulingPolicies: () => getSchedulingPolicies(),
    createAdminBillingPlan: (body: unknown) => createAdminBillingPlan(body),
    updateAdminBillingPlan: (id: number, body: unknown) => updateAdminBillingPlan(id, body),
  },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const POLICIES: SchedulingItem[] = [
  {
    id: 1,
    name: "Free",
    schedule_interval_seconds: 5184000,
    priority: 0,
    enabled: true,
    is_default: true,
    manual_quota_limit: 1,
    manual_quota_window_seconds: 604800,
  },
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

function plan(overrides: Partial<AdminBillingPlanMapping> = {}): AdminBillingPlanMapping {
  return {
    id: 1,
    flash_service_id: "9c1e",
    flash_plan_id: "4f2a",
    scheduling_id: 7,
    is_active: true,
    ...overrides,
  };
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlanMappingsCard active />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSchedulingPolicies.mockResolvedValue(POLICIES);
  getAdminBillingPlanMappings.mockResolvedValue([]);
  createAdminBillingPlan.mockResolvedValue(plan());
  updateAdminBillingPlan.mockResolvedValue(plan());
});

describe("PlanMappingsCard", () => {
  it("lists every mapping, retired ones included, and says what each grants", async () => {
    getAdminBillingPlanMappings.mockResolvedValue([
      plan(),
      plan({ id: 2, flash_plan_id: "019e", scheduling_id: 7, is_active: false }),
    ]);

    renderCard();

    await screen.findByTestId("billing-plan-1");
    expect(screen.getByTestId("billing-plan-2")).toBeInTheDocument();
    // The tier is the policy, named — there is no tier string to show.
    expect(screen.getAllByText("Priority")).toHaveLength(2);
    expect(screen.getByText("For sale")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    // Flash prices the plan; the row identifies it and says what it grants.
    expect(screen.getByTestId("billing-plan-1")).toHaveTextContent("4f2a");
  });

  // A mapping is two ids nobody can read. Flash's public plans list already
  // names and prices each one, so a mapping row says what it sells — and that
  // an edit made in Flash can take up to ten minutes to show (Enes: the plan
  // cache tops out at ten).
  it("names and prices each mapping from Flash's plans list", async () => {
    getBillingPlans.mockResolvedValue({
      plans: [
        { policy_id: 7, policy_name: "Priority", schedule_interval_seconds: 604800, is_default: false, plan_id: "4f2a", plan_name: "Priority", description: null, amount_minor: 200, currency: "USD", billing_interval: "monthly", checkout_url: "https://x", features: null, not_included: null },
      ],
    });
    getAdminBillingPlanMappings.mockResolvedValue([
      { id: 1, flash_service_id: "9c1e", flash_plan_id: "4f2a", scheduling_id: 7, is_active: true, created_at: "", updated_at: "" } as AdminBillingPlanMapping,
      { id: 2, flash_service_id: "9c1e", flash_plan_id: "zzzz", scheduling_id: 7, is_active: true, created_at: "", updated_at: "" } as AdminBillingPlanMapping,
    ]);
    getSchedulingPolicies.mockResolvedValue(POLICIES);
    renderCard();
    const priced = await screen.findByTestId("billing-plan-1");
    await waitFor(() => expect(priced.textContent).toContain("$2.00"));
    expect(priced.textContent).toContain("per month");
    expect(screen.getByTestId("billing-plan-flash-1")).toHaveTextContent("Priority");
    // A mapping Flash no longer lists says so rather than showing a stale price.
    const unlisted = screen.getByTestId("billing-plan-2");
    expect(unlisted.textContent).toMatch(/not in Flash.s current list/i);
    expect(screen.getByTestId("billing-plans-cache-note").textContent).toMatch(/ten minutes/i);
  });

  it("is usable on a fresh instance with nothing mapped yet", async () => {
    renderCard();

    // Precisely when the screen is needed — an empty list must not hide its
    // own way out.
    await screen.findByTestId("billing-plans-empty");
    expect(screen.getByTestId("button-new-plan-mapping")).toBeEnabled();
  });

  it("creates a mapping without a deploy", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByTestId("billing-plans-empty");

    await user.click(screen.getByTestId("button-new-plan-mapping"));
    await user.type(screen.getByTestId("input-plan-service-id"), "9c1e");
    await user.type(screen.getByTestId("input-plan-plan-id"), "4f2a");
    await user.selectOptions(screen.getByTestId("select-plan-scheduling"), "7");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    await waitFor(() => expect(createAdminBillingPlan).toHaveBeenCalledTimes(1));
    expect(createAdminBillingPlan.mock.calls[0][0]).toEqual({
      flash_service_id: "9c1e",
      flash_plan_id: "4f2a",
      scheduling_id: 7,
      is_active: true,
    });
  });

  it("sends only the field that changed", async () => {
    // A PATCH writes every field it includes; an untouched form is how a
    // staging policy ended up named "string" with a zero cadence.
    const user = userEvent.setup();
    getAdminBillingPlanMappings.mockResolvedValue([plan()]);
    renderCard();

    await user.click(await screen.findByTestId("button-edit-plan-1"));
    await user.click(screen.getByTestId("checkbox-plan-active"));
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    await waitFor(() => expect(updateAdminBillingPlan).toHaveBeenCalledTimes(1));
    expect(updateAdminBillingPlan.mock.calls[0][1]).toEqual({ is_active: false });
  });

  it("does not PATCH at all when nothing was touched", async () => {
    const user = userEvent.setup();
    getAdminBillingPlanMappings.mockResolvedValue([plan()]);
    renderCard();

    await user.click(await screen.findByTestId("button-edit-plan-1"));
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    await waitFor(() =>
      expect(screen.queryByTestId("dialog-plan-mapping-form")).not.toBeInTheDocument(),
    );
    expect(updateAdminBillingPlan).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when the Flash ids have subscribers", async () => {
    const user = userEvent.setup();
    getAdminBillingPlanMappings.mockResolvedValue([plan()]);
    updateAdminBillingPlan.mockRejectedValue(
      new Error(
        "2 subscriber(s) bought this mapping, so its Flash ids are fixed. " +
          "Create a new mapping with the right ids and deactivate this one.",
      ),
    );
    renderCard();

    await user.click(await screen.findByTestId("button-edit-plan-1"));
    await user.clear(screen.getByTestId("input-plan-plan-id"));
    await user.type(screen.getByTestId("input-plan-plan-id"), "beef");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    const error = await screen.findByTestId("plan-mapping-server-error");
    expect(error).toHaveTextContent(/deactivate this one/);
    // Still open, with the attempted value intact, so the admin can act on it.
    expect(screen.getByTestId("dialog-plan-mapping-form")).toBeInTheDocument();
  });

  // They stopped being ours to edit, so offering to edit them would offer an
  // edit nothing would honour.
  it("shows nothing Flash owns, because none of it is editable here", async () => {
    getAdminBillingPlanMappings.mockResolvedValue([plan()]);

    renderCard();

    await screen.findByTestId("billing-plan-1");
    expect(screen.queryByTestId("billing-plan-blurb-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("billing-plan-includes-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("billing-plan-excludes-1")).not.toBeInTheDocument();
  });
});
