import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import type { LocalSigner, RecoveryPasswordRequest, UnlockAttemptResult } from "@/accounts/local-signer";
import { isUnlockCancelled } from "@/accounts/local-signer";
import { requestRecoveryPassword, unlockPrompt$ } from "@/accounts/unlock-request";
import { UnlockModal } from "./UnlockModal";

const PUBKEY = "a".repeat(64);
const PASSWORD = "correct horse battery staple";

/** Every prompt this file raises, so none is left blocking the next test. */
const raised: Promise<void>[] = [];

const removeAccountFromDevice = vi.fn();
const navigate = vi.fn();
const heldAccount = { id: "local-1", pubkey: "a".repeat(64) };

vi.mock("@/services/nostr", () => ({
  removeAccountFromDevice: (account: unknown) => removeAccountFromDevice(account),
}));
vi.mock("@/accounts/login", () => ({ localAccountFor: () => heldAccount }));
vi.mock("wouter", () => ({ useLocation: () => ["/dashboard", (to: string) => navigate(to)] }));

/** Raise a prompt the way a Locked Signer does, and render the modal that serves it. */
async function raise(attempt: (password: string) => Promise<UnlockAttemptResult>) {
  const request: RecoveryPasswordRequest = {
    signer: { pubkey: PUBKEY } as unknown as LocalSigner,
    attempt,
  };
  // Wrapped, or awaiting this helper would also await the action it interrupted.
  const pending = requestRecoveryPassword(request);
  pending.catch(() => {}); // each test asserts on its own handle; this keeps a cancel from reading as unhandled
  raised.push(pending);
  renderWithProviders(<UnlockModal />);
  await screen.findByTestId("modal-unlock");
  return { pending };
}

function enterPassword(password: string) {
  fireEvent.change(screen.getByTestId("input-unlock-password"), { target: { value: password } });
  fireEvent.click(screen.getByTestId("button-unlock-submit"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// One prompt shows at a time, so a prompt left open would keep the next test's
// from ever appearing.
afterEach(async () => {
  while (unlockPrompt$.value) {
    unlockPrompt$.value.cancel();
    await Promise.resolve();
  }
  await Promise.allSettled(raised.splice(0));
});

describe("the unlock modal", () => {
  it("unlocks and lets the interrupted action carry on", async () => {
    const attempt = vi.fn(async () => ({ ok: true }) as const);
    const { pending } = await raise(attempt);

    enterPassword(PASSWORD);

    await expect(pending).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledWith(PASSWORD);
    await waitFor(() => expect(screen.queryByTestId("modal-unlock")).not.toBeInTheDocument());
  });

  // The derivation blocks the main thread for up to a second on a phone, so the
  // disabled control has to be on screen BEFORE it starts or repeat submissions
  // queue up behind the freeze.
  it("paints the disabled control and 'Unlocking…' before the key derivation begins", async () => {
    let submitWhenDeriving: { disabled: boolean; label: string | null } | undefined;
    const { pending } = await raise(async () => {
      const button = screen.getByTestId("button-unlock-submit") as HTMLButtonElement;
      submitWhenDeriving = { disabled: button.disabled, label: button.textContent };
      return { ok: true };
    });

    enterPassword(PASSWORD);
    await pending;

    expect(submitWhenDeriving).toEqual({ disabled: true, label: "Unlocking…" });
  });

  it("promises no animation while the thread is blocked", async () => {
    const { pending } = await raise(async () => {
      expect(document.querySelector(".animate-spin")).toBeNull();
      return { ok: true };
    });

    enterPassword(PASSWORD);
    await pending;
  });

  it("shows a wrong password inline and takes another go", async () => {
    const attempt = vi
      .fn<[string], Promise<UnlockAttemptResult>>()
      .mockResolvedValueOnce({ ok: false, reason: "wrong-password" })
      .mockResolvedValueOnce({ ok: true });
    const { pending } = await raise(attempt);

    enterPassword("nope");

    await waitFor(() => expect(screen.getByTestId("text-unlock-error")).toHaveTextContent(/try again/i));
    expect(screen.getByTestId("modal-unlock")).toBeInTheDocument();

    enterPassword(PASSWORD);

    await expect(pending).resolves.toBeUndefined();
    expect(attempt).toHaveBeenNthCalledWith(2, PASSWORD);
  });

  it("never calls a backup this browser can't open a wrong password", async () => {
    await raise(async () => ({ ok: false, reason: "unusable-backup" }));

    enterPassword(PASSWORD);

    await waitFor(() =>
      expect(screen.getByTestId("text-unlock-error")).toHaveTextContent(/needs more memory/i),
    );
  });

  it("abandons the action quietly when cancelled", async () => {
    const { pending } = await raise(async () => ({ ok: true }));

    fireEvent.click(screen.getByTestId("button-unlock-cancel"));

    const error = await pending.catch((e) => e);
    expect(isUnlockCancelled(error)).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("modal-unlock")).not.toBeInTheDocument());
  });

  it("names the account it is asking about", async () => {
    await raise(async () => ({ ok: true }));

    expect(screen.getByTestId("text-unlock-npub")).toHaveTextContent(/^npub1/);
  });

  // "in this tab" is load-bearing: a tab that followed another tab's switch
  // arrives Locked, so a promise about the whole visit would be one we break.
  it("says the unlock lasts for this tab's visit, so nobody expects to be asked again", async () => {
    await raise(async () => ({ ok: true }));

    expect(screen.getByTestId("modal-unlock")).toHaveTextContent(
      /in this tab for the rest of your visit/i,
    );
  });
});

describe("forgetting the recovery password", () => {
  it("offers signing in with a key, which abandons the action and opens the key form", async () => {
    const { pending } = await raise(async () => ({ ok: true }));

    fireEvent.click(screen.getByTestId("button-unlock-forgotten"));
    fireEvent.click(screen.getByTestId("button-unlock-use-key"));

    expect(isUnlockCancelled(await pending.catch((e) => e))).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/login?key=1");
    expect(removeAccountFromDevice).not.toHaveBeenCalled();
  });

  it("does not destroy the key on one tap — removal is confirmed first", async () => {
    await raise(async () => ({ ok: true }));

    fireEvent.click(screen.getByTestId("button-unlock-forgotten"));
    fireEvent.click(screen.getByTestId("button-unlock-remove"));

    expect(removeAccountFromDevice).not.toHaveBeenCalled();
    expect(screen.getByTestId("button-unlock-remove-confirm")).toBeInTheDocument();
  });

  it("removes the account from this device once confirmed", async () => {
    const { pending } = await raise(async () => ({ ok: true }));

    fireEvent.click(screen.getByTestId("button-unlock-forgotten"));
    fireEvent.click(screen.getByTestId("button-unlock-remove"));
    fireEvent.click(screen.getByTestId("button-unlock-remove-confirm"));

    expect(isUnlockCancelled(await pending.catch((e) => e))).toBe(true);
    expect(removeAccountFromDevice).toHaveBeenCalledWith(heldAccount);
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
