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

  it("calls a PUT the gateway timed out on sent, not failed, and keeps watching the list", async () => {
    const { AdminRequestError } = await import("@/services/api/compromised");
    listCompromised.mockResolvedValue([]);
    markCompromised.mockRejectedValue(new AdminRequestError("Gateway Timeout (504)", 504));
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId("compromised-empty");

    fireEvent.change(screen.getByTestId("input-compromised-account"), { target: { value: nip19.npubEncode(PK) } });
    fireEvent.change(screen.getByTestId("input-compromised-proof-id"), { target: { value: NEVENT } });
    fireEvent.click(screen.getByTestId("button-mark-compromised"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Sent/) })),
    );
    expect(screen.queryByTestId("error-mark-compromised")).toBeNull();
    await waitFor(() => expect(listCompromised.mock.calls.length).toBeGreaterThan(1));
  });

  it("still reports a PUT the server refused", async () => {
    const { AdminRequestError } = await import("@/services/api/compromised");
    listCompromised.mockResolvedValue([]);
    markCompromised.mockRejectedValue(new AdminRequestError("No relay we asked holds event", 422));
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId("compromised-empty");

    fireEvent.change(screen.getByTestId("input-compromised-account"), { target: { value: nip19.npubEncode(PK) } });
    fireEvent.change(screen.getByTestId("input-compromised-proof-id"), { target: { value: NEVENT } });
    fireEvent.click(screen.getByTestId("button-mark-compromised"));

    expect(await screen.findByTestId("error-mark-compromised")).toHaveTextContent(/No relay/);
  });

  it("sends an account that's already marked to its Edit dialog, where the proof is replaced", async () => {
    const bridged = { ...ROW, proof_event: { ...ROW.proof_event, pubkey: "f".repeat(64) } };
    listCompromised.mockResolvedValue([bridged]);
    markCompromised.mockResolvedValue(ROW);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId(`compromised-row-${PK}`);
    // A proof the account didn't sign (a bridge's copy) is called out on the row.
    expect(screen.getByTestId("proof-other-signer")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("input-compromised-account"), { target: { value: nip19.npubEncode(PK) } });
    expect(screen.getByTestId("compromised-already-marked")).toBeInTheDocument();
    expect(screen.getByTestId("button-mark-compromised")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Edit it, proof included/ }));
    fireEvent.click(await screen.findByTestId("button-replace-proof"));
    fireEvent.change(screen.getByTestId("input-edit-proof-id"), { target: { value: NEVENT } });
    fireEvent.click(screen.getByTestId("button-save-compromised"));

    await waitFor(() =>
      expect(markCompromised).toHaveBeenCalledWith(PK, {
        proof_event_id: NEVENT,
        successor_pubkey: null,
        successor_event_id: null,
        reason: "leak",
      }),
    );
    expect(updateCompromisedMetadata).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Proof replaced" }));
  });

  it("checks a replacement proof before sending it", async () => {
    listCompromised.mockResolvedValue([ROW]);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId(`compromised-row-${PK}`);
    expect(screen.queryByTestId("proof-other-signer")).toBeNull();

    fireEvent.click(screen.getByTestId("button-edit-compromised"));
    fireEvent.click(await screen.findByTestId("button-replace-proof"));
    fireEvent.change(screen.getByTestId("input-edit-proof-id"), { target: { value: "nope" } });
    fireEvent.click(screen.getByTestId("button-save-compromised"));

    expect(await screen.findByText(/The proof must be/)).toBeInTheDocument();
    expect(markCompromised).not.toHaveBeenCalled();
    expect(updateCompromisedMetadata).not.toHaveBeenCalled();
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
      expect(updateCompromisedMetadata).toHaveBeenCalledWith(PK, {
        successor_pubkey: next,
        successor_event_id: null,
        reason: "leak",
      }),
    );
    expect(markCompromised).not.toHaveBeenCalled();
  });

  it("shows and edits their post and the time it was taken, sending the time only when it changes", async () => {
    const post = "e".repeat(64);
    const row = {
      ...ROW,
      successor_pubkey: "b".repeat(64),
      successor_event_id: post,
      compromised_since: "2026-11-16T00:00:00",
    };
    listCompromised.mockResolvedValue([row]);
    updateCompromisedMetadata.mockResolvedValue(row);
    renderWithProviders(<CompromisedCard active />);
    await screen.findByTestId(`compromised-row-${PK}`);
    expect(screen.getByTestId("link-successor-post").getAttribute("href")).toBe(`/e/${nip19.noteEncode(post)}`);
    expect(screen.getByTestId("compromised-since").textContent).not.toMatch(/not set/);

    fireEvent.click(screen.getByTestId("button-edit-compromised"));
    expect(((await screen.findByTestId("input-edit-successor-post")) as HTMLInputElement).value).toBe(
      nip19.noteEncode(post),
    );
    fireEvent.click(screen.getByTestId("button-save-compromised"));
    await waitFor(() => expect(updateCompromisedMetadata).toHaveBeenCalledTimes(1));
    expect(updateCompromisedMetadata.mock.calls[0][1]).not.toHaveProperty("compromised_since");

    fireEvent.click(screen.getByTestId("button-edit-compromised"));
    fireEvent.change(await screen.findByTestId("input-edit-since"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("button-save-compromised"));
    await waitFor(() => expect(updateCompromisedMetadata).toHaveBeenCalledTimes(2));
    expect(updateCompromisedMetadata.mock.calls[1][1]).toMatchObject({ compromised_since: null });
  });
});
