import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminBillingPlanMapping, SchedulingItem } from "@/services/api";
import { PlanMappingFormDialog } from "./PlanMappingFormDialog";
import { formatMinor, formatPeriod, linesToList, listToLines, sameList } from "./planCopy";

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
  amount_minor: 200,
  currency: "USD",
  billing_period_unit: "month",
  billing_period_count: 1,
  sort_order: 0,
  blurb: null,
  includes: null,
  excludes: null,
  is_active: true,
};

function renderForm(props: Partial<React.ComponentProps<typeof PlanMappingFormDialog>> = {}) {
  const onSubmit = vi.fn();
  render(
    <PlanMappingFormDialog
      open
      mode="edit"
      initial={PLAN}
      policies={POLICIES}
      onOpenChange={() => {}}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

describe("PlanMappingFormDialog", () => {
  it("says the transcribed values are unverified", async () => {
    renderForm();

    const notice = screen.getByTestId("plan-mapping-unverified-notice");
    expect(notice).toHaveTextContent(/Price, currency and billing period/);
    expect(notice).toHaveTextContent(/no way to read a plan back/);
  });

  it("warns before re-pointing a mapping at a different Flash plan", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByTestId("plan-mapping-reidentify-warning")).not.toBeInTheDocument();
    await user.clear(screen.getByTestId("input-plan-plan-id"));
    await user.type(screen.getByTestId("input-plan-plan-id"), "beef");

    expect(screen.getByTestId("plan-mapping-reidentify-warning")).toHaveTextContent(
      /only while nobody has bought it/,
    );
  });

  it("says when the chosen policy can never reach the pricing page", async () => {
    renderForm({
      policies: [{ ...POLICIES[0], is_public: false }],
    });

    expect(screen.getByTestId("plan-mapping-nonpublic-warning")).toHaveTextContent(
      /won't appear on the pricing page/,
    );
  });

  it("refuses a period count with no unit — it would read as \"every 2\"", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.clear(screen.getByTestId("input-plan-period-unit"));
    await user.clear(screen.getByTestId("input-plan-period-count"));
    await user.type(screen.getByTestId("input-plan-period-count"), "2");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(screen.getByText("A period count needs a unit")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clearing a period is a real edit, not an omission", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.clear(screen.getByTestId("input-plan-period-unit"));
    await user.clear(screen.getByTestId("input-plan-period-count"));
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(onSubmit).toHaveBeenCalledWith({
      billing_period_unit: null,
      billing_period_count: null,
    });
  });
});

describe("planCopy", () => {
  it("round-trips copy lines without inventing or dropping any", () => {
    expect(linesToList("a\n\n b \n")).toEqual(["a", "b"]);
    expect(linesToList("   ")).toBeNull();
    expect(listToLines(["a", "b"])).toBe("a\nb");
    expect(listToLines(null)).toBe("");
  });

  it("treats identical lists as unchanged, so untouched copy is never sent", () => {
    expect(sameList(["a"], ["a"])).toBe(true);
    expect(sameList(null, [])).toBe(true);
    expect(sameList(["a"], ["a", "b"])).toBe(false);
    expect(sameList(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("previews minor units as money, and survives a currency Intl doesn't know", () => {
    expect(formatMinor(200, "USD")).toMatch(/2\.00/);
    expect(formatMinor(200, "NOTACURRENCY")).toBe("2.00 NOTACURRENCY");
  });

  it("formats a period from a unit and a count, never a matched string", () => {
    expect(formatPeriod("month", 1)).toBe("every month");
    expect(formatPeriod("week", 2)).toBe("every 2 weeks");
    expect(formatPeriod("once", null)).toBe("once");
    expect(formatPeriod(null, null)).toBe("no period recorded");
  });
});
