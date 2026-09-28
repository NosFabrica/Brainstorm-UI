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
      is_public: false,
      support_included: false,
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

  // A policy is off the pricing page until someone says otherwise (the server
  // defaults it off), and until this control existed nobody could say so.
  it("offers the public choice, off by default, and sends it when it is made", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PolicyFormDialog open mode="create" onOpenChange={() => {}} onSubmit={onSubmit} />);

    const toggle = screen.getByLabelText("Public");
    expect(toggle).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Priority" } });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ is_public: true });
  });

  it("sends the public change on its own, and nothing when it is untouched", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const first = render(
      <PolicyFormDialog open mode="edit" initial={DAILY} onOpenChange={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByLabelText("Public"));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ is_public: true });

    // A server too old to report it must not be told it changed.
    onSubmit.mockClear();
    first.unmount();
    render(
      <PolicyFormDialog open mode="edit" initial={{ ...DAILY, id: 3 }} onOpenChange={() => {}} onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Renamed" });
  });

  it("shows a policy that is already public as public", () => {
    render(
      <PolicyFormDialog open mode="edit" initial={{ ...DAILY, is_public: true }} onOpenChange={() => {}} onSubmit={vi.fn()} />,
    );
    expect(screen.getByLabelText("Public")).toBeChecked();
  });

  it("toggles priority support, sending only that change", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PolicyFormDialog open mode="edit" initial={DAILY} onOpenChange={() => {}} onSubmit={onSubmit} />,
    );

    const toggle = screen.getByLabelText("Includes priority support");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ support_included: true });
  });

  it("shows a policy that already includes support as ticked", () => {
    render(
      <PolicyFormDialog open mode="edit" initial={{ ...DAILY, support_included: true }} onOpenChange={() => {}} onSubmit={vi.fn()} />,
    );
    expect(screen.getByLabelText("Includes priority support")).toBeChecked();
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
