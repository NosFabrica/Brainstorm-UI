import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient, type SchedulingItem } from "@/services/api";
import { UserTierPicker } from "./UserTierPicker";

const PK = "a".repeat(64);
const WEEKLY: SchedulingItem = {
  id: 1, name: "Weekly", schedule_interval_seconds: 604800, priority: 0,
  enabled: true, is_default: true, manual_quota_limit: 20, manual_quota_window_seconds: 604800,
};
const DAILY: SchedulingItem = {
  id: 2, name: "Daily", schedule_interval_seconds: 86400, priority: 10,
  enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
};
const POLICIES = [WEEKLY, DAILY];

afterEach(() => vi.restoreAllMocks());

describe("UserTierPicker", () => {
  it("preselects the default policy when the user has no explicit tier", () => {
    renderWithProviders(
      <UserTierPicker pubkey={PK} schedulingId={null} schedulingName="Weekly" policies={POLICIES} />,
    );

    expect(screen.getByRole("combobox")).toHaveValue("1");
  });

  it("assigns the chosen policy on change", async () => {
    const spy = vi.spyOn(apiClient, "assignUserScheduling").mockResolvedValue({});

    renderWithProviders(
      <UserTierPicker pubkey={PK} schedulingId={1} schedulingName="Weekly" policies={POLICIES} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

    await waitFor(() => expect(spy).toHaveBeenCalledWith(PK, 2));
  });

  it("reverts the selection when assignment fails", async () => {
    vi.spyOn(apiClient, "assignUserScheduling").mockRejectedValue(
      new Error("Unknown scheduling policy id 2"),
    );

    renderWithProviders(
      <UserTierPicker pubkey={PK} schedulingId={1} schedulingName="Weekly" policies={POLICIES} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });

    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("1"));
  });
});
