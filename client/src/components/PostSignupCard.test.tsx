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
const followVerification = vi.fn<() => "checking" | "none" | "has-follows">(() => "checking");

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
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: NPUB, displayName: "Lira" }),
}));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({
  useVerifiedNoFollows: () => followVerification(),
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

describe("signer accounts that already follow people", () => {
  // Activation is the header FinishSetupBanner's job now (into /setup/activate)
  // — this card must not stack a second "Activate your scores" ask under the
  // search bar it used to render.
  it("renders nothing — the finish-setup banner owns the activation nudge", () => {
    setupEligible.mockReturnValue(false);
    followVerification.mockReturnValue("has-follows");

    const { container } = renderWithProviders(<PostSignupCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
