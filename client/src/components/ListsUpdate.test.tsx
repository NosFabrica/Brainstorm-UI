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
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/updated/i) })));
  });

  it("a declined signature gets a gentle toast, and the Update stays until they sign", async () => {
    publish.mockResolvedValue({ status: "cancelled", unlockDeclined: false });
    render(<ListsUpdatePill />);

    tap();

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Update skipped" })));
    expect(screen.getByRole("button", { name: /^update$/i })).toBeEnabled();
  });

  it("a failed publish says so, and the Update stays", async () => {
    publish.mockResolvedValue({ status: "error", message: "all relays refused" });
    render(<ListsUpdatePill />);

    tap();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "all relays refused", variant: "destructive" })),
    );
    expect(screen.getByRole("button", { name: /^update$/i })).toBeInTheDocument();
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
