// @vitest-environment jsdom
/** One search at a time: a second Enter while the first search is out does not send another. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getAdminUsers = vi.fn();
vi.mock("@/services/api", () => ({ apiClient: { getAdminUsers: (...a: unknown[]) => getAdminUsers(...a) } }));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  searchNostrProfiles: async () => [],
  fetchProfileMap: async () => new Map(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AssignUsersDialog } from "./AssignUsersDialog";

beforeEach(() => {
  getAdminUsers.mockReset();
});

describe("AssignUsersDialog search", () => {
  it("sends one search for Enter pressed twice before the first answers", async () => {
    let answer!: (v: { items: never[] }) => void;
    getAdminUsers.mockImplementation(() => new Promise((r) => (answer = r)));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssignUsersDialog open onOpenChange={() => {}} policyId={1} policyName="Weekly" />
      </QueryClientProvider>,
    );
    const input = screen.getByTestId("assign-search-input");
    fireEvent.change(input, { target: { value: "alice" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(getAdminUsers).toHaveBeenCalled());
    expect(getAdminUsers).toHaveBeenCalledTimes(1);
    answer({ items: [] });
  });
});
