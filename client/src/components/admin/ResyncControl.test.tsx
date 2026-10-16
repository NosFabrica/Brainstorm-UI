import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient } from "@/services/api";
import { ResyncControl } from "./ResyncControl";

const PK = "a".repeat(64);

afterEach(() => vi.restoreAllMocks());

describe("ResyncControl", () => {
  it("resyncs the relay on confirm, with no target to pick", async () => {
    const spy = vi.spyOn(apiClient, "resyncObserver").mockResolvedValue({});

    renderWithProviders(<ResyncControl pubkey={PK} />);
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm resync/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(PK));
  });

  it("shows the backend reason and keeps the dialog open on failure", async () => {
    vi.spyOn(apiClient, "resyncObserver").mockRejectedValue(new Error("resync exploded"));

    renderWithProviders(<ResyncControl pubkey={PK} />);
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm resync/i }));

    expect(await screen.findByText(/resync exploded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm resync/i })).toBeInTheDocument();
  });
});
