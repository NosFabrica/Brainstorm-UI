import { useRef } from "react";

/**
 * A one-shot guard that resets when the identity does.
 *
 * The App-root effects that publish an assistant, activate NIP-85 or kick off
 * scoring must each run once per *account*, not once per tab. They never remount
 * on a switch, so a boolean meant a second identity added in the same session
 * never got its turn.
 *
 * `done` and `mark` are separate because every caller checks first, works through
 * further conditions, and marks only once it is actually about to fire. Marking
 * at the check would burn the guard on a run that then bailed.
 */
export function useOncePerPubkey(): { done: (pubkey: string) => boolean; mark: (pubkey: string) => void } {
  const firedFor = useRef<string | null>(null);
  return {
    done: (pubkey) => firedFor.current === pubkey,
    mark: (pubkey) => void (firedFor.current = pubkey),
  };
}
