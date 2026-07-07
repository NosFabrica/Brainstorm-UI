import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient, type SchedulingItem } from "@/services/api";
import { PolicyUsersDialog } from "./PolicyUsersDialog";

const DAILY: SchedulingItem = {
  id: 2, name: "Daily", schedule_interval_seconds: 86400, priority: 10,
  enabled: true, is_default: false, manual_quota_limit: 20, manual_quota_window_seconds: 86400,
};
const A = "a".repeat(64);
const B = "b".repeat(64);

afterEach(() => vi.restoreAllMocks());

describe("PolicyUsersDialog", () => {
  it("lists the users assigned to the policy", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicyUsers").mockResolvedValue({
      items: [{ pubkey: A, last_time_published_graperank: null }],
      total: 1, page: 1, size: 20, pages: 1,
    });

    renderWithProviders(
      <PolicyUsersDialog policy={DAILY} open onOpenChange={() => {}} />,
    );

    expect(await screen.findByText(new RegExp(A.slice(0, 12)))).toBeInTheDocument();
  });

  it("pages forward through the user list", async () => {
    const spy = vi
      .spyOn(apiClient, "getSchedulingPolicyUsers")
      .mockResolvedValueOnce({
        items: [{ pubkey: A, last_time_published_graperank: null }],
        total: 2, page: 1, size: 1, pages: 2,
      })
      .mockResolvedValue({
        items: [{ pubkey: B, last_time_published_graperank: null }],
        total: 2, page: 2, size: 1, pages: 2,
      });

    renderWithProviders(
      <PolicyUsersDialog policy={DAILY} open onOpenChange={() => {}} />,
    );
    await screen.findByText(new RegExp(A.slice(0, 12)));

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(new RegExp(B.slice(0, 12)))).toBeInTheDocument();
    expect(spy.mock.calls.at(-1)?.[1]).toMatchObject({ page: 2 });
  });

  it("shows an error state when the users query fails", async () => {
    vi.spyOn(apiClient, "getSchedulingPolicyUsers").mockRejectedValue(
      new Error("boom"),
    );

    renderWithProviders(
      <PolicyUsersDialog policy={DAILY} open onOpenChange={() => {}} />,
    );

    expect(await screen.findByText(/failed to load users/i)).toBeInTheDocument();
  });
});
