import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfirmNewFollowListDialog, type RelaySearchResult } from "./ConfirmNewFollowListDialog";

// The real module drags in deployment config; the dialog only needs the shape check.
vi.mock("@/config/tagging", () => ({
  isRelayUrl: (url: string) => /^wss?:\/\/[^\s/$.?#][^\s]*$/i.test(url.trim()),
}));

const onCancel = vi.fn();
const onConfirm = vi.fn();
const onSearchRelay = vi.fn<(url: string) => Promise<RelaySearchResult>>();

function dialog(open = true, busy = false) {
  return (
    <ConfirmNewFollowListDialog
      open={open}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onSearchRelay={onSearchRelay}
    />
  );
}

const typeRelay = (value = "wss://my.relay") =>
  fireEvent.change(screen.getByTestId("input-recovery-relay"), { target: { value } });

describe("ConfirmNewFollowListDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the original cancel and confirm paths", () => {
    render(dialog());

    fireEvent.click(screen.getByTestId("button-new-follow-list-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Radix fires both the button's onClick and onOpenChange(false) here — the
    // contract is "cancel was requested", not an exact call count.
    fireEvent.click(screen.getByTestId("button-new-follow-list-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("only enables the search for something shaped like a relay", () => {
    render(dialog());
    const button = screen.getByTestId("button-search-relay");

    expect(button).toBeDisabled();
    typeRelay("https://not-a.relay");
    expect(button).toBeDisabled();
    typeRelay("wss://relay.example.com");
    expect(button).toBeEnabled();
  });

  it("blocks the destructive publish while a search is in flight — but never Cancel", async () => {
    let resolve!: (r: RelaySearchResult) => void;
    onSearchRelay.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(dialog());

    typeRelay();
    fireEvent.click(screen.getByTestId("button-search-relay"));

    expect(onSearchRelay).toHaveBeenCalledWith("wss://my.relay");
    expect(screen.getByTestId("button-new-follow-list-confirm")).toBeDisabled();
    expect(screen.getByTestId("button-new-follow-list-cancel")).toBeEnabled();

    resolve({ found: false });
    await waitFor(() =>
      expect(screen.getByTestId("button-new-follow-list-confirm")).toBeEnabled(),
    );
  });

  it("tells not-found apart from a relay we couldn't reach", async () => {
    onSearchRelay.mockResolvedValueOnce({ found: false });
    render(dialog());
    typeRelay();

    fireEvent.click(screen.getByTestId("button-search-relay"));
    expect(await screen.findByTestId("text-relay-search-status")).toHaveTextContent(
      "No follow list for this key",
    );

    onSearchRelay.mockResolvedValueOnce({
      found: false,
      error: "Couldn't reach that relay — check the address and try again.",
    });
    fireEvent.click(screen.getByTestId("button-search-relay"));
    await waitFor(() =>
      expect(screen.getByTestId("text-relay-search-status")).toHaveTextContent("Couldn't reach"),
    );
  });

  it("renders no status on success — closing is the parent's move", async () => {
    onSearchRelay.mockResolvedValue({ found: true, follows: 5 });
    render(dialog());
    typeRelay();

    fireEvent.click(screen.getByTestId("button-search-relay"));
    await waitFor(() =>
      expect(screen.getByTestId("button-new-follow-list-confirm")).toBeEnabled(),
    );

    expect(screen.queryByTestId("text-relay-search-status")).not.toBeInTheDocument();
  });

  it("survives a handler that throws, as an error state rather than a crash", async () => {
    onSearchRelay.mockRejectedValue(new Error("boom"));
    render(dialog());
    typeRelay();

    fireEvent.click(screen.getByTestId("button-search-relay"));

    expect(await screen.findByTestId("text-relay-search-status")).toHaveTextContent(
      "Something went wrong",
    );
  });

  it("starts clean when reopened", async () => {
    onSearchRelay.mockResolvedValue({ found: false, error: "Couldn't reach that relay." });
    const { rerender } = render(dialog());
    typeRelay();
    fireEvent.click(screen.getByTestId("button-search-relay"));
    await screen.findByTestId("text-relay-search-status");

    rerender(dialog(false));
    rerender(dialog(true));

    expect(screen.getByTestId("input-recovery-relay")).toHaveValue("");
    expect(screen.queryByTestId("text-relay-search-status")).not.toBeInTheDocument();
  });
});
