// @vitest-environment jsdom
/**
 * The Trusted Lists update: their account already works, so this is an
 * update, not a setup step — asked for in one tap, the signer prompt being the
 * confirmation. A decline is fine: a gentle toast, and the Update stays until
 * they sign. Nothing here ever asks for a signature on its own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const ME = "a".repeat(64);
const TA = "b".repeat(64);
const LISTS = { key: TA, relay: "wss://nip85-staging.example" };
const s = vi.hoisted(() => ({ lists: undefined as unknown }));
const publish = vi.fn();
const toast = vi.fn();

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: s.lists }) }));
vi.mock("@/services/trustAnchor", () => ({ publishBrainstormTrustAnchor: (...a: unknown[]) => publish(...a) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { ListsUpdateLine, ListsUpdatePill } from "./ListsUpdate";
import { Toast, ToastProvider, ToastViewport } from "@/components/ui/toast";

const tap = () => fireEvent.click(screen.getByRole("button", { name: /^update$/i }));

describe("ListsUpdatePill", () => {
  beforeEach(() => {
    publish.mockReset();
    toast.mockReset();
    s.lists = { status: "missing", designation: LISTS };
  });

  it("one tap publishes the update naming their lists, and says it's done", async () => {
    publish.mockResolvedValue({ status: "success" });
    render(<ListsUpdatePill />);
    expect(screen.getByTestId("pill-lists-update")).toHaveTextContent("New lists from your network");

    tap();

    await waitFor(() => expect(publish).toHaveBeenCalledWith(ME, TA, undefined, { lists: LISTS }));
    // On brand, and about their lists — no protocol names in a thank-you.
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Updated — your lists are live.", variant: "brand" })));
    expect(JSON.stringify(toast.mock.calls)).not.toMatch(/nostr/i);
  });

  it("a declined signature gets a gentle toast, and the Update stays until they sign", async () => {
    publish.mockResolvedValue({ status: "cancelled", unlockDeclined: false });
    render(<ListsUpdatePill />);

    tap();

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Update skipped", variant: "brand" })));
    expect(screen.getByRole("button", { name: /^update$/i })).toBeEnabled();
  });

  // The update is already signed; a relay failure shouldn't cost a signature.
  it("a failed publish says so and offers Retry, which re-sends the signed update", async () => {
    const retry = vi.fn(async () => ({ status: "success" }));
    publish.mockResolvedValue({ status: "error", message: "all relays refused", retry });
    render(<ListsUpdatePill />);

    tap();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't reach your relays", variant: "destructive" })),
    );
    expect(screen.getByRole("button", { name: /^update$/i })).toBeInTheDocument();
    const action = (toast.mock.calls[0][0] as { action?: React.ReactElement }).action;
    expect(action).toBeTruthy();
    render(
      <ToastProvider>
        <Toast open>{action}</Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Updated — your lists are live." })));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when there's nothing to update, and never asks on its own", () => {
    const { unmount } = render(<ListsUpdatePill />);
    expect(publish).not.toHaveBeenCalled();
    unmount();
    s.lists = { status: "declared", designation: LISTS };
    render(<ListsUpdatePill />);
    expect(screen.queryByTestId("pill-lists-update")).toBeNull();
  });

  // Benjamin: the Brainstorm "B", not an emoji — it's Brainstorm asking.
  it("carries the Brainstorm mark, not a sparkle", () => {
    const { unmount } = render(<ListsUpdatePill />);
    const pill = screen.getByTestId("pill-lists-update");
    expect(within(pill).getByRole("img", { name: "Brainstorm" })).toBeInTheDocument();
    expect(pill.querySelector(".lucide-sparkles")).toBeNull();
    unmount();

    render(<ListsUpdateLine />);
    const line = screen.getByTestId("line-lists-update");
    expect(within(line).getByRole("img", { name: "Brainstorm" })).toBeInTheDocument();
    expect(line.querySelector(".lucide-sparkles")).toBeNull();
  });
});
