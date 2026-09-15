import { lazy, type ComponentType } from "react";

export const CHUNK_RELOAD_FLAG = "brainstorm_chunk_reload";
/** A reload older than this was for an earlier deploy, not a loop. */
const LOOP_WINDOW_MS = 30_000;

interface ReloadDeps {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  reload?: () => void;
}

function sessionStore(): ReloadDeps["storage"] {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * `React.lazy` that survives a deploy: a tab still pointing at chunks the new
 * build removed reloads once to pick up the new index; failing again right
 * after that reload throws to the error boundary instead of looping.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  { storage = sessionStore(), reload = () => window.location.reload() }: ReloadDeps = {},
) {
  return lazy(async () => {
    try {
      const mod = await load();
      try {
        storage?.removeItem(CHUNK_RELOAD_FLAG);
      } catch {
        // storage unavailable — nothing to forget
      }
      return mod;
    } catch (err) {
      try {
        const last = Number(storage?.getItem(CHUNK_RELOAD_FLAG));
        if (!storage || Date.now() - last < LOOP_WINDOW_MS) throw err;
        storage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
      } catch {
        throw err;
      }
      reload();
      // Keep Suspense waiting while the page reloads.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
