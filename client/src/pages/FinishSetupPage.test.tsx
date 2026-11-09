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
// Who holds the rank duty today, by name — null when nobody or not yet known.
const rankProvider = vi.hoisted(() => ({ value: null as null | { name: string; host: string } }));
vi.mock("@/hooks/useRankProvider", () => ({ useRankProvider: () => rankProvider.value }));

const setupState = vi.fn<() => FinishSetupState>();
vi.mock("@/hooks/useFinishSetup", () => ({
  useFinishSetup: () => setupState(),
}));

function state(overrides: Partial<FinishSetupState>): FinishSetupState {
  return {
    signedIn: true,
    accountDone: true,
    accountPending: false,
    accountAuto: false,
    followDone: false,
    followPending: true,
    followCount: 0,
    activateDone: false,
    activatePending: true,
    scoresElsewhere: false,
    signalsPending: false,
    missingSignals: [],
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

  it("says the step that's theirs is theirs to sign", () => {
    setupState.mockReturnValue(state({ followDone: true, followPending: false, remaining: 1, doneCount: 2 }));
    renderWithProviders(<FinishSetupPage />);
    expect(screen.getByTestId("setup-row-activate")).toHaveTextContent("You sign it — one signature.");
  });

  it("shows both pending steps and routes each to its surface", () => {
    setupState.mockReturnValue(state({}));
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-title")).toHaveTextContent("Finish setting up your account.");

    fireEvent.click(screen.getByTestId("setup-row-follow"));
    expect(navigate).toHaveBeenCalledWith("/welcome?next=/setup");

    fireEvent.click(screen.getByTestId("setup-row-activate"));
    expect(navigate).toHaveBeenCalledWith("/setup/activate");

    expect(screen.queryByTestId("card-account-status")).not.toBeInTheDocument();
    // Messages not running: no "Optional" heading over nothing.
    expect(screen.queryByTestId("setup-optional")).not.toBeInTheDocument();
  });

  // Messages is offered apart from the steps, under its own heading.
  it.each([
    ["off", "no-inbox", "setup-row-messages"],
    ["on", "ready", "setup-row-messages-done"],
  ] as const)("sets messages (%s) apart from the steps", (messages, status, row) => {
    dm.engine = {};
    dm.state = { status, inboxRelays: ["wss://inbox.example"] };
    setupState.mockReturnValue(state({ followDone: true, followPending: false, remaining: 1, doneCount: 2, messages }));
    renderWithProviders(<FinishSetupPage />);

    const optional = screen.getByTestId("setup-optional");
    expect(optional).toHaveTextContent("Optional");
    expect(within(optional).getByTestId(row)).toHaveTextContent("Turn on private messages");
  });

  /**
   * Issue #313: a Map that gives their Assistant rank but not every signal is
   * the Activate step again — worded as the update it is, naming what the
   * re-sign adds, on the same page that signs it.
   */
  it("asks for the Treasure Map again when it is short of signals, naming them", () => {
    setupState.mockReturnValue(
      state({
        followDone: true,
        followPending: false,
        followCount: 12,
        activateDone: false,
        activatePending: false,
        signalsPending: true,
        missingSignals: ["30382:reporters", "30382:muters", "30382:hops"],
        remaining: 1,
        doneCount: 2,
      }),
    );
    renderWithProviders(<FinishSetupPage />);

    const row = screen.getByTestId("setup-row-activate");
    expect(row).toHaveTextContent("Update your Treasure Map");
    expect(row).toHaveTextContent("Reporters, Muters and Hops");
    fireEvent.click(row);
    expect(navigate).toHaveBeenCalledWith("/setup/activate");
  });

  it("offers the lists update on their account once activated: an update, not a step", () => {
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

    expect(screen.getByTestId("card-account-status")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-row-activate")).toBeNull();
    expect(screen.getByTestId("line-lists-update")).toBeInTheDocument();
  });

  // Another Assistant has the rank duty and something's still left: handing
  // the duty to Brainstorm waits under Optional, named.
  it("offers the switch as optional while another Assistant has their scores", () => {
    rankProvider.value = { name: "Pip's Brainstorm Assistant", host: "scores.brainstorm.world" };
    setupState.mockReturnValue(
      state({ activateDone: true, activatePending: false, scoresElsewhere: true, remaining: 1, doneCount: 2 }),
    );
    renderWithProviders(<FinishSetupPage />);

    const switchRow = within(screen.getByTestId("setup-optional")).getByTestId("setup-row-scores-switch");
    expect(switchRow).toHaveTextContent("Your scores come from Pip's Brainstorm Assistant today.");
    fireEvent.click(screen.getByTestId("setup-scores-switch"));
    expect(navigate).toHaveBeenCalledWith("/setup/activate");
    rankProvider.value = null;
  });

  it("an Assistant whose profile the app couldn't publish is finished on its own page", () => {
    setupState.mockReturnValue(
      state({ accountDone: false, accountPending: true, followDone: true, followPending: false, remaining: 1 }),
    );
    renderWithProviders(<FinishSetupPage />);
    fireEvent.click(within(screen.getByTestId("setup-assistant-retry")).getByRole("button", { name: "Finish it" }));
    expect(navigate).toHaveBeenCalledWith("/settings?tab=assistants");
  });
});

describe("FinishSetupPage — what's left, then your account", () => {
  beforeEach(() => vi.clearAllMocks());
  const everythingDone = {
    accountDone: true,
    followDone: true,
    followPending: false,
    followCount: 6,
    activateDone: true,
    activatePending: false,
    dutyMenu: "current" as const,
    treasureMap: "current" as const,
    remaining: 0,
    doneCount: 5,
    totalSteps: 5,
    allDone: true,
  };

  it("once everything's done it's 'Your account': status lines, no DONE badges, no progress, no protocol rows", () => {
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-title")).toHaveTextContent("Your account.");
    expect(screen.queryByText(/^Done$/i)).toBeNull();
    expect(screen.queryByTestId("text-finish-setup-progress")).toBeNull();
    expect(screen.queryByText(/Duty Menu|Treasure Map/)).toBeNull();

    expect(screen.getByTestId("status-account")).toHaveTextContent("Signed in as Lira");
    expect(screen.getByTestId("status-network")).toHaveTextContent("6 people");
    expect(screen.getByTestId("status-sharing")).toHaveTextContent("On");
    expect(screen.getByTestId("status-assistant")).toHaveTextContent("Live");

    fireEvent.click(within(screen.getByTestId("status-network")).getByRole("button", { name: "Edit" }));
    expect(navigate).toHaveBeenCalledWith("/welcome?next=/setup");
    fireEvent.click(within(screen.getByTestId("status-assistant")).getByRole("button", { name: "Manage" }));
    expect(navigate).toHaveBeenCalledWith("/settings?tab=assistants");
    fireEvent.click(screen.getByTestId("setup-advanced"));
    expect(navigate).toHaveBeenCalledTimes(3);
  });

  it("names who has their scores when another Assistant does, with the switch as its action", () => {
    rankProvider.value = { name: "Primal", host: "primal.net" };
    setupState.mockReturnValue(state({ ...everythingDone, scoresElsewhere: true }));
    renderWithProviders(<FinishSetupPage />);
    const sharing = screen.getByTestId("status-sharing");
    expect(sharing).toHaveTextContent("From Primal");
    fireEvent.click(within(sharing).getByRole("button", { name: "Switch" }));
    expect(navigate).toHaveBeenCalledWith("/setup/activate");
    rankProvider.value = null;
  });

  it("while something's left, shows only what's left, with how many are done", () => {
    setupState.mockReturnValue(
      state({
        ...everythingDone,
        followDone: false,
        followPending: true,
        followCount: 0,
        remaining: 1,
        doneCount: 4,
        allDone: false,
      }),
    );
    renderWithProviders(<FinishSetupPage />);

    expect(screen.getByTestId("text-finish-setup-title")).toHaveTextContent("Finish setting up your account.");
    expect(screen.getByTestId("setup-row-follow")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-row-account")).toBeNull();
    expect(screen.queryByTestId("setup-row-activate-done")).toBeNull();
    const summary = screen.getByTestId("setup-done-summary");
    // What they can see is done: the account, activation, and their Assistant.
    expect(summary).toHaveTextContent("3 done");
    expect(screen.queryByText("Activate your Brainstorm account")).toBeNull();
    fireEvent.click(summary);
    expect(screen.getByText("Activate your Brainstorm account")).toBeInTheDocument();
  });

  it("an Assistant step the app couldn't finish is one line to finish it, not its protocol row", () => {
    setupState.mockReturnValue(
      state({
        ...everythingDone,
        dutyMenu: "missing",
        dutyMenuPending: true,
        remaining: 1,
        doneCount: 4,
        allDone: false,
      }),
    );
    renderWithProviders(<FinishSetupPage />);
    expect(screen.queryByText(/Duty Menu/)).toBeNull();
    const retry = screen.getByTestId("setup-assistant-retry");
    expect(retry).toHaveTextContent("We couldn't finish setting up your Assistant");
    fireEvent.click(within(retry).getByRole("button", { name: "Finish it" }));
    expect(navigate).toHaveBeenCalledWith("/setup/duty-menu");
  });

  it("says nothing while the app is still doing it", () => {
    setupState.mockReturnValue(
      state({ ...everythingDone, treasureMap: "missing", treasureMapAuto: true, doneCount: 4, allDone: false }),
    );
    renderWithProviders(<FinishSetupPage />);
    expect(screen.queryByTestId("setup-assistant-retry")).toBeNull();
    expect(screen.queryByText(/Treasure Map/)).toBeNull();
  });
});
