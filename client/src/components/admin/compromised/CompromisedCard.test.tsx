// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import type { CompromisedPubkey, MarkCompromisedBody } from "@/services/api";

const listCompromised = vi.fn<() => Promise<CompromisedPubkey[]>>();
const markCompromised = vi.fn<(pk: string, body: MarkCompromisedBody) => Promise<unknown>>();
const unmarkCompromised = vi.fn<(pk: string) => Promise<void>>();
const updateCompromisedMetadata = vi.fn<(pk: string, body: unknown) => Promise<unknown>>();
vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      listCompromised: () => listCompromised(),
      markCompromised: (pk: string, body: MarkCompromisedBody) => markCompromised(pk, body),
      unmarkCompromised: (pk: string) => unmarkCompromised(pk),
      updateCompromisedMetadata: (pk: string, body: unknown) => updateCompromisedMetadata(pk, body),
    },
  };
});
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchProfileMap: async () => new Map(),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { CompromisedCard } from "./CompromisedCard";

const PK = "3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24";
const NEVENT = nip19.neventEncode({ id: "0".repeat(64) });

const ROW: CompromisedPubkey = {
  pubkey: PK,
  proof_event_id: "0".repeat(64),
  proof_event: { id: "0".repeat(64), pubkey: PK, created_at: 1, kind: 1, tags: [], content: "stolen", sig: "s" },
  successor_pubkey: null,
  reason: "leak",
  added_by: "f".repeat(64),
  created_at: "2026-11-16T17:00:00",
  updated_at: "2026-11-16T17:00:00",
  last_zeroed_at: "2026-11-16T17:00:05",
  last_zero_report: {
    observers: 2,
    relay_read: true,
    published: 2,
    acked: 2,
    complete: true,
    neo4j_cleared: 4,
    whitelists_updated: 1,
    edges_cut: 9,
  },
};

describe("CompromisedCard", () => {
  beforeEach(() => {
    listCompromised.mockReset();
    markCompromised.mockReset();
    unmarkCompromised.mockReset();
    updateCompromisedMetadata.mockReset();
    toast.mockReset();
  });

  it("lists the marked accounts with how their zeroing went", async () => {
    listCompromised.mockResolvedValue([ROW]);
    renderWithProviders(<CompromisedCard active />);

    expect(await screen.findByTestId(`compromised-row-${PK}`)).toBeInTheDocument();
    expect(screen.getByTestId("compromised-state-complete")).toHaveTextContent("Zeroed");
    expect(screen.getByTestId("compromised-zero-summary")).toHaveTextContent("2/2 Observers");
  });

  it("marks an account from the form", async () => {
    listCompromised.mockResolvedValue([]);
    markCompromised.mockResolvedValue(ROW);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId("compromised-empty");

    fireEvent.change(screen.getByTestId("input-compromised-account"), {
      target: { value: nip19.npubEncode(PK) },
    });
    fireEvent.change(screen.getByTestId("input-compromised-proof-id"), { target: { value: NEVENT } });
    fireEvent.click(screen.getByTestId("button-mark-compromised"));

    await waitFor(() => expect(markCompromised).toHaveBeenCalledWith(PK, { proof_event_id: NEVENT }));
    // The PUT answers once the zeroing is done; the toast says what it did.
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Marked compromised", description: expect.stringContaining("2/2 Observers") }),
    );
  });

  it("says what's wrong before sending anything", async () => {
    listCompromised.mockResolvedValue([]);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId("compromised-empty");

    fireEvent.click(screen.getByTestId("button-mark-compromised"));

    expect(await screen.findByTestId("error-mark-compromised")).toHaveTextContent(/npub/);
    expect(markCompromised).not.toHaveBeenCalled();
  });

  it("zeroes again with an empty PUT, and unmarks after confirming", async () => {
    listCompromised.mockResolvedValue([ROW]);
    markCompromised.mockResolvedValue(ROW);
    unmarkCompromised.mockResolvedValue();
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId(`compromised-row-${PK}`);

    fireEvent.click(screen.getByTestId("button-rezero"));
    await waitFor(() => expect(markCompromised).toHaveBeenCalledWith(PK, {}));

    fireEvent.click(screen.getByTestId("button-unmark"));
    fireEvent.click(await screen.findByTestId("button-confirm-unmark"));
    await waitFor(() => expect(unmarkCompromised).toHaveBeenCalledWith(PK));
  });

  it("refuses to re-mark a listed account unless told to replace its proof", async () => {
    listCompromised.mockResolvedValue([ROW]);
    markCompromised.mockResolvedValue(ROW);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId(`compromised-row-${PK}`);

    fireEvent.change(screen.getByTestId("input-compromised-account"), { target: { value: nip19.npubEncode(PK) } });
    fireEvent.change(screen.getByTestId("input-compromised-proof-id"), { target: { value: NEVENT } });
    fireEvent.click(screen.getByTestId("button-mark-compromised"));

    expect(await screen.findByTestId("error-mark-compromised")).toHaveTextContent(/already marked/);
    expect(markCompromised).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("checkbox-replace-proof"));
    fireEvent.click(screen.getByTestId("button-mark-compromised"));
    await waitFor(() => expect(markCompromised).toHaveBeenCalledWith(PK, { proof_event_id: NEVENT }));
  });

  it("edits the successor through PATCH, zeroing nothing", async () => {
    listCompromised.mockResolvedValue([ROW]);
    updateCompromisedMetadata.mockResolvedValue(ROW);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId(`compromised-row-${PK}`);

    fireEvent.click(screen.getByTestId("button-edit-compromised"));
    const next = "b".repeat(64);
    fireEvent.change(await screen.findByTestId("input-edit-successor"), {
      target: { value: nip19.npubEncode(next) },
    });
    fireEvent.click(screen.getByTestId("button-save-compromised"));

    await waitFor(() =>
      expect(updateCompromisedMetadata).toHaveBeenCalledWith(PK, { successor_pubkey: next, reason: "leak" }),
    );
    expect(markCompromised).not.toHaveBeenCalled();
  });
});
