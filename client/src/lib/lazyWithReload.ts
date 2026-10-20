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
 *
 * `preload()` fetches the page's code ahead of a visit (the app warms the
 * common pages once it's idle, lib/warmRoutes): the visit then uses that one
 * download. A warm-up that fails is forgotten — the visit tries again, with
 * the reload above if it must — and never reloads the page itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
export function lazyWithReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  { storage = sessionStore(), reload = () => window.location.reload() }: ReloadDeps = {},
) {
  // The one download, shared by a warm-up and the visit; dropped if it fails so the visit retries.
  let loading: Promise<{ default: T }> | null = null;
  const fetchOnce = () => {
    loading ??= load().catch((err) => {
      loading = null;
      throw err;
    });
    return loading;
  };
  const Page = lazy(async () => {
    try {
      const mod = await fetchOnce();
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
  return Object.assign(Page, {
    preload: (): Promise<void> =>
      fetchOnce().then(
        () => undefined,
        () => undefined,
      ),
  });
}
