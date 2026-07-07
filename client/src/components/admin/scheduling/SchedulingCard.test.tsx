import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient, type SchedulingItem } from "@/services/api";
import { SchedulingCard } from "./SchedulingCard";

const WEEKLY: SchedulingItem = {
  id: 1, name: "Weekly", schedule_interval_seconds: 604800, priority: 0,
  enabled: true, is_default: true, manual_quota_limit: 20, manual_quota_window_seconds: 604800,
};
const DAILY: SchedulingItem = {
  id: 2, name: "Daily", schedule_interval_seconds: 86400, priority: 10,
  enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SchedulingCard", () => {
  it("renders a row per policy", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([WEEKLY, DAILY]);

    renderWithProviders(<SchedulingCard active />);

    expect(await screen.findByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("Daily")).toBeInTheDocument();
  });

  it("marks only the default policy with a 'Default' badge", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([WEEKLY, DAILY]);

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Weekly");

    const badges = screen.getAllByText("Default");
    expect(badges).toHaveLength(1);
    // the badge sits in the same row as the default policy's name
    expect(badges[0].closest("tr")).toHaveTextContent("Weekly");
  });

  it("renders the schedule interval human-readable", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([WEEKLY, DAILY]);

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Weekly");

    expect(screen.getByText("Weekly").closest("tr")).toHaveTextContent("7d");
    expect(screen.getByText("Daily").closest("tr")).toHaveTextContent("1d");
  });

  it("renders priority, manual quota and enabled state per policy", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([DAILY]);

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");
    const row = screen.getByText("Daily").closest("tr");

    expect(row).toHaveTextContent("10"); // priority
    expect(row).toHaveTextContent("20 / 1d"); // manual quota limit / window
    expect(row).toHaveTextContent(/enabled/i);
  });

  it("shows an empty state when there are no policies", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([]);

    renderWithProviders(<SchedulingCard active />);

    expect(await screen.findByText(/no scheduling policies/i)).toBeInTheDocument();
  });

  it("shows a loading state while policies are fetching", () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockReturnValue(
      new Promise(() => {}),
    );

    renderWithProviders(<SchedulingCard active />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an error state with a retry that refetches", async () => {
    const spy = vi
      .spyOn(apiClient, "getSchedulingPolicies")
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce([WEEKLY]);

    renderWithProviders(<SchedulingCard active />);

    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Weekly")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("creates a policy via the New Policy dialog and refreshes the list", async () => {
    const created: SchedulingItem = {
      id: 3, name: "Hourly", schedule_interval_seconds: 3600, priority: 0,
      enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 604800,
    };
    vi.spyOn(apiClient, "getSchedulingPolicies")
      .mockResolvedValueOnce([WEEKLY])
      .mockResolvedValue([WEEKLY, created]);
    const createSpy = vi
      .spyOn(apiClient, "createSchedulingPolicy")
      .mockResolvedValue(created);

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Weekly");

    fireEvent.click(screen.getByRole("button", { name: /new policy/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hourly" } });
    fireEvent.change(screen.getByLabelText("Recalculation interval"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Interval unit"), { target: { value: "3600" } });
    fireEvent.click(screen.getByRole("button", { name: /create policy/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy.mock.calls[0][0]).toMatchObject({ name: "Hourly", schedule_interval_seconds: 3600 });
    expect(await screen.findByText("Hourly")).toBeInTheDocument();
  });

  it("edits a policy via the row Edit action, sending only changed fields", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies")
      .mockResolvedValueOnce([DAILY])
      .mockResolvedValue([{ ...DAILY, name: "Renamed" }]);
    const updateSpy = vi
      .spyOn(apiClient, "updateSchedulingPolicy")
      .mockResolvedValue({ ...DAILY, name: "Renamed" });

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(2, { name: "Renamed" }));
    expect(await screen.findByText("Renamed")).toBeInTheDocument();
  });

  it("toggles enabled from the row switch", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies")
      .mockResolvedValueOnce([DAILY])
      .mockResolvedValue([{ ...DAILY, enabled: false }]);
    const updateSpy = vi
      .spyOn(apiClient, "updateSchedulingPolicy")
      .mockResolvedValue({ ...DAILY, enabled: false });

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");
    const row = screen.getByText("Daily").closest("tr")!;

    fireEvent.click(within(row).getByRole("switch"));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(2, { enabled: false }));
  });

  it("reverts the enabled toggle when the update fails", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([DAILY]);
    vi.spyOn(apiClient, "updateSchedulingPolicy").mockRejectedValue(new Error("nope"));

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");
    const row = screen.getByText("Daily").closest("tr")!;

    fireEvent.click(within(row).getByRole("switch"));

    await waitFor(() =>
      expect(within(row).getByRole("switch")).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("disables Delete for the default policy only", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([WEEKLY, DAILY]);

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Weekly");
    const weeklyRow = screen.getByText("Weekly").closest("tr")!;
    const dailyRow = screen.getByText("Daily").closest("tr")!;

    expect(within(weeklyRow).getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(within(dailyRow).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("deletes a non-default policy after confirmation", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies")
      .mockResolvedValueOnce([WEEKLY, DAILY])
      .mockResolvedValue([WEEKLY]);
    const delSpy = vi.spyOn(apiClient, "deleteSchedulingPolicy").mockResolvedValue();

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");
    const dailyRow = screen.getByText("Daily").closest("tr")!;
    fireEvent.click(within(dailyRow).getByRole("button", { name: "Delete" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete policy" }));

    await waitFor(() => expect(delSpy).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByText("Daily")).not.toBeInTheDocument());
  });

  it("surfaces the 409 reason when deletion is blocked", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([WEEKLY, DAILY]);
    vi.spyOn(apiClient, "deleteSchedulingPolicy").mockRejectedValue(
      new Error("Policy is assigned to users; reassign them first"),
    );

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");
    const dailyRow = screen.getByText("Daily").closest("tr")!;
    fireEvent.click(within(dailyRow).getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete policy" }));

    expect(await screen.findByText(/assigned to users/i)).toBeInTheDocument();
  });

  it("opens the per-policy users dialog from a row", async () => {
    const A = "a".repeat(64);
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([DAILY]);
    vi.spyOn(apiClient, "getSchedulingPolicyUsers").mockResolvedValue({
      items: [{ pubkey: A, last_time_published_graperank: null }],
      total: 1, page: 1, size: 20, pages: 1,
    });

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");
    const row = screen.getByText("Daily").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /users/i }));

    expect(await screen.findByText(new RegExp(A.slice(0, 12)))).toBeInTheDocument();
  });

  it("renders the bulk-assign panel", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicies").mockResolvedValue([DAILY]);

    renderWithProviders(<SchedulingCard active />);
    await screen.findByText("Daily");

    expect(screen.getByLabelText(/pubkeys/i)).toBeInTheDocument();
  });
});
