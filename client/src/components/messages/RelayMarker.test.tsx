// @vitest-environment jsdom
/**
 * An inbox relay waiting on a login says who turned it down: the reader's
 * signer ("Rejected - Ask again", a fresh approval) or the relay itself (its
 * reason, and "Try again") — and offers nothing while nobody has.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RelayAuthProblem } from "@/services/relayAuth";
import type { RelayProgress } from "@/lib/dm/pager";

let problems = new Map<string, RelayAuthProblem>();
const askRelayAuthAgain = vi.fn();
vi.mock("@/hooks/useRelayAuthProblems", () => ({ useRelayAuthProblems: () => problems }));
vi.mock("@/services/relayAuth", () => ({
  askRelayAuthAgain: (url?: string) => askRelayAuthAgain(url),
  relayAuthProblemFor: (map: Map<string, RelayAuthProblem>, url: string) => map.get(url),
}));

const { RelayMarker } = await import("./RelayMarker");

const URL = "wss://inbox.example/";
const waiting: RelayProgress = { url: URL, state: "auth", reachedUntil: 0, completeTo: 0, pages: 0 };

beforeEach(() => {
  problems = new Map();
  askRelayAuthAgain.mockClear();
});

describe("RelayMarker waiting on a login", () => {
  it("offers no button while the login is still being asked for", () => {
    render(<RelayMarker progress={waiting} variant="list" />);
    expect(screen.getByTestId("dm-relay-marker")).toHaveTextContent("asks you to sign in");
    expect(screen.queryByTestId("dm-relay-auth-again")).toBeNull();
  });

  it("asks the signer again after the signer said no", () => {
    problems.set(URL, { by: "signer" });
    render(<RelayMarker progress={waiting} variant="list" />);
    expect(screen.getByTestId("dm-relay-marker")).toHaveTextContent("your signer rejected signing in");
    fireEvent.click(screen.getByRole("button", { name: "Rejected - Ask again" }));
    expect(askRelayAuthAgain).toHaveBeenCalledWith(URL);
  });

  it("gives the relay's reason, and another try, after the relay said no", () => {
    problems.set(URL, { by: "relay", message: "restricted: members only" });
    render(<RelayMarker progress={waiting} variant="chat" />);
    expect(screen.getByTestId("dm-relay-marker")).toHaveTextContent("refused your sign-in: restricted: members only");
    expect(screen.queryByRole("button", { name: "Rejected - Ask again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(askRelayAuthAgain).toHaveBeenCalledWith(URL);
  });
});
