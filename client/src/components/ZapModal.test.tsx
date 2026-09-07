/**
 * The zap dialog names its recipient by the lightning address it verified
 * from their signed profile. Benjamin, over Joe Martin's address in that
 * row (2026-09-05): "there should be a copy icon next to this so users
 * could easily copy the address if needed" — some people arrive here
 * wanting the address, not an invoice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => null }));
vi.mock("@/services/nostr", () => ({
  getVerifiedProfileLud16: async () => ({ verified: true, lud16: "joemartinmusic@getalby.com" }),
  signEventWithEphemeralKey: async () => ({}),
}));
vi.mock("@/lib/zap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/zap")>();
  return {
    ...actual,
    lnurlpFromAddress: async () => ({ callback: "https://getalby.com/lnurlp/joe/callback", minSendable: 1000, maxSendable: 100_000_000, allowsNostr: true, nostrPubkey: "a".repeat(64), commentAllowed: 200 }),
  };
});

import { ZapModal } from "@/components/ZapModal";

describe("ZapModal — the recipient row", () => {
  beforeEach(() => {
    copyMock.mockReset();
    copyMock.mockResolvedValue(true);
  });

  it("the verified address can be copied with one tap, and says so", async () => {
    render(<ZapModal open onOpenChange={() => {}} recipientPubkey={"b".repeat(64)} lud16="joemartinmusic@getalby.com" displayName="Joe Martin" />);
    // The row waits for the address to be verified against the signed profile.
    const copy = await screen.findByTestId("zap-copy-recipient");
    expect(copy).toHaveAttribute("aria-label", "Copy lightning address");
    fireEvent.click(copy);
    expect(copyMock).toHaveBeenCalledWith("joemartinmusic@getalby.com");
    await waitFor(() => expect(screen.getByTestId("zap-copy-recipient")).toHaveAttribute("title", "Copied"));
  });
});
