/**
 * The seam between a Locked Signer and the Unlock modal.
 *
 * A Signer that needs the Recovery password calls the installed prompt from deep
 * inside `operation()`, where there is no React to reach for — so the request
 * lands here, the mounted modal renders it, and the answer travels back down the
 * same promise.
 *
 * By construction this only ever happens because the user just clicked something:
 * background publishing no-ops when Locked and a background 401 defers, so
 * nothing they didn't start can raise a password box.
 */
import { npubEncode } from "nostr-tools/nip19";
import { BehaviorSubject } from "rxjs";

import {
  setRecoveryPasswordPrompt,
  UnlockCancelled,
  type RecoveryPasswordRequest,
  type UnlockAttemptResult,
} from "./local-signer";

export type UnlockPrompt = {
  pubkey: string;
  /** Which Account is being unlocked — the modal names it, since the copy can't. */
  npub: string;
  /**
   * Try a password. When it opens the Backup the waiting action resumes and this
   * prompt closes; otherwise the reason comes back for the modal to show.
   */
  submit(password: string): Promise<UnlockAttemptResult>;
  /** A deliberate no: the waiting action rejects with `UnlockCancelled`. */
  cancel(): void;
};

/**
 * The prompt on screen, or null. A `BehaviorSubject` so a modal mounting late
 * still sees a request already in flight.
 */
export const unlockPrompt$ = new BehaviorSubject<UnlockPrompt | null>(null);

/**
 * One prompt at a time, in arrival order. Concurrent signs on one Account already
 * share a single unlock (`LocalSigner.unlock` memoises), so this is the guard for
 * the rarer case: two Accounts asking at once must not stack two dialogs.
 */
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.then(
    () => {},
    () => {},
  );
  return run;
}

function npubOf(pubkey: string): string {
  try {
    return npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

function show({ signer, attempt }: RecoveryPasswordRequest): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    unlockPrompt$.next({
      pubkey: signer.pubkey,
      npub: npubOf(signer.pubkey),
      submit: async (password) => {
        const result = await attempt(password);
        if (result.ok) resolve();
        return result;
      },
      cancel: () => reject(new UnlockCancelled()),
    });
  }).finally(() => unlockPrompt$.next(null));
}

/** The app-wide Recovery password prompt. Hangs until a modal services it. */
export function requestRecoveryPassword(request: RecoveryPasswordRequest): Promise<void> {
  return enqueue(() => show(request));
}

/**
 * Install the prompt. Called at module scope by the component that renders it, not
 * from an effect: a signature can be requested before any effect has run, and a
 * StrictMode remount must not tear the prompt out from under an open dialog.
 */
export function installUnlockPrompt(): void {
  setRecoveryPasswordPrompt(requestRecoveryPassword);
}
