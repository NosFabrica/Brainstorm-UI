import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BackupNeed } from "@/accounts/backup";
import type { SetupState } from "@/hooks/useSetupTasks";
import { PostSignupCard } from "./PostSignupCard";

const PUBKEY = "a".repeat(64);
const NPUB = "npub1lira";
const NCRYPTSEC = "ncryptsec1qqqqq";
const PASSWORD = "hunter2hunter2";

const toast = vi.fn();
const setRecoveryPassword = vi.fn(async () => {});
const deliverBackup = vi.fn(() => ({ npub: NPUB, ncryptsec: NCRYPTSEC }) as { npub: string; ncryptsec: string } | null);
const downloadBackupFile = vi.fn();
const backupNeed = vi.fn<() => BackupNeed | null>(() => "download");
/** Everything but the backup done, so the card turns on the one task left. */
const allDone = vi.fn(() => false);
const cardDismissed = vi.fn(() => false);
const dismissPostSignup = vi.fn();
const setupEligible = vi.fn(() => true);
const navigate = vi.fn();
// The activation-nudge branch's inputs, defaulted to "not this cohort".
const followVerification = vi.fn<() => "checking" | "none" | "has-follows">(() => "checking");
const createdInApp = vi.fn(() => false);
const nip85Activated = vi.fn(() => false);
const trustProviderStatus = vi.fn<() => string | undefined>(() => undefined);
const activateNudgeDismissed = vi.fn(() => false);
const dismissActivateNudge = vi.fn();

// Stateful like the real thing: navigating re-renders the tree, which the
// backup-tile tests lean on as their "any re-render" trigger.
vi.mock("wouter", async () => {
  const { useState } = await import("react");
  return {
    useLocation: () => {
      const [loc, setLoc] = useState("/");
      return [
        loc,
        (to: string) => {
          navigate(to);
          setLoc(to);
        },
      ] as const;
    },
  };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/accounts/backup", () => ({
  MIN_RECOVERY_PASSWORD_LENGTH: 8,
  setRecoveryPassword: (...args: unknown[]) => setRecoveryPassword(...(args as [])),
  keyAccessMessage: () => "Please try again.",
}));
vi.mock("@/lib/accountBackup", () => ({
  deliverBackup: () => deliverBackup(),
  downloadBackupFile: (...args: unknown[]) => downloadBackupFile(...(args as [])),
}));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => backupNeed() }));
vi.mock("@/lib/postSignupDismissal", () => ({
  usePostSignupDismissed: () => cardDismissed(),
  dismissPostSignup: (...args: unknown[]) => dismissPostSignup(...(args as [])),
  useActivateNudgeDismissed: () => activateNudgeDismissed(),
  dismissActivateNudge: (...args: unknown[]) => dismissActivateNudge(...(args as [])),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: NPUB, displayName: "Lira" }),
}));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({
  useVerifiedNoFollows: () => followVerification(),
}));
vi.mock("@/accounts/display", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  identityHas: () => createdInApp(),
}));
vi.mock("@/lib/nip85Activation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isNip85Activated: () => nip85Activated(),
}));
vi.mock("@/hooks/useSelf", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSelfHistory: () => ({ isSuccess: true, data: { data: { ta_pubkey: "b".repeat(64) } } }),
}));
vi.mock("@/hooks/useTrustProviderStatus", () => ({
  useTrustProviderStatus: () => ({ data: trustProviderStatus() }),
}));
vi.mock("@/components/ActivateBrainstormModal", () => ({
  ActivateBrainstormModal: ({ open, serviceKey }: { open: boolean; serviceKey: string }) =>
    open ? <div data-testid="stub-activate-modal" data-servicekey={serviceKey} /> : null,
}));
// A brand-new in-app account with everything still to do — the card's own case.
vi.mock("@/hooks/useSetupTasks", () => ({
  useSetupTasks: (): SetupState => ({
    tasks: [],
    remaining: [],
    done: { network: false, backup: backupNeed() === null, photo: false },
    doneCount: 0,
    allDone: allDone(),
    eligible: setupEligible(),
  }),
}));

