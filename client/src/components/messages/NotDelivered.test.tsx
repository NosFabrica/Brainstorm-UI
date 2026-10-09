// @vitest-environment jsdom
/** A message no relay took says why when it can: a login wanted, or no relay reachable. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Delivery } from "@/lib/dm/store";

vi.mock("@/hooks/useRelayAuthProblems", () => ({ useRelayAuthProblems: () => new Map() }));
vi.mock("@/services/relayAuth", () => ({ askRelayAuthAgain: () => {}, relayAuthProblemFor: () => undefined }));

const { NotDelivered } = await import("./MessageBubble");

const show = (deliveries: Delivery[]) =>
  render(<NotDelivered deliveries={deliveries} onResend={() => {}} discard={<span>Discard</span>} />);

describe("NotDelivered", () => {
  it("says their relay couldn't be reached when none was", () => {
    show([
      { recipient: "a", relay: "wss://a.example/", ok: false, unreachable: true },
      { recipient: "me", relay: "wss://mine.example/", ok: false, unreachable: true },
    ]);
    expect(screen.getByText(/couldn't reach their relay/)).toBeTruthy();
  });

  it("stays plain when a relay refused it", () => {
    show([
      { recipient: "a", relay: "wss://a.example/", ok: false, unreachable: true },
      { recipient: "a", relay: "wss://b.example/", ok: false, message: "blocked" },
    ]);
    expect(screen.queryByText(/couldn't reach/)).toBeNull();
    expect(screen.getByText(/Not delivered/)).toBeTruthy();
  });
});
