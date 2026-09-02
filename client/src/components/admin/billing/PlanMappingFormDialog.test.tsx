import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminBillingPlanMapping, SchedulingItem } from "@/services/api";
import { PlanMappingFormDialog } from "./PlanMappingFormDialog";

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
  // Price, currency, period, ordering and copy are read from Flash now. Editing
  // them here would be editing a copy of Flash's answer, so the fields are gone
  // — and with them the warning that nothing verified what someone typed.
  it("offers no field for anything Flash owns, and no longer warns about it", () => {
    renderForm();

    expect(screen.queryByTestId("input-plan-amount")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-currency")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-period-unit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-period-count")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-sort-order")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-blurb")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-includes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-plan-excludes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-mapping-unverified-notice")).not.toBeInTheDocument();
  });

  it("keeps the two decisions Flash cannot make", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.click(screen.getByTestId("checkbox-plan-active"));
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(screen.getByTestId("select-plan-scheduling")).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({ is_active: false });
  });

  it("sends only what changed, so an untouched field is never written back", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await user.clear(screen.getByTestId("input-plan-plan-id"));
    await user.type(screen.getByTestId("input-plan-plan-id"), "beef");
    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(onSubmit).toHaveBeenCalledWith({ flash_plan_id: "beef" });
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

  it("refuses a mapping with no Flash ids rather than creating a dead row", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ mode: "create", initial: undefined });

    await user.click(screen.getByTestId("button-plan-mapping-submit"));

    expect(screen.getByText("Flash service id is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
