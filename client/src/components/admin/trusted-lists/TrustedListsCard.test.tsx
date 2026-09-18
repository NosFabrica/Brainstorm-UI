// @vitest-environment jsdom
/**
 * Trusted Lists (server PR #86): an admin picks an observer — the customer the
 * lists are for — and publishes their kind-30392 lists, computed from that
 * observer's web of trust and signed by their Brainstorm key. The card asks
 * before publishing, because it signs public events under someone's key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { nip19 } from "nostr-tools";
import { TrustedListsUnavailableError, type TrustedListRunData } from "@/services/api";

const publishTrustedLists = vi.fn<(observer: string) => Promise<TrustedListRunData>>();
type UserRow = { pubkey: string } & Record<string, unknown>;
const getAdminUsers = vi.fn(async (_p: { search?: string; size?: number }) => ({ items: [] as UserRow[], total: 0, pages: 0 }));
const triggerUserGraperank = vi.fn(async (_pubkey: string) => undefined as unknown);
vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      publishTrustedLists: (observer: string) => publishTrustedLists(observer),
      getAdminUsers: (p: { search?: string; size?: number }) => getAdminUsers(p),
      triggerUserGraperank: (pubkey: string) => triggerUserGraperank(pubkey),
    },
  };
});
const HOUSE = "be7bf5de" + "0".repeat(56);
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: async () => HOUSE }));
vi.mock("@/lib/profileSearch", () => ({ searchByText: async () => ({ results: [], total: 0, timeMs: 1 }) }));
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchProfileMap: async () => new Map(),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { TrustedListsCard } from "./TrustedListsCard";

const RUN: TrustedListRunData = {
  observer: HOUSE,
  signing_pubkey: "c".repeat(64),
  taggings_in_store: 40,
  qualifying_asserters: 4,
  dictionary_size: 2,
  published: 2,
  failed: 0,
  retracted: 1,
  empty_reason: null,
  tags: [
    { slug: "podcaster", d_tag: "tl-tag-be7bf5de-aaaaaaaa-podcaster", tag_event_id: "e".repeat(64), status: "published", taggings_considered: 5, member_count: 3, error: null },
    { slug: "bitcoiner", d_tag: "tl-tag-be7bf5de-aaaaaaaa-bitcoiner", tag_event_id: "f".repeat(64), status: "published", taggings_considered: 9, member_count: 7, error: null },
    { slug: "old-tag", d_tag: "tl-tag-be7bf5de-aaaaaaaa-old-tag", tag_event_id: "", status: "retracted", taggings_considered: 0, member_count: 0, error: null },
  ],
};

describe("TrustedListsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("publishes the house's lists after a confirm that names it, and shows what the run did", async () => {
    publishTrustedLists.mockResolvedValue(RUN);
    renderWithProviders(<TrustedListsCard />);

    fireEvent.click(screen.getByRole("button", { name: /brainstorm \(house\)/i }));
    const chosen = await screen.findByTestId("trusted-lists-observer");
    expect(chosen.textContent).toContain("Brainstorm (house)");

    fireEvent.click(screen.getByRole("button", { name: /publish trusted lists/i }));
    const dialog = await screen.findByTestId("trusted-lists-confirm");
    expect(dialog.textContent).toContain("Brainstorm (house)");
    expect(publishTrustedLists).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^publish$/i }));

    await waitFor(() => expect(publishTrustedLists).toHaveBeenCalledWith(HOUSE));
    const result = await screen.findByTestId("trusted-lists-result");
    expect(result.textContent).toContain("Published 2 lists for Brainstorm (house)");
    expect(within(result).getByTestId("trusted-list-row-podcaster")).toHaveTextContent("3 members");
    expect(within(result).getByTestId("trusted-list-row-bitcoiner")).toHaveTextContent("7 members");
    expect(within(result).getByTestId("trusted-list-row-old-tag")).toHaveTextContent(/retracted/i);
  });

  // The server mints a signing key for any pubkey it's handed, so a typo or a
  // stranger's key would leave a stray one behind. Only accounts qualify.
  it("won't take a key without a Brainstorm account", async () => {
    getAdminUsers.mockResolvedValue({ items: [], total: 0, pages: 0 });
    renderWithProviders(<TrustedListsCard />);

    fireEvent.change(screen.getByTestId("input-trusted-lists-observer"), { target: { value: nip19.npubEncode("a".repeat(64)) } });

    expect(await screen.findByText(/only someone with a brainstorm account can have trusted lists/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish trusted lists/i })).toBeNull();
  });

  it("takes a pasted key that has an account straight away", async () => {
    const pk = "a".repeat(64);
    getAdminUsers.mockResolvedValue({ items: [{ pubkey: pk }], total: 1, pages: 1 });
    renderWithProviders(<TrustedListsCard />);

    fireEvent.change(screen.getByTestId("input-trusted-lists-observer"), { target: { value: nip19.npubEncode(pk) } });

    expect(await screen.findByTestId("trusted-lists-observer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish trusted lists/i })).toBeInTheDocument();
  });

  // The server has no lock: two clicks publish twice. Nothing leaves before the
  // confirm, and nothing leaves twice while a run is out.
  it("publishes nothing on Cancel, and can't be pressed twice while publishing", async () => {
    publishTrustedLists.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<TrustedListsCard />);
    fireEvent.click(screen.getByRole("button", { name: /brainstorm \(house\)/i }));
    await screen.findByTestId("trusted-lists-observer");

    fireEvent.click(screen.getByRole("button", { name: /publish trusted lists/i }));
    fireEvent.click(within(await screen.findByTestId("trusted-lists-confirm")).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByTestId("trusted-lists-confirm")).toBeNull());
    expect(publishTrustedLists).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /publish trusted lists/i }));
    fireEvent.click(within(await screen.findByTestId("trusted-lists-confirm")).getByRole("button", { name: /^publish$/i }));
    const button = await screen.findByTestId("trusted-lists-publish");
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent(/publishing/i);
    fireEvent.click(button);
    expect(publishTrustedLists).toHaveBeenCalledTimes(1);
  });

  async function publishHouse() {
    fireEvent.click(screen.getByRole("button", { name: /brainstorm \(house\)/i }));
    await screen.findByTestId("trusted-lists-observer");
    fireEvent.click(screen.getByRole("button", { name: /publish trusted lists/i }));
    fireEvent.click(within(await screen.findByTestId("trusted-lists-confirm")).getByRole("button", { name: /^publish$/i }));
  }

  it("shows the server's words when a run fails, and tries again on request", async () => {
    publishTrustedLists.mockRejectedValueOnce(new Error("could not connect to wss://relay.example")).mockResolvedValueOnce(RUN);
    renderWithProviders(<TrustedListsCard />);
    await publishHouse();

    const error = await screen.findByTestId("trusted-lists-error");
    expect(error).toHaveTextContent("could not connect to wss://relay.example");
    fireEvent.click(within(error).getByRole("button", { name: /try again/i }));

    expect(await screen.findByTestId("trusted-lists-result")).toBeInTheDocument();
    expect(publishTrustedLists).toHaveBeenCalledTimes(2);
  });

  // The server PR may not be deployed where this UI runs yet.
  it("says when this server doesn't have trusted lists, with nothing to retry", async () => {
    publishTrustedLists.mockRejectedValue(new TrustedListsUnavailableError());
    renderWithProviders(<TrustedListsCard />);
    await publishHouse();

    const error = await screen.findByTestId("trusted-lists-error");
    expect(error).toHaveTextContent("aren't available on this server yet");
    expect(within(error).queryByRole("button", { name: /try again/i })).toBeNull();
  });

  // The Users tab's "Publish trusted lists" sends a person straight here.
  it("starts with the person the Users tab sent, ready to publish", async () => {
    renderWithProviders(<TrustedListsCard initialObserver={"d".repeat(64)} />);

    expect(await screen.findByTestId("trusted-lists-observer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish trusted lists/i })).toBeInTheDocument();
  });

  // Lists come from the observer's own web of trust: until it's calculated,
  // nobody qualifies and the run comes back empty. Say so before publishing.
  it("warns when the observer's trust network was never calculated, and can start it", async () => {
    getAdminUsers.mockResolvedValue({ items: [{ pubkey: HOUSE, times_calculated: 0, latest_status: null, last_updated: null }], total: 1, pages: 1 });
    renderWithProviders(<TrustedListsCard />);
    fireEvent.click(screen.getByRole("button", { name: /brainstorm \(house\)/i }));

    const readiness = await screen.findByTestId("trusted-lists-readiness");
    await waitFor(() => expect(readiness).toHaveTextContent(/hasn't been calculated yet/i));
    fireEvent.click(within(readiness).getByRole("button", { name: /calculate first/i }));

    await waitFor(() => expect(triggerUserGraperank).toHaveBeenCalledWith(HOUSE));
  });

  it("says when the observer's trust network is ready, with nothing to start", async () => {
    getAdminUsers.mockResolvedValue({ items: [{ pubkey: HOUSE, times_calculated: 4, latest_status: "success", last_updated: "2026-09-15T10:00:00Z" }], total: 1, pages: 1 });
    renderWithProviders(<TrustedListsCard />);
    fireEvent.click(screen.getByRole("button", { name: /brainstorm \(house\)/i }));

    const readiness = await screen.findByTestId("trusted-lists-readiness");
    await waitFor(() => expect(readiness).toHaveTextContent(/trust network calculated/i));
    expect(within(readiness).queryByRole("button", { name: /calculate/i })).toBeNull();
  });

  // The server keeps no record of runs yet: a reload shouldn't lose the last one.
  it("shows the last run for this observer after a reload, marked as this device's", async () => {
    publishTrustedLists.mockResolvedValue(RUN);
    const first = renderWithProviders(<TrustedListsCard />);
    await publishHouse();
    await screen.findByTestId("trusted-lists-result");
    first.unmount();

    renderWithProviders(<TrustedListsCard />);
    fireEvent.click(screen.getByRole("button", { name: /brainstorm \(house\)/i }));

    expect(await screen.findByTestId("trusted-lists-remembered")).toHaveTextContent(/last run on this device/i);
    expect(screen.getByTestId("trusted-lists-result")).toHaveTextContent("Published 2 lists");
    expect(publishTrustedLists).toHaveBeenCalledTimes(1);
  });
});
