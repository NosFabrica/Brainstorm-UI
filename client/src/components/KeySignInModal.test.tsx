import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { backupAtCost } from "@/accounts/test-fakes";
import { BACKUP_LOGN } from "@/accounts/local-signer";
import { renderWithProviders } from "@/test/utils";
import { KeySignInModal } from "./KeySignInModal";

/**
 * Nothing here is ever decrypted — the sign-in is mocked — so the payloads only
 * need a readable NIP-49 header. `backupAtCost` mints one at any work factor,
 * including the ones no browser could actually run.
 */
const NCRYPTSEC = backupAtCost(BACKUP_LOGN + 2); // another app's heavier default
const OUR_NCRYPTSEC = backupAtCost(BACKUP_LOGN);
const NSEC = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";

const BACKUP_FILE = `================================================
  BRAINSTORM ACCOUNT BACKUP
================================================

YOUR ENCRYPTED RECOVERY KEY  (private - needs your password)
${NCRYPTSEC}

HOW TO RESTORE
1. Open Brainstorm and choose Sign in -> "Use your key".
`;

const loginWithPastedKey = vi.fn(async () => ({}) as never);
const setRecoveryPassword = vi.fn(async () => {});
const onLoginSuccess = vi.fn();
const onRetryExtension = vi.fn();

vi.mock("@/services/nostr", () => ({
  loginWithPastedKey: (...args: unknown[]) => loginWithPastedKey(...(args as [])),
}));
vi.mock("@/accounts/backup", () => ({
  setRecoveryPassword: (...args: unknown[]) => setRecoveryPassword(...(args as [])),
}));

function render() {
  renderWithProviders(
    <KeySignInModal
      open
      onOpenChange={() => {}}
      errorCode="NO_EXTENSION"
      errorMessage=""
      onLoginSuccess={onLoginSuccess}
      onRetryExtension={onRetryExtension}
    />,
  );
}

/** Open the key form and put `value` in the paste box, as a person would. */
function paste(value: string) {
  render();
  fireEvent.click(screen.getByTestId("button-show-nsec-form"));
  fireEvent.change(screen.getByTestId("input-nsec"), { target: { value } });
}

beforeEach(() => {
  loginWithPastedKey.mockClear();
  setRecoveryPassword.mockClear();
  onLoginSuccess.mockClear();
});

describe("the way in every backup file ever downloaded points at", () => {
  // Frozen: the printed instruction says "Use your key", and files on disk
  // can't be edited. Rename the component all you like; this wording stays.
  it("is still called 'Use your key'", () => {
    render();

    expect(screen.getByTestId("button-show-nsec-form")).toHaveTextContent("Use your key");
  });
});

describe("what the paste box accepts", () => {
  it("tells a raw key from an encrypted one", () => {
    paste(NSEC);

    expect(screen.queryByTestId("input-backup-password")).not.toBeInTheDocument();
  });

  it("asks for a password when an encrypted key is pasted", () => {
    paste(NCRYPTSEC);

    expect(screen.getByTestId("input-backup-password")).toBeInTheDocument();
  });

  it("takes the whole backup file, which is what people actually paste", () => {
    paste(BACKUP_FILE);

    expect(screen.getByTestId("input-backup-password")).toBeInTheDocument();
  });

  it("signs in from the whole file, key and password", async () => {
    paste(BACKUP_FILE);
    fireEvent.change(screen.getByTestId("input-backup-password"), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.click(screen.getByTestId("button-nsec-signin"));

    await waitFor(() => expect(loginWithPastedKey).toHaveBeenCalled());
    // A single-line field drops the newlines, so what arrives is the whole file
    // run together — the key still has to be found inside it.
    const [pasted, password, options] = loginWithPastedKey.mock.calls[0] as unknown as [
      string,
      string,
      { persistent: boolean },
    ];
    expect(pasted).toContain(NCRYPTSEC);
    expect(password).toBe("hunter2hunter2");
    expect(options).toEqual({ persistent: true });
  });

  it("picks up a key the password manager filled in without React noticing", async () => {
    render();
    fireEvent.click(screen.getByTestId("button-show-nsec-form"));
    const field = screen.getByTestId("input-nsec") as HTMLInputElement;

    field.value = NCRYPTSEC; // autofill sets the DOM value, never onChange
    fireEvent.animationStart(field, { animationName: "onAutoFillStart" });

    expect(await screen.findByTestId("input-backup-password")).toBeInTheDocument();
  });
});

describe("a backup this browser hasn't the memory for", () => {
  it("says so on sight, and never that the password is wrong", () => {
    paste(backupAtCost(22));

    expect(screen.getByTestId("text-backup-unusable")).toHaveTextContent(/memory/i);
    expect(screen.getByTestId("text-backup-unusable")).not.toHaveTextContent(/wrong/i);
    expect(screen.getByTestId("button-nsec-signin")).toBeDisabled();
  });
});

describe("a backup minted somewhere more expensive", () => {
  it("offers to re-mint it cheaper, and lets the user decline", async () => {
    paste(NCRYPTSEC); // heavier than we mint at
    fireEvent.change(screen.getByTestId("input-backup-password"), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.click(screen.getByTestId("button-nsec-signin"));

    const keep = await screen.findByTestId("button-keep-work-factor");
    expect(onLoginSuccess).not.toHaveBeenCalled();

    fireEvent.click(keep);

    expect(setRecoveryPassword).not.toHaveBeenCalled();
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it("re-mints at our own cost only when asked, under the same password", async () => {
    paste(NCRYPTSEC);
    fireEvent.change(screen.getByTestId("input-backup-password"), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.click(screen.getByTestId("button-nsec-signin"));

    fireEvent.click(await screen.findByTestId("button-remint-backup"));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
    expect(setRecoveryPassword).toHaveBeenCalledWith("hunter2hunter2");
  });

  it("does not swallow the sign-in when the offer is dismissed", async () => {
    paste(NCRYPTSEC);
    fireEvent.change(screen.getByTestId("input-backup-password"), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.click(screen.getByTestId("button-nsec-signin"));
    await screen.findByTestId("pane-work-factor");

    // The sign-in already happened; closing declines the re-mint, nothing else.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
    expect(setRecoveryPassword).not.toHaveBeenCalled();
  });

  it("goes straight in when the backup costs no more than ours", async () => {
    paste(OUR_NCRYPTSEC);
    fireEvent.change(screen.getByTestId("input-backup-password"), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.click(screen.getByTestId("button-nsec-signin"));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("button-remint-backup")).not.toBeInTheDocument();
  });
});
