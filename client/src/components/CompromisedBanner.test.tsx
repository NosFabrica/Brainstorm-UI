// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import type { CompromisedStatus } from "@/services/api";

const getCompromisedStatus = vi.fn<(pubkey: string) => Promise<CompromisedStatus | null>>();
vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiClient: { ...actual.apiClient, getCompromisedStatus: (pk: string) => getCompromisedStatus(pk) },
  };
});

import { CompromisedBanner } from "./CompromisedBanner";

const PK = "3f770d65d3a764a9c5cb503ae123e62ec7598ad035d836e2a810f3877a745b24";
const NEXT = "b".repeat(64);
const PROOF_ID = "000005cbe61b41c9c027dbd6aa89cd8d41193af3a1fb89dfd03b7d866cdb35be";

function marked(patch: Partial<CompromisedStatus> = {}): CompromisedStatus {
  return {
    pubkey: PK,
    compromised: true,
    since: "2026-11-16T17:00:00",
    proof_event_id: PROOF_ID,
    proof_event: {
      id: PROOF_ID,
      pubkey: PK,
      created_at: 1794847395,
      kind: 1,
      tags: [],
      content: "Apparently Sonarr nightly build was compromised.",
      sig: "s",
    },
    successor_pubkey: null,
    ...patch,
  };
}

describe("CompromisedBanner", () => {
  beforeEach(() => getCompromisedStatus.mockReset());

  it("warns, links the proof, and quotes it from what the server kept", async () => {
    getCompromisedStatus.mockResolvedValue(marked());
    renderWithProviders(<CompromisedBanner pubkey={PK} />);

    const banner = await screen.findByTestId("banner-compromised");
    expect(banner).toHaveTextContent("This account's key is compromised");
    // Polite: it appears after the page has loaded, and mustn't cut off a screen reader.
    expect(banner.getAttribute("role")).toBe("status");
    expect(screen.getByTestId("banner-compromised-proof-link").getAttribute("href")).toBe(
      `/e/${nip19.neventEncode({ id: PROOF_ID, author: PK })}`,
    );
    expect(screen.queryByTestId("banner-compromised-proof")).toBeNull();
    fireEvent.click(screen.getByTestId("banner-compromised-proof-toggle"));
    expect(screen.getByTestId("banner-compromised-proof")).toHaveTextContent("Sonarr nightly build");
    expect(screen.queryByTestId("banner-compromised-successor")).toBeNull();
  });

  it("links the owner's new account once it's known", async () => {
    getCompromisedStatus.mockResolvedValue(marked({ successor_pubkey: NEXT }));
    renderWithProviders(<CompromisedBanner pubkey={PK} />);

    expect((await screen.findByTestId("banner-compromised-successor")).getAttribute("href")).toBe(
      `/p/${nip19.npubEncode(NEXT)}`,
    );
  });

  it("shows nothing for an unmarked account, or when the server can't say", async () => {
    getCompromisedStatus.mockResolvedValue({ ...marked(), compromised: false });
    const { unmount } = renderWithProviders(<CompromisedBanner pubkey={PK} />);
    await vi.waitFor(() => expect(getCompromisedStatus).toHaveBeenCalled());
    expect(screen.queryByTestId("banner-compromised")).toBeNull();
    unmount();

    getCompromisedStatus.mockResolvedValue(null);
    renderWithProviders(<CompromisedBanner pubkey={PK} />);
    await vi.waitFor(() => expect(getCompromisedStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("banner-compromised")).toBeNull();
  });

  it("asks for details only when the overview says the key is marked", async () => {
    getCompromisedStatus.mockResolvedValue(marked());

    const { unmount } = renderWithProviders(<CompromisedBanner pubkey={PK} overviewSays={false} />);
    const pending = renderWithProviders(<CompromisedBanner pubkey={PK} overviewSays={null} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(getCompromisedStatus).not.toHaveBeenCalled();
    expect(screen.queryByTestId("banner-compromised")).toBeNull();
    unmount();
    pending.unmount();

    renderWithProviders(<CompromisedBanner pubkey={PK} overviewSays />);
    expect(await screen.findByTestId("banner-compromised")).toBeInTheDocument();
    expect(getCompromisedStatus).toHaveBeenCalledTimes(1);
  });
});
