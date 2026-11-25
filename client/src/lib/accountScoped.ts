/**
 * Module caches whose answers depend on who is looking register a reset here,
 * and it runs when the viewer changes: another Account becomes the Active one
 * (or none does), or the active Perspective switches.
 *
 * `queryClient.clear()` (accounts/login-flow) only reaches react-query; a
 * module-level memo keyed without the viewer (a "followed by people you
 * follow" line, a trust score per person) answered for the previous identity
 * until the tab reloaded. Watching the account manager's `active$` catches
 * every way the Active Account changes — a sign-in, the picker, another tab —
 * without each of them having to remember to call in.
 */
import type { Observable } from "rxjs";

type Reset = () => void;
const resets = new Set<Reset>();
const perspectiveResets = new Set<Reset>();

function run(set: Set<Reset>): void {
  for (const reset of [...set]) {
    try {
      reset();
    } catch {
      /* one cache's failure is not the others' */
    }
  }
}

/** Run `reset` whenever the Active Account changes. Returns an unregister. */
export function onAccountChange(reset: Reset): () => void {
  resets.add(reset);
  watchAccounts();
  return () => resets.delete(reset);
}

/** Run `reset` whenever the Active Account or the active Perspective changes. */
export function onViewerChange(reset: Reset): () => void {
  perspectiveResets.add(reset);
  const off = onAccountChange(reset);
  return () => {
    perspectiveResets.delete(reset);
    off();
  };
}

/** The Active Account changed: every account-scoped cache forgets what it held. */
export function accountChanged(): void {
  run(resets);
}

/** The active Perspective changed (hooks/useActivePerspective). */
export function perspectiveChanged(): void {
  run(perspectiveResets);
}

let watching = false;

/**
 * Follow the account manager's `active$`, from the first registration. Loaded
 * lazily, as lib/queryClient does: the accounts module bootstraps at load and
 * imports from lib/, and a test touching a cache need not bootstrap it.
 */
function watchAccounts(): void {
  if (watching || import.meta.env.MODE === "test") return;
  watching = true;
  void import("@/accounts").then(({ accountManager }) => followActive(accountManager.active$)).catch(() => undefined);
}

/** Call `accountChanged` each time `active$` names a different pubkey than before. Exposed for tests. */
export function followActive(active$: Observable<{ pubkey: string } | undefined>): () => void {
  let first = true;
  let last: string | null = null;
  const sub = active$.subscribe((account) => {
    const pk = account?.pubkey?.toLowerCase() ?? null;
    if (first) {
      first = false;
      last = pk;
      return;
    }
    if (pk === last) return;
    last = pk;
    accountChanged();
  });
  return () => sub.unsubscribe();
}

/** Test seam. */
export function __resetAccountScoped(): void {
  resets.clear();
  perspectiveResets.clear();
}
