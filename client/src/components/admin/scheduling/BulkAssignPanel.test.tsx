import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient, type SchedulingItem } from "@/services/api";
import { BulkAssignPanel } from "./BulkAssignPanel";

const HEX = "a".repeat(64);
const WEEKLY: SchedulingItem = {
  id: 1, name: "Weekly", schedule_interval_seconds: 604800, priority: 0,
  enabled: true, is_default: true, manual_quota_limit: 20, manual_quota_window_seconds: 604800,
};
const DAILY: SchedulingItem = {
  id: 2, name: "Daily", schedule_interval_seconds: 86400, priority: 10,
  enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
};

afterEach(() => vi.restoreAllMocks());

describe("BulkAssignPanel", () => {
  it("shows the parsed valid and invalid counts", () => {
    renderWithProviders(<BulkAssignPanel policies={[WEEKLY, DAILY]} />);

    fireEvent.change(screen.getByLabelText(/pubkeys/i), {
      target: { value: `${HEX} garbage` },
    });

    expect(screen.getByText(/1 valid/i)).toBeInTheDocument();
    expect(screen.getByText(/1 invalid/i)).toBeInTheDocument();
  });

  it("assigns the parsed hex pubkeys to the chosen policy", async () => {
    const assignSpy = vi
      .spyOn(apiClient, "assignPolicyUsers")
      .mockResolvedValue({ assigned: 1 });

    renderWithProviders(<BulkAssignPanel policies={[WEEKLY, DAILY]} />);

    fireEvent.change(screen.getByLabelText(/pubkeys/i), { target: { value: HEX } });
    fireEvent.change(screen.getByLabelText(/target policy/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /assign/i }));

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith(2, [HEX]));
  });
});
