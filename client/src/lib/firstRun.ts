import { accountKey } from "@/lib/accountStorage";

/**
 * The first run (/start) is offered once, to an account new to Brainstorm:
 * its scores never calculated, however it signed in. Before it existed nobody
 * had one, so "made in the app" alone would send every existing user through
 * it. Finishing or skipping ends the offer; until the server answers, nothing
 * is decided.
 */
export function needsFirstRun({
  done,
  everCalculated,
}: {
  done: boolean;
  /** Whether the server has ever calculated (or started) this account's scores; undefined until it answers. */
  everCalculated: boolean | undefined;
}): boolean {
  return !done && everCalculated === false;
}

const key = (pubkey: string) => accountKey("brainstorm_first_run", pubkey);

export function isFirstRunDone(pubkey: string | null | undefined): boolean {
  if (!pubkey) return false;
  try {
    return localStorage.getItem(key(pubkey)) !== null;
  } catch {
    return false;
  }
}

export function markFirstRunDone(pubkey: string | null | undefined): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(key(pubkey), String(Date.now()));
  } catch {
    /* private browsing */
  }
}
