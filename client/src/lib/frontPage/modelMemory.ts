import { accountKey } from "@/lib/accountStorage";

/**
 * The model this account last used per endpoint on this browser: what a print fell back to
 * before the schedule carried the reader's choice (`param` `model`), and what the plan's
 * migration writes there on Brainstorm's first edit. A choice here still goes to the
 * schedule. One account's only: the migration signs it into that account's schedule.
 */
const modelKey = (pubkey: string, url: string) => `${accountKey("frontPage:model", pubkey)}:${url}`;

export function readModel(pubkey: string, url: string): string | null {
  try {
    return localStorage.getItem(modelKey(pubkey, url));
  } catch {
    return null;
  }
}

export function writeModel(pubkey: string, url: string, model: string) {
  try {
    localStorage.setItem(modelKey(pubkey, url), model);
  } catch {
    // remembered for this visit only
  }
}

/**
 * What older versions remembered, `frontPage:model:<url>` with no account: it can't be told
 * whose it was, so no account's schedule migrates it. It is dropped.
 */
export function dropUnownedModels() {
  try {
    const unowned: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_MODEL_PREFIX) && !OWNED_MODEL.test(key)) unowned.push(key);
    }
    for (const key of unowned) localStorage.removeItem(key);
  } catch {
    // storage unavailable: nothing to drop
  }
}
const LEGACY_MODEL_PREFIX = "frontPage:model:";
const OWNED_MODEL = /^frontPage:model:[0-9a-f]{64}:/;
