import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { OnboardingBackupStep } from "./OnboardingBackupStep";

const PUBKEY = "a".repeat(64);
const NPUB = "npub1lira";
const NCRYPTSEC = "ncryptsec1qqqqq";
const PASSWORD = "hunter2hunter2";
const NEW_PASSWORD = "a-second-password";

const toast = vi.fn();
const onSkip = vi.fn();
const onFinish = vi.fn();
const verifyRecoveryPassword = vi.fn(async (_password: string) => ({ ok: true }) as
  | { ok: true }
  | { ok: false; reason: "wrong-password" | "unusable-backup" });
const setRecoveryPassword = vi.fn(async () => {});
const heldBackup = vi.fn((): string | undefined => NCRYPTSEC);
const keyReachableWithoutPassword = vi.fn(async () => true);
const heldBackupCredential = vi.fn(() => ({ npub: NPUB, ncryptsec: NCRYPTSEC }));
const downloadBackupFile = vi.fn();
const storePasswordCredential = vi.fn(async () => true);
const writeText = vi.fn(async () => {});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/accounts/backup", () => ({
  MIN_RECOVERY_PASSWORD_LENGTH: 8,
  verifyRecoveryPassword: (...args: unknown[]) => verifyRecoveryPassword(...(args as [string])),
  setRecoveryPassword: (...args: unknown[]) => setRecoveryPassword(...(args as [])),
  keyReachableWithoutPassword: () => keyReachableWithoutPassword(),
  heldBackup: () => heldBackup(),
  keyAccessMessage: () => "Please try again.",
}));
vi.mock("@/lib/accountBackup", () => ({
  heldBackupCredential: () => heldBackupCredential(),
  downloadBackupFile: (...args: unknown[]) => downloadBackupFile(...(args as [])),
}));
vi.mock("@/lib/credentialManager", () => ({
  storePasswordCredential: (...args: unknown[]) => storePasswordCredential(...(args as [])),
}));

function render() {
  renderWithProviders(<OnboardingBackupStep pubkey={PUBKEY} onSkip={onSkip} onFinish={onFinish} />);
}

/** Answer the verify pane and submit it. */
async function submitPassword(password: string) {
  render();
  fireEvent.change(screen.getByTestId("onboarding-backup-password"), { target: { value: password } });
  fireEvent.click(screen.getByTestId("onboarding-backup-download"));
  await waitFor(() => expect(verifyRecoveryPassword).toHaveBeenCalledWith(password));
}

