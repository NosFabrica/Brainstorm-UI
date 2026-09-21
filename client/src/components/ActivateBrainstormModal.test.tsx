// @vitest-environment jsdom
/**
 * Activating from the dashboard. The declaration this modal signs has to name
 * the user's Trusted Lists, exactly as the /setup page's does — it didn't, so
 * people who activated here were asked to sign a second time minutes later.
 *
 * The real `trustAnchor` and `trustLists` run here: only the relay layer and
 * the signer are stood in for, so the test fails if the modal, the publish
 * service or the lists lookup stops carrying the rows.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { queryClient } from "@/lib/queryClient";
import { ActivateBrainstormModal } from "./ActivateBrainstormModal";

const ME = "a".repeat(64);
const TA = "b".repeat(64);
const LISTS = { key: "c".repeat(64), relay: "wss://nip85-staging.example" };

const signNip85 = vi.fn(async () => ({ id: "signed", kind: 10040, pubkey: ME, tags: [], content: "", sig: "", created_at: 0 }));
const publishToRelays = vi.fn(async () => ({ success: true, relay: "wss://relay" }));

vi.mock("@/services/nostr", () => ({
  signNip85: (...a: unknown[]) => signNip85(...(a as [])),
  publishToRelays: (...a: unknown[]) => publishToRelays(...(a as [])),
  getNip85RelayUrl: () => "wss://nip85-staging.example",
  fetchTrustProviderList: async () => undefined,
  fetchOutboxRelayList: async () => [],
  isUsingBrainstorm: async () => false,
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: ME, displayName: "Ana" }),
}));

describe("activating Brainstorm from the dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("names the Trusted Lists the user has, so nothing asks them to sign again", async () => {
    // What the dashboard already learned about this account's lists.
    queryClient.setQueryData(["trust-lists-status", ME, TA], { status: "missing", designation: LISTS });

    render(<ActivateBrainstormModal open onOpenChange={() => {}} serviceKey={TA} onActivated={() => {}} />);
    await userEvent.click(screen.getByTestId("button-activate-confirm"));

    await waitFor(() => expect(signNip85).toHaveBeenCalled());
    expect(signNip85).toHaveBeenCalledWith(TA, "wss://nip85-staging.example", expect.objectContaining({ lists: LISTS }));
  });

  it("signs the declaration alone when there are no lists to name", async () => {
    queryClient.setQueryData(["trust-lists-status", ME, TA], { status: "none", designation: null });

    render(<ActivateBrainstormModal open onOpenChange={() => {}} serviceKey={TA} onActivated={() => {}} />);
    await userEvent.click(screen.getByTestId("button-activate-confirm"));

    await waitFor(() => expect(signNip85).toHaveBeenCalled());
    expect(signNip85).toHaveBeenCalledWith(TA, "wss://nip85-staging.example", expect.objectContaining({ lists: null }));
  });
});
