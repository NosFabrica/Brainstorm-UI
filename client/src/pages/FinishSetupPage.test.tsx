import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

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
/** The app-wide score run: under way unless a test says otherwise. */
const scoring = vi.hoisted(() => ({ value: { status: "calculating", isCalculating: true } }));
vi.mock("@/hooks/useScoringStatus", () => ({
  useScoringStatus: () => scoring.value,
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
// Profiles by pubkey: the user's own, and their Assistant's.
const TA = "b".repeat(64);
const profiles = vi.hoisted(() => ({
  byPubkey: {} as Record<string, Record<string, string> | undefined>,
  /** Still being asked for: nothing held yet. */
  loading: false,
}));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: (pk: string | undefined) => ({
    profile: pk && !profiles.loading ? profiles.byPubkey[pk] : undefined,
    loading: profiles.loading,
  }),
}));
vi.mock("@/hooks/useBrainstormAssistant", () => ({
  useBrainstormAssistant: () => ({ taPubkey: TA, published: null }),
}));
vi.mock("@/components/ProfileEditSheet", () => ({
  ProfileEditSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="profile-editor" /> : null),
}));
// Editing in place: an image goes to the uploader, and one field to the profile.
const quick = vi.hoisted(() => ({ upload: vi.fn(), update: vi.fn() }));
vi.mock("@/components/ImageUpload", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  uploadProfileImage: (...a: unknown[]) => quick.upload(...a),
}));
vi.mock("@/services/profileQuickEdit", () => ({ updateProfileField: (...a: unknown[]) => quick.update(...a) }));

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

  const FULL = {
    name: "Lira",
    picture: "https://img.example/lira.png",
    banner: "https://img.example/banner.png",
    about: "Builds trust tools.",
    nip05: "lira@example.com",
  };
  const ASSISTANT = {
    name: "Lira's Brainstorm Assistant",
    picture: "https://img.example/ta.png",
    nip05: "lira@brainstorm.world",
  };
  beforeEach(() => {
    profiles.byPubkey = { [PUBKEY]: FULL, [TA]: ASSISTANT };
    profiles.loading = false;
    scoring.value = { status: "calculating", isCalculating: true };
  });

  // A run that failed has no scores to show: the tile never says "Ready" for
  // it, and points at the dashboard, where a run can be started again.
  it("a score run that failed reads 'Not ready yet', with the dashboard to try again", () => {
    scoring.value = { status: "failed", isCalculating: false };
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);

    const tile = screen.getByTestId("tile-scores");
    expect(tile).toHaveTextContent("Not ready yet");
    expect(tile).not.toHaveTextContent("Ready");
    fireEvent.click(within(tile).getByRole("button", { name: "Open dashboard" }));
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("a finished score run reads 'Ready'", () => {
    scoring.value = { status: "ready", isCalculating: false };
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);

    const tile = screen.getByTestId("tile-scores");
    expect(tile).toHaveTextContent("Ready");
    expect(within(tile).getByRole("button", { name: "View insights" })).toBeInTheDocument();
  });

  // Once nothing is left: who they are, what their account is for, their
  // Assistant as the identity it is — no DONE badges, progress or protocol rows.
  it("once everything's done it's 'Your account': who they are, their network, scores and Assistant", () => {
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);

    expect(screen.queryByText(/^Done$/i)).toBeNull();
    expect(screen.queryByTestId("text-finish-setup-progress")).toBeNull();
    expect(screen.queryByText(/Duty Menu|Treasure Map/)).toBeNull();

    const identity = screen.getByTestId("account-identity");
    expect(identity).toHaveTextContent("Lira");
    expect(identity).toHaveTextContent("Builds trust tools.");
    expect(identity).toHaveTextContent("Account ready");
    fireEvent.click(within(identity).getByRole("button", { name: "Edit profile" }));
    expect(screen.getByTestId("profile-editor")).toBeInTheDocument();

    expect(screen.getByTestId("tile-network")).toHaveTextContent("6");
    expect(screen.getByTestId("tile-network")).toHaveTextContent("People you follow");
    // Their existing follows are managed on /network; /welcome only adds people.
    fireEvent.click(within(screen.getByTestId("tile-network")).getByRole("button", { name: "Manage" }));
    expect(navigate).toHaveBeenCalledWith("/network");
    fireEvent.click(within(screen.getByTestId("tile-network")).getByRole("button", { name: "Find people" }));
    expect(navigate).toHaveBeenCalledWith("/welcome?next=/setup");
    expect(screen.getByTestId("tile-scores")).toHaveTextContent("Calculating");
    expect(screen.getByTestId("tile-sharing")).toHaveTextContent("On");

    const assistant = screen.getByTestId("account-assistant");
    expect(assistant).toHaveTextContent("Lira's Brainstorm Assistant");
    expect(assistant).toHaveTextContent("lira@brainstorm.world");
    expect(assistant).toHaveTextContent("Live");
    fireEvent.click(within(assistant).getByRole("button", { name: "Manage" }));
    expect(navigate).toHaveBeenCalledWith("/settings?tab=assistants");

    fireEvent.click(screen.getByTestId("setup-advanced"));
    expect(navigate).toHaveBeenLastCalledWith("/settings?tab=assistants");
  });

  // Optional, never a step: a gentle line while their profile lacks a photo,
  // banner or bio, one button per missing piece, gone once all three are in.
  it("invites them to finish their profile, only for what's missing", () => {
    profiles.byPubkey = { [PUBKEY]: { name: "Lira" }, [TA]: ASSISTANT };
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);
    const nudge = screen.getByTestId("profile-nudge");
    for (const label of ["Add photo", "Add banner", "Add bio"]) {
      expect(within(nudge).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  /**
   * Each missing piece is added where it shows — a photo or banner straight
   * from their files, a bio in a box in the card — not through the whole form.
   */
  describe("editing in place", () => {
    beforeEach(() => {
      profiles.byPubkey = { [PUBKEY]: { name: "Lira" }, [TA]: ASSISTANT };
      setupState.mockReturnValue(state(everythingDone));
      quick.upload.mockResolvedValue("https://img.example/new.png");
      quick.update.mockResolvedValue({ success: true });
    });
    const file = () => new File(["x"], "me.png", { type: "image/png" });

    it.each([
      ["Add photo", "input-add-photo", "square", "picture"],
      ["Add banner", "input-add-banner", "banner", "banner"],
    ] as const)("%s uploads the picked image and saves it to their profile", async (label, input, aspect, field) => {
      renderWithProviders(<FinishSetupPage />);
      fireEvent.click(within(screen.getByTestId("profile-nudge")).getByRole("button", { name: label }));
      fireEvent.change(screen.getByTestId(input), { target: { files: [file()] } });
      await waitFor(() => expect(quick.update).toHaveBeenCalledWith(PUBKEY, field, "https://img.example/new.png"));
      expect(quick.upload).toHaveBeenCalledWith(expect.any(File), aspect);
      expect(screen.queryByTestId("profile-editor")).toBeNull();
    });

    it("Add bio becomes a box in the card, and Save publishes it", async () => {
      renderWithProviders(<FinishSetupPage />);
      fireEvent.click(within(screen.getByTestId("profile-nudge")).getByRole("button", { name: "Add bio" }));
      fireEvent.change(screen.getByTestId("input-bio"), { target: { value: "Builds trust tools." } });
      fireEvent.click(screen.getByRole("button", { name: "Save bio" }));
      await waitFor(() => expect(quick.update).toHaveBeenCalledWith(PUBKEY, "about", "Builds trust tools."));
    });

    it("says so when a change couldn't be saved", async () => {
      quick.update.mockResolvedValue({ success: false, error: "relays down" });
      renderWithProviders(<FinishSetupPage />);
      fireEvent.click(within(screen.getByTestId("profile-nudge")).getByRole("button", { name: "Add bio" }));
      fireEvent.change(screen.getByTestId("input-bio"), { target: { value: "Hi" } });
      fireEvent.click(screen.getByRole("button", { name: "Save bio" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
    });

    it("Edit profile opens the whole form beside the page", () => {
      renderWithProviders(<FinishSetupPage />);
      fireEvent.click(within(screen.getByTestId("account-identity")).getByRole("button", { name: "Edit profile" }));
      expect(screen.getByTestId("profile-editor")).toBeInTheDocument();
    });
  });

  // Their profile hasn't arrived yet: nothing is known to be missing, so
  // nothing is offered — the line never flashes over a complete profile.
  it("offers nothing while their profile is still loading", () => {
    profiles.loading = true;
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);
    expect(screen.queryByTestId("profile-nudge")).toBeNull();
  });

  it("says nothing about the profile once it's complete", () => {
    setupState.mockReturnValue(state(everythingDone));
    renderWithProviders(<FinishSetupPage />);
    expect(screen.queryByTestId("profile-nudge")).toBeNull();
  });

  it("names who has their scores when another Assistant does, with the switch as its action", () => {
    rankProvider.value = { name: "Primal", host: "primal.net" };
    setupState.mockReturnValue(state({ ...everythingDone, scoresElsewhere: true }));
    renderWithProviders(<FinishSetupPage />);
    const sharing = screen.getByTestId("tile-sharing");
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