/** Fail the check, then take the offer to set a new password. */
async function reachReplacePane() {
  verifyRecoveryPassword.mockResolvedValue({ ok: false, reason: "wrong-password" });
  await submitPassword("not-the-password");
  fireEvent.click(await screen.findByTestId("onboarding-backup-forgotten"));
  await screen.findByTestId("onboarding-backup-new-password");
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyRecoveryPassword.mockResolvedValue({ ok: true });
  heldBackup.mockReturnValue(NCRYPTSEC);
  keyReachableWithoutPassword.mockResolvedValue(true);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("verifying the signup password", () => {
  it("hands over the backup the account already holds, minting nothing new", async () => {
    await submitPassword(PASSWORD);

    await waitFor(() =>
      expect(downloadBackupFile).toHaveBeenCalledWith({ npub: NPUB, ncryptsec: NCRYPTSEC }),
    );
    expect(localStorage.getItem(`brainstorm_backup_done:${PUBKEY}`)).toBe("true");
  });

  // The rehearsal: a password typed wrong at signup surfaces here, not months later.
  it("releases nothing when the password is wrong, and says so", async () => {
    verifyRecoveryPassword.mockResolvedValue({ ok: false, reason: "wrong-password" });

    await submitPassword("not-the-password");

    await waitFor(() => expect(screen.getByTestId("onboarding-backup-error")).toBeInTheDocument());
    expect(downloadBackupFile).not.toHaveBeenCalled();
  });

  // The check is what this browser can't run — the file itself is fine, and it
  // opens wherever scrypt fits. Withholding it would help nobody.
  it("still hands the file over when the browser can't run the check", async () => {
    verifyRecoveryPassword.mockResolvedValue({ ok: false, reason: "unusable-backup" });

    await submitPassword(PASSWORD);

    await waitFor(() => expect(downloadBackupFile).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("onboarding-backup-error").textContent).toMatch(/couldn't check/i);
  });

  it("paints the checking state before the derivation blocks the thread", async () => {
    render();
    fireEvent.change(screen.getByTestId("onboarding-backup-password"), { target: { value: PASSWORD } });

    fireEvent.click(screen.getByTestId("onboarding-backup-download"));

    expect(screen.getByTestId("onboarding-backup-download").textContent).toMatch(/checking/i);
    expect(verifyRecoveryPassword).not.toHaveBeenCalled();
    await waitFor(() => expect(verifyRecoveryPassword).toHaveBeenCalled());
  });
});

describe("a password they can't produce", () => {
  it("re-mints under a new one and hands the file over", async () => {
    await reachReplacePane();

    fireEvent.change(screen.getByTestId("onboarding-backup-new-password"), { target: { value: NEW_PASSWORD } });
    fireEvent.change(screen.getByTestId("onboarding-backup-new-confirm"), { target: { value: NEW_PASSWORD } });
    fireEvent.click(screen.getByTestId("onboarding-backup-set"));

    await waitFor(() => expect(setRecoveryPassword).toHaveBeenCalledWith(NEW_PASSWORD));
    await waitFor(() => expect(downloadBackupFile).toHaveBeenCalledTimes(1));
  });

  it("warns that the old password still owns whatever is already saved", async () => {
    await reachReplacePane();

    const note = screen.getByTestId("onboarding-backup-set-note").textContent ?? "";
    expect(note).toMatch(/older backup file/i);
    expect(note).toMatch(/password manager/i);
  });

  it("won't set a new password that doesn't match its confirm", async () => {
    await reachReplacePane();

    fireEvent.change(screen.getByTestId("onboarding-backup-new-password"), { target: { value: NEW_PASSWORD } });
    fireEvent.change(screen.getByTestId("onboarding-backup-new-confirm"), { target: { value: "something else" } });

    expect(screen.getByTestId("onboarding-backup-set")).toBeDisabled();
  });

  // Setting a new password needs the key, and the only way to it would be the
  // password they just said they'd lost. Say so rather than ask for it.
  it("doesn't pretend it can help once only the old password opens the key", async () => {
    keyReachableWithoutPassword.mockResolvedValue(false);
    verifyRecoveryPassword.mockResolvedValue({ ok: false, reason: "wrong-password" });
    await submitPassword("not-the-password");

    fireEvent.click(await screen.findByTestId("onboarding-backup-forgotten"));

    await screen.findByTestId("onboarding-backup-replace-blocked");
    expect(screen.queryByTestId("onboarding-backup-new-password")).not.toBeInTheDocument();
    expect(setRecoveryPassword).not.toHaveBeenCalled();
  });

  // Nothing to verify against: a migrated or pasted-key account has no Backup yet.
  it("asks an account with no backup to set a password rather than to prove one", () => {
    heldBackup.mockReturnValue(undefined);

    render();

    expect(screen.getByTestId("onboarding-backup-new-password")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-backup-password")).not.toBeInTheDocument();
    expect(screen.getByTestId("onboarding-backup-set-note").textContent).not.toMatch(/older backup/i);
  });
});

describe("delivering it three ways", () => {
  it("saves the same credential to the password manager", async () => {
    await submitPassword(PASSWORD);

    await waitFor(() => expect(storePasswordCredential).toHaveBeenCalledWith(NPUB, NCRYPTSEC, NPUB));
  });

  it("offers the file again and the key on the clipboard — mobile downloads get lost", async () => {
    await submitPassword(PASSWORD);
    await screen.findByTestId("onboarding-backup-delivered");

    fireEvent.click(screen.getByTestId("onboarding-backup-download-again"));
    expect(downloadBackupFile).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId("onboarding-backup-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(NCRYPTSEC));
  });

  it("finishes once they're holding it", async () => {
    await submitPassword(PASSWORD);

    fireEvent.click(await screen.findByTestId("onboarding-backup-finish"));

    expect(onFinish).toHaveBeenCalled();
  });

  it("hands off to the nag chain when they skip", () => {
    render();

    fireEvent.click(screen.getByTestId("onboarding-backup-skip"));

    expect(onSkip).toHaveBeenCalled();
    expect(downloadBackupFile).not.toHaveBeenCalled();
    expect(localStorage.getItem(`brainstorm_backup_done:${PUBKEY}`)).toBeNull();
  });
});