/** Open the backup tile, which is what the card offers rather than a form of its own. */
function openBackupTile() {
  renderWithProviders(<PostSignupCard />);
  fireEvent.click(screen.getByTestId("tile-backup"));
}

beforeEach(() => {
  vi.clearAllMocks();
  backupNeed.mockReturnValue("download");
  allDone.mockReturnValue(false);
  cardDismissed.mockReturnValue(false);
  deliverBackup.mockReturnValue({ npub: NPUB, ncryptsec: NCRYPTSEC });
  setupEligible.mockReturnValue(true);
  followVerification.mockReturnValue("checking");
  createdInApp.mockReturnValue(false);
  nip85Activated.mockReturnValue(false);
  trustProviderStatus.mockReturnValue(undefined);
  activateNudgeDismissed.mockReturnValue(false);
});

describe("the backup tile, as the chain's second surface", () => {
  it("asks an account that already holds a backup only to take it", () => {
    openBackupTile();

    fireEvent.click(screen.getByTestId("backup-prompt-download"));

    expect(deliverBackup).toHaveBeenCalledTimes(1);
    expect(setRecoveryPassword).not.toHaveBeenCalled();
  });

  it("asks a migrated account for a password, and hands the file over in the same flow", async () => {
    backupNeed.mockReturnValue("recovery-password");
    openBackupTile();

    fireEvent.change(screen.getByTestId("backup-prompt-password"), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByTestId("backup-prompt-confirm"), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByTestId("backup-prompt-set"));

    await waitFor(() => expect(setRecoveryPassword).toHaveBeenCalledWith(PASSWORD));
    await waitFor(() => expect(deliverBackup).toHaveBeenCalledTimes(1));
  });

  // Demoted, not removed: the raw nsec is still reachable from Settings, where
  // someone goes looking for it. A nudge steering people at it is what stops.
  it("never offers the raw key", () => {
    openBackupTile();

    expect(screen.queryByTestId("button-download-raw-key")).toBeNull();
    expect(screen.queryByText(/without a password/i)).toBeNull();
  });

  // The state flips to "nothing left to ask" the moment the file is handed over,
  // and a phone loses downloads — so the offer to take it again stays put.
  it("keeps the delivered pane once there is nothing left to ask", async () => {
    openBackupTile();
    fireEvent.click(screen.getByTestId("backup-prompt-download"));
    backupNeed.mockReturnValue(null);

    await screen.findByTestId("backup-prompt-delivered");

    fireEvent.click(screen.getByTestId("backup-prompt-download-again"));
    expect(downloadBackupFile).toHaveBeenCalledWith({ npub: NPUB, ncryptsec: NCRYPTSEC });
  });

  it("says the backup is done once the account has nothing left to ask", () => {
    backupNeed.mockReturnValue(null);

    renderWithProviders(<PostSignupCard />);

    expect(screen.getByTestId("tile-backup-done")).toBeInTheDocument();
    expect(screen.queryByTestId("tile-backup")).toBeNull();
  });

  // Handing the file over can complete the checklist, and the card is gated on
  // the checklist — so without care the click that finishes setup unmounts the
  // confirmation of the very thing it just did.
  it("stays up when the backup was the last thing left", async () => {
    openBackupTile();
    backupNeed.mockReturnValue(null);
    allDone.mockReturnValue(true);

    fireEvent.click(screen.getByTestId("backup-prompt-download"));

    expect(await screen.findByTestId("backup-prompt-delivered")).toBeInTheDocument();
    expect(screen.getByTestId("card-post-signup")).toBeInTheDocument();
  });

  // Another tab (or Settings) can take the backup while this tile sits open.
  it("closes an open tile that has nothing left to ask, rather than showing an empty one", () => {
    renderWithProviders(<PostSignupCard />);
    fireEvent.click(screen.getByTestId("tile-backup"));
    backupNeed.mockReturnValue(null);

    // Any re-render — here, the dismiss of a sibling tile's hover state stands in.
    fireEvent.click(screen.getByTestId("tile-complete-profile"));

    expect(screen.getByTestId("tile-backup-done")).toBeInTheDocument();
    expect(screen.queryByTestId("tile-backup-form")).toBeNull();
  });
});

