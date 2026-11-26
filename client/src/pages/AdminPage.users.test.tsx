// @vitest-environment jsdom
/**
 * The Users tab: finding anyone by name, whatever page they are on; what the
 * console reads for its header; and runs already in flight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const TOTAL = 271;
const pk = (i: number) => String(i).padStart(64, "0");
const userRow = (i: number) => ({
  pubkey: pk(i),
  latest_status: "success",
  latest_ta_status: "success",
  times_calculated: 1,
  last_updated: new Date().toISOString(),
});

const api = vi.hoisted(() => ({
  getAdminStats: vi.fn(async () => ({ scoredUsers: 0, spAdopters: 0, queueDepth: 0, totalUsers: 0 })),
  getAdminUsers: vi.fn(async (_p: Record<string, unknown>) => ({ items: [] as unknown[], total: 0, pages: 1 })),
  getAdminActivity: vi.fn(async (_p: Record<string, unknown>) => ({ items: [] as unknown[], total: 0, pages: 1 })),
  getSchedulingPolicies: vi.fn(async () => []),
  getGrapeRankResult: vi.fn(async () => null),
  getAdminUserHistory: vi.fn(async () => ({ items: [] })),
  getBrainstormPubkey: vi.fn(async () => null),
  triggerUserGraperank: vi.fn(),
}));
const header = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/services/api", () => ({ apiClient: api, isAuthRedirecting: () => false }));
vi.mock("@/services/support", () => ({ ADMIN_SUPPORT_QUERY_KEY: ["support"], adminListTickets: async () => [] }));
vi.mock("@/services/nostr", () => ({
  fetchProfile: async (pubkey: string) => ({ name: `Person ${parseInt(pubkey, 10)}` }),
  searchNostrProfiles: async () => [],
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfiles: (pubkeys: string[]) => new Map(pubkeys.map((p) => [p, { name: `Person ${parseInt(p, 10)}` }])),
}));
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: async () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ isAdmin: true, pubkey: "a".repeat(64) }),
}));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => null, use$: () => undefined }));
vi.mock("@/accounts/session", () => ({ hasSession: () => true }));
vi.mock("@/accounts/login-flow", () => ({ logout: () => {} }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: header }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/PageBackground", () => ({ default: () => null }));
vi.mock("@/components/DeferredSession", () => ({ DeferredSessionNotice: () => null }));
vi.mock("@/components/admin/NostrHealthCard", () => ({ NostrHealthCard: () => null }));
vi.mock("@/components/admin/support/AdminSupportCards", () => ({ AdminSupportCards: () => null }));
vi.mock("@/components/admin/billing/AdminBillingCards", () => ({ AdminBillingCards: () => null }));
vi.mock("@/components/admin/billing/PlanMappingsCard", () => ({ PlanMappingsCard: () => null }));
vi.mock("@/components/admin/scheduling/SchedulingCard", () => ({ SchedulingCard: () => null }));
vi.mock("@/components/admin/scheduling/SchedulingStatsPanel", () => ({ SchedulingStatsPanel: () => null }));
vi.mock("@/components/admin/trusted-lists/TrustedListsCard", () => ({ TrustedListsCard: () => null }));
vi.mock("@/components/admin/growth/GrowthCard", () => ({ GrowthCard: () => null }));

import AdminPage from "./AdminPage";

// A whole 271-user console renders several times per test; give it room on a loaded machine.
vi.setConfig({ testTimeout: 15_000 });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

/** 271 users in the directory, 25 a page; the range's own list is empty. */
function directory() {
  api.getAdminUsers.mockImplementation(async ({ page = 1, size = 25, days }: Record<string, unknown>) => {
    if (days !== 9999) return { items: [], total: 0, pages: 1 };
    const from = ((page as number) - 1) * (size as number);
    const items = Array.from({ length: Math.max(0, Math.min(size as number, TOTAL - from)) }, (_, i) =>
      userRow(from + i),
    );
    return { items, total: TOTAL, pages: Math.ceil(TOTAL / (size as number)) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  directory();
  window.history.replaceState({}, "", "/admin");
});

describe("the Users tab's name search", () => {
  it("finds a user who is not on the first page", async () => {
    window.history.replaceState({}, "", "/admin?tab=users");
    renderPage();
    const panel = await screen.findByTestId("panel-users");
    await waitFor(() => expect(within(panel).getAllByTestId(/^row-user-\d+$/)).toHaveLength(25));

    fireEvent.change(screen.getByTestId("input-user-search"), { target: { value: "Person 200" } });

    await waitFor(() => expect(within(panel).getAllByTestId(/^row-user-\d+$/)).toHaveLength(1), { timeout: 4000 });
    expect(within(panel).getByTestId("row-user-0")).toHaveTextContent("Person 200");
  });

  it("doesn't re-render the console on every keystroke", async () => {
    window.history.replaceState({}, "", "/admin?tab=users");
    renderPage();
    const panel = await screen.findByTestId("panel-users");
    await waitFor(() => expect(within(panel).getAllByTestId(/^row-user-\d+$/)).toHaveLength(25));
    // Let the first loads settle.
    await act(() => new Promise((r) => setTimeout(r, 50)));

    const before = header.mock.calls.length;
    const input = screen.getByTestId("input-user-search");
    for (const value of ["P", "Pe", "Per", "Pers", "Perso"]) fireEvent.change(input, { target: { value } });
    expect(input).toHaveValue("Perso");
    expect(header.mock.calls.length - before).toBe(0);
  });
});

describe("a header card's filter", () => {
  it("pages the phone cards and the pager the same way as the table", async () => {
    // Every third user's last run failed: 180 of the 271 are scored.
    api.getAdminUsers.mockImplementation(async ({ page = 1, size = 25, days }: Record<string, unknown>) => {
      if (days !== 9999) return { items: [], total: 0, pages: 1 };
      const from = ((page as number) - 1) * (size as number);
      const items = Array.from({ length: Math.max(0, Math.min(size as number, TOTAL - from)) }, (_, i) => ({
        ...userRow(from + i),
        latest_status: (from + i) % 3 === 0 ? "failure" : "success",
      }));
      return { items, total: TOTAL, pages: Math.ceil(TOTAL / (size as number)) };
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("kpi-scored-users"));
    const panel = await screen.findByTestId("panel-users");
    await waitFor(() => expect(within(panel).getByTestId("pagination-users")).toHaveTextContent("Page 1 of 8"), {
      timeout: 4000,
    });

    expect(within(panel).getAllByTestId(/^row-user-\d+$/)).toHaveLength(25);
    expect(within(panel).getAllByTestId(/^card-user-\d+$/)).toHaveLength(25);
    expect(within(panel).getByTestId("pagination-users")).toHaveTextContent("(180 total)");
  });
});

describe("Lookup by name", () => {
  it("finds a user who is not on the page on screen", async () => {
    window.history.replaceState({}, "", "/admin?tab=users");
    renderPage();
    const panel = await screen.findByTestId("panel-users");
    await waitFor(() => expect(within(panel).getAllByTestId(/^row-user-\d+$/)).toHaveLength(25));

    fireEvent.click(screen.getByTestId("button-lookup-pubkey"));
    fireEvent.change(await screen.findByTestId("input-lookup-pubkey"), { target: { value: "Person 250" } });
    // The whole directory's names have to arrive before a name can match.
    await act(() => new Promise((r) => setTimeout(r, 100)));
    fireEvent.click(screen.getByTestId("button-submit-lookup"));

    await waitFor(() => expect(screen.getByTestId("input-user-search")).toHaveValue(pk(250)), { timeout: 3000 });
  });
});

describe("the header's whole-table reads", () => {
  it("are not paged through on a tab that doesn't draw them", async () => {
    window.history.replaceState({}, "", "/admin?tab=billing");
    renderPage();
    await screen.findByTestId("kpi-compact");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(api.getAdminActivity).not.toHaveBeenCalled();
    expect(api.getAdminUsers).not.toHaveBeenCalledWith(expect.objectContaining({ days: 9999, size: 100 }));
  });
});

describe("a bulk re-trigger", () => {
  it("marks its people in flight, so a row's own re-trigger can't send a duplicate", async () => {
    const run = {
      private_id: 7,
      pubkey: pk(7),
      status: "success",
      ta_status: "success",
      internal_publication_status: "success",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
      algorithm: "graperank",
      trigger_source: "manual",
    };
    api.getAdminActivity.mockResolvedValue({ items: [run], total: 1, pages: 1 });
    let release!: () => void;
    api.triggerUserGraperank.mockImplementation(() => new Promise<void>((r) => (release = r)));
    window.history.replaceState({}, "", "/admin?tab=activity");
    renderPage();

    fireEvent.click(await screen.findByTestId("checkbox-activity-7"));
    fireEvent.click(await screen.findByTestId("button-bulk-retrigger-activity"));
    fireEvent.click(await screen.findByTestId("button-confirm-bulk"));
    await waitFor(() => expect(api.triggerUserGraperank).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("button-retrigger-7")).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId("button-retrigger-7")).not.toBeDisabled());
  });
});
