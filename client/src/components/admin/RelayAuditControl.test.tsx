import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient, type RelayAudit } from "@/services/api";
import { RelayAuditControl } from "./RelayAuditControl";

const PK = "a".repeat(64);

function audit(overrides: Partial<RelayAudit> = {}): RelayAudit {
  return {
    observer: PK,
    signer: "b".repeat(64),
    expected: 152663,
    published: 152663,
    baseline_drift: 0,
    on_relay: 152766,
    missing: 1496,
    orphans: 1599,
    exact: true,
    needs_resync: true,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("RelayAuditControl", () => {
  it("does not read the relay until opened", () => {
    const spy = vi.spyOn(apiClient, "relayAudit").mockResolvedValue(audit());

    renderWithProviders(<RelayAuditControl pubkey={PK} open={false} onOpenChange={() => {}} />);

    expect(spy).not.toHaveBeenCalled();
  });

  it("shows the counts and offers a relay resync when TAs are missing", async () => {
    vi.spyOn(apiClient, "relayAudit").mockResolvedValue(audit());
    const resync = vi.spyOn(apiClient, "resyncObserver").mockResolvedValue({});

    renderWithProviders(<RelayAuditControl pubkey={PK} open onOpenChange={() => {}} />);

    const result = await screen.findByTestId("relay-audit-result");
    expect(result).toHaveTextContent((1496).toLocaleString());
    expect(result).toHaveTextContent((1599).toLocaleString());

    fireEvent.click(screen.getByRole("button", { name: /resync relay/i }));
    await waitFor(() => expect(resync).toHaveBeenCalledWith(PK));
    expect(await screen.findByRole("button", { name: /resync queued/i })).toBeDisabled();
  });

  it("says so and offers no resync when everything is there", async () => {
    vi.spyOn(apiClient, "relayAudit").mockResolvedValue(audit({ missing: 0, needs_resync: false }));

    renderWithProviders(<RelayAuditControl pubkey={PK} open onOpenChange={() => {}} />);

    expect(await screen.findByText(/every expected ta is on the relay/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resync relay/i })).not.toBeInTheDocument();
  });

  it("marks sampled results as estimates", async () => {
    vi.spyOn(apiClient, "relayAudit").mockResolvedValue(audit({ exact: false }));

    renderWithProviders(<RelayAuditControl pubkey={PK} open onOpenChange={() => {}} />);

    expect(await screen.findByTestId("relay-audit-result")).toHaveTextContent(`≈ ${(1496).toLocaleString()}`);
    expect(screen.getByTestId("relay-audit-estimate")).toBeInTheDocument();
  });

  it("shows exact results without the estimate note", async () => {
    vi.spyOn(apiClient, "relayAudit").mockResolvedValue(audit());

    renderWithProviders(<RelayAuditControl pubkey={PK} open onOpenChange={() => {}} />);

    expect(await screen.findByTestId("relay-audit-result")).not.toHaveTextContent("≈");
    expect(screen.queryByTestId("relay-audit-estimate")).not.toBeInTheDocument();
  });

  it("flags last_published drifting from Neo4j", async () => {
    vi.spyOn(apiClient, "relayAudit").mockResolvedValue(audit({ baseline_drift: 42 }));

    renderWithProviders(<RelayAuditControl pubkey={PK} open onOpenChange={() => {}} />);

    expect(await screen.findByTestId("relay-audit-drift")).toHaveTextContent("42 differ");
  });

  it("shows the backend reason when the audit fails", async () => {
    vi.spyOn(apiClient, "relayAudit").mockRejectedValue(new Error("Could not read the TA relay: OSError"));

    renderWithProviders(<RelayAuditControl pubkey={PK} open onOpenChange={() => {}} />);

    expect(await screen.findByTestId("relay-audit-error")).toHaveTextContent(/could not read the ta relay/i);
  });
});