describe("putting the card away", () => {
  // The store, not component state: the recurring reminder is this card's sibling
  // and takes over the moment it goes.
  it("records the dismissal where the rest of the chain can see it", () => {
    renderWithProviders(<PostSignupCard />);

    fireEvent.click(screen.getByTestId("button-post-signup-dismiss"));

    expect(dismissPostSignup).toHaveBeenCalledWith(PUBKEY);
  });

  // Read live rather than snapshotted at mount: the account arrives after the
  // first render, and a card that asked before it landed would ignore the answer.
  it("stays away for an account that already dismissed it", () => {
    cardDismissed.mockReturnValue(true);

    renderWithProviders(<PostSignupCard />);

    expect(screen.queryByTestId("card-post-signup")).toBeNull();
  });
});

describe("the activation nudge, for signer accounts that already follow people", () => {
  /** A returning NIP-07 user with a follow list and no kind-10040 anywhere. */
  const signerWithFollows = () => {
    setupEligible.mockReturnValue(false);
    createdInApp.mockReturnValue(false);
    followVerification.mockReturnValue("has-follows");
    trustProviderStatus.mockReturnValue("none");
    nip85Activated.mockReturnValue(false);
  };

  it("shows once the relay check settles on no declaration", () => {
    signerWithFollows();

    renderWithProviders(<PostSignupCard />);

    expect(screen.getByTestId("card-activate-nudge")).toBeInTheDocument();
  });

  // The tile promises "one signature" — it must open the modal right here, not
  // detour through a dashboard that spends its first ~7 minutes calculating.
  it("opens the activation modal in place, with the assistant key", () => {
    signerWithFollows();
    renderWithProviders(<PostSignupCard />);
    expect(screen.queryByTestId("stub-activate-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("tile-activate-brainstorm"));

    expect(screen.getByTestId("stub-activate-modal").getAttribute("data-servicekey")).toBe("b".repeat(64));
    expect(navigate).not.toHaveBeenCalled();
  });

  // Never flash the ask at someone who may already be activated.
  it("shows nothing while the provider check hasn't settled", () => {
    signerWithFollows();
    trustProviderStatus.mockReturnValue(undefined);

    renderWithProviders(<PostSignupCard />);

    expect(screen.queryByTestId("card-activate-nudge")).toBeNull();
  });

  it("stays away once the declaration already names Brainstorm", () => {
    signerWithFollows();
    trustProviderStatus.mockReturnValue("brainstorm");

    renderWithProviders(<PostSignupCard />);

    expect(screen.queryByTestId("card-activate-nudge")).toBeNull();
  });

  // The zero-follow cohort's critical path is the follow picker, not activation.
  it("leaves the follow nudge to its own card when the user follows nobody", () => {
    signerWithFollows();
    followVerification.mockReturnValue("none");

    renderWithProviders(<PostSignupCard />);

    expect(screen.queryByTestId("card-activate-nudge")).toBeNull();
    expect(screen.getByTestId("card-returning-follow-nudge")).toBeInTheDocument();
  });

  it("never shows for in-app accounts — their consent card is the surface", () => {
    signerWithFollows();
    createdInApp.mockReturnValue(true);

    renderWithProviders(<PostSignupCard />);

    expect(screen.queryByTestId("card-activate-nudge")).toBeNull();
  });

  // Its own flag, not the shared post-signup one: putting the setup checklist
  // away months ago must not swallow a NEW ask that only just became relevant.
  it("outlives a long-ago dismissal of the setup card", () => {
    signerWithFollows();
    cardDismissed.mockReturnValue(true);

    renderWithProviders(<PostSignupCard />);

    expect(screen.getByTestId("card-activate-nudge")).toBeInTheDocument();
  });

  it("dismisses via its own flag", () => {
    signerWithFollows();
    renderWithProviders(<PostSignupCard />);

    fireEvent.click(screen.getByTestId("button-activate-nudge-dismiss"));

    expect(dismissActivateNudge).toHaveBeenCalledWith(PUBKEY);
    expect(dismissPostSignup).not.toHaveBeenCalled();
  });
});
