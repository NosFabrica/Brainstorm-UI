import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SchedulingItem } from "@/services/api";
import { PolicyFormDialog } from "./PolicyFormDialog";

const DAILY: SchedulingItem = {
  id: 2, name: "Daily", schedule_interval_seconds: 86400, priority: 10,
  enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
};

describe("PolicyFormDialog", () => {
  it("submits a full body in create mode with computed seconds", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PolicyFormDialog open mode="create" onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hourly" } });
    fireEvent.change(screen.getByLabelText("Recalculation interval"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Interval unit"), { target: { value: "3600" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Hourly",
      schedule_interval_seconds: 3600,
      priority: 0,
      enabled: true,
      is_default: false,
      manual_quota_limit: 20,
      manual_quota_window_seconds: 604800,
    });
  });

  it("submits only the changed fields in edit mode", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PolicyFormDialog open mode="edit" initial={DAILY} onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Renamed" });
  });

  it("rejects a priority outside 0–10", async () => {
    const onSubmit = vi.fn();
    render(
      <PolicyFormDialog open mode="create" onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Recalculation interval"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/priority must be between 0 and 10/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submit and shows an error when the name is empty", async () => {
    const onSubmit = vi.fn();
    render(
      <PolicyFormDialog open mode="create" onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByLabelText("Recalculation interval"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
