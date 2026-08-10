import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import { PostSignupCard } from "./PostSignupCard";

const PUBKEY = "a".repeat(64);
const NPUB = "npub1lira";
const NCRYPTSEC = "ncryptsec1qqqqq";
const PASSWORD = "hunter2hunter2";

const downloadAccountBackup = vi.fn(async () => ({ npub: NPUB, ncryptsec: NCRYPTSEC }));
const downloadRawKeyBackup = vi.fn(async () => {});
const storePasswordCredential = vi.fn(async () => true);
const toast = vi.fn();

vi.mock("@/lib/accountBackup", () => ({
  downloadAccountBackup: (...args: unknown[]) => downloadAccountBackup(...(args as [])),
  downloadRawKeyBackup: () => downloadRawKeyBackup(),
}));
vi.mock("@/lib/credentialManager", () => ({
  storePasswordCredential: (...args: unknown[]) => storePasswordCredential(...(args as [])),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/services/nostr", () => ({ hasPersistentKey: () => true }));
vi.mock("@/lib/followStore", () => ({ knownFollowCount: () => 0 }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: NPUB, displayName: "Lira" }),
}));

/** Open the backup tile and fill in a matching password pair. */
function openBackupForm() {
  renderWithProviders(<PostSignupCard />);
  fireEvent.click(screen.getByTestId("tile-backup"));
  fireEvent.change(screen.getByTestId("input-backup-password"), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByTestId("input-backup-confirm"), { target: { value: PASSWORD } });
  return screen.getByTestId("button-download-backup");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem(`brainstorm_created_inapp:${PUBKEY}`, "true");
});

describe("backing up from the post-signup card", () => {
  it("stores the password-manager credential from the same mint as the file", async () => {
    fireEvent.click(openBackupForm());

    await waitFor(() => expect(storePasswordCredential).toHaveBeenCalledWith(NPUB, NCRYPTSEC, NPUB));
    expect(downloadAccountBackup).toHaveBeenCalledTimes(1);
    expect(downloadAccountBackup).toHaveBeenCalledWith(PASSWORD);
  });

  it("shows a pending state while the key is being reached, rather than looking dead", async () => {
    let release!: (credential: { npub: string; ncryptsec: string }) => void;
    downloadAccountBackup.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));

    const button = openBackupForm();
    fireEvent.click(button);

    await screen.findByText(/preparing backup/i);
    expect(button).toBeDisabled();

    release({ npub: NPUB, ncryptsec: NCRYPTSEC });
    await screen.findByTestId("tile-backup-done");
  });

  it("says so when the key can't be reached, instead of failing silently", async () => {
    downloadAccountBackup.mockRejectedValueOnce(new Error("locked"));

    fireEvent.click(openBackupForm());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(storePasswordCredential).not.toHaveBeenCalled();
    expect(screen.queryByTestId("tile-backup-done")).toBeNull();
  });

  // Demoted, not removed: many nostr clients take an nsec and not an ncryptsec,
  // so dropping it would trap anyone trying to take their identity elsewhere.
  it("keeps the raw-key download below the encrypted one, behind its blunt warning", () => {
    openBackupForm();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const encrypted = screen.getByTestId("button-download-backup");
    const raw = screen.getByTestId("button-download-raw-key");
    expect(encrypted.compareDocumentPosition(raw)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(raw);

    expect(confirm.mock.calls[0][0]).toMatch(/WITHOUT a password/);
    expect(downloadRawKeyBackup).not.toHaveBeenCalled();
  });

  it("marks the account backed up after a raw-key download too", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    openBackupForm();

    fireEvent.click(screen.getByTestId("button-download-raw-key"));

    await screen.findByTestId("tile-backup-done");
    expect(downloadRawKeyBackup).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`brainstorm_backup_done:${PUBKEY}`)).toBe("true");
  });
});
