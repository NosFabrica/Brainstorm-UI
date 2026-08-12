import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { SignerUnreachableCard } from "./SignerUnreachableCard";

const recheckSigner = vi.fn();

vi.mock("@/accounts/signer-liveness", () => ({
  recheckSigner: () => recheckSigner(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a signer that has stopped answering", () => {
  // NIP-46 has no revocation signal, so nothing else on the screen will ever
  // mention this — the account looks healthy until a publish fails.
  it("says so, rather than waiting for the next publish to fail", () => {
    renderWithProviders(<SignerUnreachableCard />);

    expect(screen.getByTestId("card-signer-unreachable")).toBeInTheDocument();
  });

  it("offers to ask again, since the usual cause is a signer that was asleep", () => {
    renderWithProviders(<SignerUnreachableCard />);
    fireEvent.click(screen.getByTestId("button-recheck-signer"));

    expect(recheckSigner).toHaveBeenCalled();
  });

  // A ping can take the full request timeout, so a button that looks untouched
  // invites clicking it again, and every click re-fires the probe.
  it("shows the ask is in flight, rather than looking dead", () => {
    renderWithProviders(<SignerUnreachableCard />);
    fireEvent.click(screen.getByTestId("button-recheck-signer"));

    expect(screen.getByTestId("button-recheck-signer")).toBeDisabled();
  });

  // Amber's "Reset Bunker" and "Delete application" both leave our stored remote
  // pubkey listening on nobody. Re-pairing is the only way back, so the card has
  // to lead somewhere and not just report.
  //
  // `?add=1` matters: LoginPage bounces an already-signed-in visitor straight
  // back, and this user *is* signed in — plain /login would be a no-op returning
  // them to this very card.
  it("reaches the picker rather than bouncing off a login page it can't use", () => {
    renderWithProviders(<SignerUnreachableCard />);

    expect(screen.getByTestId("link-repair-signer")).toHaveAttribute(
      "href",
      expect.stringContaining("add=1"),
    );
  });
});
