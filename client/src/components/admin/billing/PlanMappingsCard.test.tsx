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

vi.mock("@/services/api", () => ({
  apiClient: {
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
    amount_minor: 200,
    currency: "USD",
    billing_period_unit: "month",
    billing_period_count: 1,
    sort_order: 0,
    blurb: null,
    includes: null,
    excludes: null,
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
      plan({ id: 2, scheduling_id: 7, is_active: false, amount_minor: 2000, billing_period_unit: "year" }),
    ]);

    renderCard();

    await screen.findByTestId("billing-plan-1");
    expect(screen.getByTestId("billing-plan-2")).toBeInTheDocument();
    // The tier is the policy, named — there is no tier string to show.
    expect(screen.getAllByText("Priority")).toHaveLength(2);
    expect(screen.getByText("For sale")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.getByText(/\$2\.00/)).toBeInTheDocument();
    expect(screen.getByText(/every year/)).toBeInTheDocument();
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
    await user.clear(screen.getByTestId("input-plan-amount"));
    await user.type(screen.getByTestId("input-plan-amount"), "200");
    await user.selectOptions(screen.getByTestId("select-plan-scheduling"), "7");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    await waitFor(() => expect(createAdminBillingPlan).toHaveBeenCalledTimes(1));
    expect(createAdminBillingPlan.mock.calls[0][0]).toMatchObject({
      flash_service_id: "9c1e",
      flash_plan_id: "4f2a",
      scheduling_id: 7,
      amount_minor: 200,
      currency: "USD",
      is_active: true,
    });
  });

  it("sends only the field that changed", async () => {
    // A PATCH writes every field it includes; an untouched form is how a
    // staging policy ended up named "string" with a zero cadence.
    const user = userEvent.setup();
    getAdminBillingPlanMappings.mockResolvedValue([plan({ blurb: "Best value" })]);
    renderCard();

    await user.click(await screen.findByTestId("button-edit-plan-1"));
    await user.clear(screen.getByTestId("input-plan-amount"));
    await user.type(screen.getByTestId("input-plan-amount"), "1000");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    await waitFor(() => expect(updateAdminBillingPlan).toHaveBeenCalledTimes(1));
    expect(updateAdminBillingPlan.mock.calls[0][1]).toEqual({ amount_minor: 1000 });
  });

  it("does not PATCH at all when nothing was touched", async () => {
    const user = userEvent.setup();
    getAdminBillingPlanMappings.mockResolvedValue([plan({ includes: ["Faster recalculation"] })]);
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

  it("renders plan copy as text — markup is displayed, never interpreted", async () => {
    getAdminBillingPlanMappings.mockResolvedValue([
      plan({
        blurb: "<img src=x onerror=alert(1)>",
        includes: ["<b>bold</b> claim"],
      }),
    ]);

    renderCard();

    const blurb = await screen.findByTestId("billing-plan-blurb-1");
    expect(blurb).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(blurb.querySelector("img")).toBeNull();
    expect(screen.getByTestId("billing-plan-includes-1").querySelector("b")).toBeNull();
  });
});
