import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import FinishSetupPage from "./FinishSetupPage";
import type { FinishSetupState } from "@/hooks/useFinishSetup";

const PUBKEY = "a".repeat(64);

const navigate = vi.fn();

vi.mock("wouter", () => ({ useLocation: () => ["/setup", navigate] }));
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
    allDone: false,
    ...overrides,
  };
}

describe("FinishSetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows both pending steps and routes each to its surface", () => {
    setupState.mockReturnValue(state({}));
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-progress")).toHaveTextContent("1 of 3 complete");
    expect(screen.getByTestId("setup-row-account")).toHaveTextContent("You're signed in as Lira.");

    fireEvent.click(screen.getByTestId("setup-row-follow"));
    expect(navigate).toHaveBeenCalledWith("/welcome?next=/setup");

    fireEvent.click(screen.getByTestId("setup-row-activate"));
    expect(navigate).toHaveBeenCalledWith("/setup/activate");

    expect(screen.queryByTestId("card-setup-all-done")).not.toBeInTheDocument();
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

    expect(screen.getByTestId("text-finish-setup-progress")).toHaveTextContent("3 of 3 complete");
    expect(screen.getByTestId("card-setup-all-done")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-setup-done"));
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });
});
