// @vitest-environment jsdom
/**
 * The consent switch for signing in to relays that ask (NIP-42). Off until
 * the reader turns it on — a relay login is a signing prompt per relay in
 * nos2x or Amber until "always allow" is ticked — and kept per account on
 * this device.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { relayAuthAllowed } from "@/lib/relayAuthPref";

const PK = "a".repeat(64);
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: PK, npub: "npub1x", name: "Ben" }) }));

import { RelayAuthCard } from "./RelayAuthCard";

beforeEach(() => localStorage.clear());

describe("RelayAuthCard", () => {
  it("is off until the reader turns it on, and remembers the choice for this account", () => {
    render(<RelayAuthCard />);
    const toggle = screen.getByRole("switch", { name: /sign in to relays that ask/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(relayAuthAllowed(PK)).toBe(false);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(relayAuthAllowed(PK)).toBe(true);

    fireEvent.click(toggle);
    expect(relayAuthAllowed(PK)).toBe(false);
  });

  it("says what turning it on costs", () => {
    render(<RelayAuthCard />);
    expect(screen.getByTestId("card-relay-auth")).toHaveTextContent(/prompt/i);
  });
});
