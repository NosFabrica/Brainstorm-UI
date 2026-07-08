import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient } from "@/services/api";
import { ResyncControl } from "./ResyncControl";

const PK = "a".repeat(64);

afterEach(() => vi.restoreAllMocks());

describe("ResyncControl", () => {
  it("opens a confirm dialog with the target defaulting to both", () => {
    renderWithProviders(<ResyncControl pubkey={PK} />);

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));

    expect(screen.getByRole("combobox")).toHaveValue("both");
  });

  it("resyncs with the default target on confirm", async () => {
    const spy = vi.spyOn(apiClient, "resyncObserver").mockResolvedValue({});

    renderWithProviders(<ResyncControl pubkey={PK} />);
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm resync/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(PK, "both"));
  });

  it("resyncs with the chosen target", async () => {
    const spy = vi.spyOn(apiClient, "resyncObserver").mockResolvedValue({});

    renderWithProviders(<ResyncControl pubkey={PK} />);
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "relay" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm resync/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(PK, "relay"));
  });

  it("shows the backend reason and keeps the dialog open on failure", async () => {
    vi.spyOn(apiClient, "resyncObserver").mockRejectedValue(
      new Error("resync exploded"),
    );

    renderWithProviders(<ResyncControl pubkey={PK} />);
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm resync/i }));

    expect(await screen.findByText(/resync exploded/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
