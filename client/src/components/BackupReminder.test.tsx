import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { BackupNeed } from "@/accounts/backup";
import type { BrainstormAccount } from "@/accounts/metadata";
import type { SetupState } from "@/hooks/useSetupTasks";
import { BackupReminder } from "./BackupReminder";

const NPUB = "npub1lira";
const NCRYPTSEC = "ncryptsec1qqqqq";
const PASSWORD = "hunter2hunter2";
const SNOOZE_MS = 2.5 * 24 * 3600_000;

const backupNeed = vi.fn<() => BackupNeed | null>(() => "download");
const setRecoveryPassword = vi.fn(async () => {});
const deliverBackup = vi.fn(() => ({ npub: NPUB, ncryptsec: NCRYPTSEC }) as { npub: string; ncryptsec: string } | null);
const postSignupDismissed = vi.fn(() => true);
/** Whether the post-signup card would be on screen offering the same thing. */
const setup = vi.fn<() => Partial<SetupState>>(() => ({ eligible: false, allDone: false }));

let account: BrainstormAccount;

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/accounts/backup", () => ({
  MIN_RECOVERY_PASSWORD_LENGTH: 8,
  setRecoveryPassword: (...args: unknown[]) => setRecoveryPassword(...(args as [])),
  keyAccessMessage: () => "Please try again.",
}));
vi.mock("@/lib/accountBackup", () => ({
  deliverBackup: () => deliverBackup(),
  downloadBackupFile: vi.fn(),
}));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => backupNeed() }));
vi.mock("@/hooks/useSetupTasks", () => ({ useSetupTasks: () => setup() }));
vi.mock("@/lib/postSignupDismissal", () => ({ usePostSignupDismissed: () => postSignupDismissed() }));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => account }));

beforeEach(() => {
  vi.clearAllMocks();
  backupNeed.mockReturnValue("download");
  postSignupDismissed.mockReturnValue(true);
  setup.mockReturnValue({ eligible: false, allDone: false });
  deliverBackup.mockReturnValue({ npub: NPUB, ncryptsec: NCRYPTSEC });
  account = { pubkey: "a".repeat(64), metadata: { remembered: true } } as unknown as BrainstormAccount;
});

describe("who the reminder asks, and for what", () => {
  it("asks an account that holds a backup to take it", () => {
    renderWithProviders(<BackupReminder />);

    expect(screen.getByTestId("backup-reminder")).toBeInTheDocument();
    expect(screen.getByTestId("backup-prompt-download")).toBeInTheDocument();
    expect(screen.queryByTestId("backup-prompt-password")).toBeNull();
  });

  // Two starting points, one destination: a migrated account is asked for the
  // password first, and setting it hands the file over in the same flow.
  it("asks a migrated account to set a recovery password", () => {
    backupNeed.mockReturnValue("recovery-password");

    renderWithProviders(<BackupReminder />);

    expect(screen.getByTestId("backup-prompt-password")).toBeInTheDocument();
    expect(screen.queryByTestId("backup-prompt-download")).toBeNull();
  });

  // Extension and remote-signer accounts have nothing to back up, and someone
  // who pasted their own key demonstrably holds it. The state says so.
  it("never appears when there is nothing to ask for", () => {
    backupNeed.mockReturnValue(null);

    renderWithProviders(<BackupReminder />);

    expect(screen.queryByTestId("backup-reminder")).toBeNull();
  });
});

describe("its place in the chain", () => {
  it("waits while the post-signup card is offering the same thing", () => {
    setup.mockReturnValue({ eligible: true, allDone: false });
    postSignupDismissed.mockReturnValue(false);

    renderWithProviders(<BackupReminder />);

    expect(screen.queryByTestId("backup-reminder")).toBeNull();
  });

  it("takes over once that card has been put away", () => {
    setup.mockReturnValue({ eligible: true, allDone: false });
    postSignupDismissed.mockReturnValue(true);

    renderWithProviders(<BackupReminder />);

    expect(screen.getByTestId("backup-reminder")).toBeInTheDocument();
  });

  // A migrated account was never created in this app, so the post-signup card
  // never runs for it — waiting on a dismissal that can't happen would leave the
  // audience this whole chain exists for with no nag at all.
  it("appears for an account the post-signup card never runs for", () => {
    backupNeed.mockReturnValue("recovery-password");
    setup.mockReturnValue({ eligible: false, allDone: false });
    postSignupDismissed.mockReturnValue(false);

    renderWithProviders(<BackupReminder />);

    expect(screen.getByTestId("backup-reminder")).toBeInTheDocument();
  });
});

describe("dismissing it", () => {
  it("snoozes rather than silences — losing the browser loses the account", () => {
    renderWithProviders(<BackupReminder />);

    fireEvent.click(screen.getByTestId("backup-reminder-dismiss"));

    expect(screen.queryByTestId("backup-reminder")).toBeNull();
    expect(account.metadata?.backupRemindedAt).toBeGreaterThan(0);
  });

  it("stays away for the couple of days it promised", () => {
    account.metadata = { remembered: true, backupRemindedAt: Date.now() - SNOOZE_MS / 2 };

    renderWithProviders(<BackupReminder />);

    expect(screen.queryByTestId("backup-reminder")).toBeNull();
  });

  it("comes back afterwards, because there is no dismissing it forever", () => {
    account.metadata = { remembered: true, backupRemindedAt: Date.now() - SNOOZE_MS - 1000 };

    renderWithProviders(<BackupReminder />);

    expect(screen.getByTestId("backup-reminder")).toBeInTheDocument();
  });
});

describe("the hand-over", () => {
  it("sets the password and downloads the file in one flow", async () => {
    backupNeed.mockReturnValue("recovery-password");
    renderWithProviders(<BackupReminder />);

    fireEvent.change(screen.getByTestId("backup-prompt-password"), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByTestId("backup-prompt-confirm"), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByTestId("backup-prompt-set"));

    await screen.findByTestId("backup-prompt-delivered");
    expect(setRecoveryPassword).toHaveBeenCalledWith(PASSWORD);
    expect(deliverBackup).toHaveBeenCalledTimes(1);
  });

  it("stays put once nothing is missing, so the file can be taken again", async () => {
    renderWithProviders(<BackupReminder />);
    // The hand-over is what flips the state, so from the next render on there is
    // nothing left to ask — and the card is still the one that just asked it.
    backupNeed.mockReturnValue(null);

    fireEvent.click(screen.getByTestId("backup-prompt-download"));

    expect(await screen.findByTestId("backup-prompt-delivered")).toBeInTheDocument();
    expect(screen.getByTestId("backup-reminder")).toBeInTheDocument();
  });
});
