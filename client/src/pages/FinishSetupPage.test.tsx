import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import FinishSetupPage from "./FinishSetupPage";
import type { FinishSetupState } from "@/hooks/useFinishSetup";

const PUBKEY = "a".repeat(64);

const navigate = vi.fn();

vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLocation: () => ["/setup", navigate],
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/hooks/useScoringStatus", () => ({
  useScoringStatus: () => ({ isCalculating: true }),
}));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
// The header drags in the account menu / apps launcher stack; the checklist is
// what's under test.
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/ListsUpdate", () => ({ ListsUpdateLine: () => <div data-testid="line-lists-update" /> }));
// No messages engine unless a test sets one: the optional row then renders nothing.
const dm = vi.hoisted(() => ({
  engine: null as object | null,
  state: { status: "stopped", inboxRelays: [] as string[] },
}));
vi.mock("@/hooks/useDirectMessages", () => ({ useDmEngine: () => dm.engine, useDmState: () => dm.state }));

const setupState = vi.fn<() => FinishSetupState>();
vi.mock("@/hooks/useFinishSetup", () => ({
  useFinishSetup: () => setupState(),
}));

function state(overrides: Partial<FinishSetupState>): FinishSetupState {
  return {
    signedIn: true,
    followDone: false,
    followPending: true,
    followCount: 0,
    activateDone: false,
    activatePending: true,
    remaining: 2,
    doneCount: 1,
    totalSteps: 3,
    allDone: false,
    optionalRemaining: 0,
    ...overrides,
  };
}

describe("FinishSetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dm.engine = null;
    dm.state = { status: "stopped", inboxRelays: [] };
  });

  it("shows both pending steps and routes each to its surface", () => {
    setupState.mockReturnValue(state({}));
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-title")).toHaveTextContent("Finish setting up your account.");
    expect(screen.getByTestId("text-finish-setup-progress")).toHaveTextContent("1 of 3 complete");
    expect(screen.getByTestId("setup-row-account")).toHaveTextContent("You're signed in as Lira.");

    fireEvent.click(screen.getByTestId("setup-row-follow"));
    expect(navigate).toHaveBeenCalledWith("/welcome?next=/setup");

    fireEvent.click(screen.getByTestId("setup-row-activate"));
    expect(navigate).toHaveBeenCalledWith("/setup/activate");

    expect(screen.queryByTestId("card-setup-all-done")).not.toBeInTheDocument();
    // Messages not running: no "Optional" heading over nothing.
    expect(screen.queryByTestId("setup-optional")).not.toBeInTheDocument();
  });

  // Messages is offered, but outside the count — under its own heading, below the
  // steps, so "2 of 3" never sits over four rows that look alike.
  it.each([
    ["off", "no-inbox", "setup-row-messages"],
    ["on", "ready", "setup-row-messages-done"],
  ])("sets messages (%s) apart from the counted steps", (_, status, row) => {
    dm.engine = {};
    dm.state = { status, inboxRelays: ["wss://inbox.example"] };
    setupState.mockReturnValue(state({ followDone: true, followPending: false, remaining: 1, doneCount: 2 }));
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-progress")).toHaveTextContent("2 of 3 complete");
    const optional = screen.getByTestId("setup-optional");
    expect(optional).toHaveTextContent("Optional");
    expect(within(optional).getByTestId(row)).toHaveTextContent("Turn on private messages");
  });

  it("renders done rows with follow count once steps complete", () => {
    setupState.mockReturnValue(
      state({ followDone: true, followPending: false, followCount: 5, remaining: 1, doneCount: 2 }),
    );
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-progress")).toHaveTextContent("2 of 3 complete");
    expect(screen.getByTestId("setup-row-follow-done")).toHaveTextContent("5 accounts followed");
    expect(screen.getByTestId("setup-row-activate")).toBeInTheDocument();
  });

  it("celebrates when everything is done and goes to the dashboard", () => {
    setupState.mockReturnValue(
      state({
        followDone: true,
        followPending: false,
        followCount: 3,
        activateDone: true,
        activatePending: false,
        remaining: 0,
        doneCount: 3,
        allDone: true,
      }),
    );
    renderWithProviders(<FinishSetupPage />);

    // Done, this is where the account menu's Account setup row leads — titled
    // for that, not still asking them to finish.
    expect(screen.getByTestId("text-finish-setup-title")).toHaveTextContent("Your account is set up.");
    expect(screen.getByTestId("text-finish-setup-progress")).toHaveTextContent("3 of 3 complete");
    expect(screen.getByTestId("card-setup-all-done")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-setup-done"));
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  // Activated, lists waiting: the step stays done, the update sits under it.
  it("keeps Activate done and offers the lists update beneath it", () => {
    setupState.mockReturnValue(
      state({
        followDone: true,
        followPending: false,
        activateDone: true,
        activatePending: false,
        listsPending: true,
        remaining: 0,
        doneCount: 3,
        allDone: true,
      }),
    );
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("setup-row-activate-done")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-row-activate")).toBeNull();
    expect(screen.getByTestId("line-lists-update")).toBeInTheDocument();
  });
});
