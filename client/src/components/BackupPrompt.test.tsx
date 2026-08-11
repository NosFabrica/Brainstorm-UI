import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { BackupPrompt } from "./BackupPrompt";

const NPUB = "npub1lira";
const NCRYPTSEC = "ncryptsec1qqqqq";
const PASSWORD = "hunter2hunter2";

const toast = vi.fn();
const setRecoveryPassword = vi.fn(async () => {});
const deliverBackup = vi.fn(() => ({ npub: NPUB, ncryptsec: NCRYPTSEC }) as { npub: string; ncryptsec: string } | null);
const downloadBackupFile = vi.fn();
const onDelivered = vi.fn();
const writeText = vi.fn(async () => {});

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

/** Fill the set-password pane with a matching pair. */
function fillPassword(password = PASSWORD) {
  fireEvent.change(screen.getByTestId("backup-prompt-password"), { target: { value: password } });
  fireEvent.change(screen.getByTestId("backup-prompt-confirm"), { target: { value: password } });
}

beforeEach(() => {
  vi.clearAllMocks();
  deliverBackup.mockReturnValue({ npub: NPUB, ncryptsec: NCRYPTSEC });
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("an account that already holds a backup", () => {
  it("asks only for the download, and hands over what it holds", async () => {
    renderWithProviders(<BackupPrompt need="download" onDelivered={onDelivered} />);

    fireEvent.click(screen.getByTestId("backup-prompt-download"));

    expect(deliverBackup).toHaveBeenCalledTimes(1);
    expect(setRecoveryPassword).not.toHaveBeenCalled();
    expect(onDelivered).toHaveBeenCalled();
    await screen.findByTestId("backup-prompt-delivered");
  });

  // The nudge points at the encrypted backup. The raw nsec stays available where
  // someone deliberately goes looking for it, but it is not what a nag offers.
  it("never offers the raw key", () => {
    renderWithProviders(<BackupPrompt need="download" />);

    expect(screen.queryByText(/without a password/i)).toBeNull();
  });
});

describe("a migrated account with no backup yet", () => {
  it("sets the password and hands the file over in the same flow", async () => {
    renderWithProviders(<BackupPrompt need="recovery-password" onDelivered={onDelivered} />);
    fillPassword();

    fireEvent.click(screen.getByTestId("backup-prompt-set"));

    await waitFor(() => expect(setRecoveryPassword).toHaveBeenCalledWith(PASSWORD));
    await waitFor(() => expect(deliverBackup).toHaveBeenCalledTimes(1));
    await screen.findByTestId("backup-prompt-delivered");
  });

  // Setting a new password doesn't reach inside a file already on disk. Two
  // files under two passwords is confusing enough to be worth saying out loud.
  it("says an older backup file still opens with the password it was made under", () => {
    renderWithProviders(<BackupPrompt need="recovery-password" />);

    expect(screen.getByTestId("backup-prompt-note").textContent).toMatch(/still opens/i);
  });

  it("won't take a password that doesn't match its confirm", () => {
    renderWithProviders(<BackupPrompt need="recovery-password" />);

    fireEvent.change(screen.getByTestId("backup-prompt-password"), { target: { value: PASSWORD } });
    fireEvent.change(screen.getByTestId("backup-prompt-confirm"), { target: { value: "something else" } });

    expect(screen.getByTestId("backup-prompt-mismatch")).toBeInTheDocument();
    expect(screen.getByTestId("backup-prompt-set")).toBeDisabled();
  });

  it("won't take one too short to be worth having", () => {
    renderWithProviders(<BackupPrompt need="recovery-password" />);

    fillPassword("short");

    expect(screen.getByTestId("backup-prompt-set")).toBeDisabled();
  });

  it("paints the pending state before the derivation blocks the thread", async () => {
    renderWithProviders(<BackupPrompt need="recovery-password" />);
    fillPassword();

    fireEvent.click(screen.getByTestId("backup-prompt-set"));

    expect(screen.getByTestId("backup-prompt-set").textContent).toMatch(/setting password/i);
    expect(setRecoveryPassword).not.toHaveBeenCalled();
    await waitFor(() => expect(setRecoveryPassword).toHaveBeenCalled());
  });

  it("says so when the key can't be reached, and claims no backup", async () => {
    setRecoveryPassword.mockRejectedValueOnce(new Error("locked"));
    renderWithProviders(<BackupPrompt need="recovery-password" onDelivered={onDelivered} />);
    fillPassword();

    fireEvent.click(screen.getByTestId("backup-prompt-set"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(deliverBackup).not.toHaveBeenCalled();
    expect(onDelivered).not.toHaveBeenCalled();
  });
});

describe("once they're holding it", () => {
  async function deliver() {
    renderWithProviders(<BackupPrompt need="download" />);
    fireEvent.click(screen.getByTestId("backup-prompt-download"));
    await screen.findByTestId("backup-prompt-delivered");
  }

  // A phone loses downloads, and the account it asked about is now backed up —
  // so the pane stays put rather than vanishing the instant the state flips.
  it("offers the file again and the key on the clipboard, even once nothing is missing", async () => {
    await deliver();

    fireEvent.click(screen.getByTestId("backup-prompt-download-again"));
    expect(downloadBackupFile).toHaveBeenCalledWith({ npub: NPUB, ncryptsec: NCRYPTSEC });

    fireEvent.click(screen.getByTestId("backup-prompt-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(NCRYPTSEC));
  });
});

describe("an account with nothing left to ask", () => {
  it("renders nothing at all", () => {
    const { container } = renderWithProviders(<BackupPrompt need={null} />);

    expect(container.textContent).toBe("");
  });
});
