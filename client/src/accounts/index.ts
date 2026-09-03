/**
 * The app's accounts, bootstrapped at module load — so importing this module has
 * a side effect, and nothing else in `accounts/` re-exports through it.
 *
 * A module singleton rather than React state, because the things that need the
 * active Account are not all components: `authenticatedFetch` needs its Session
 * and isn't a hook. `AccountsProvider` hands React this same instance, so the two
 * views can't disagree.
 */
import { bootstrapAccounts } from "./bootstrap";
import { createMirror } from "./cross-tab";

export const accounts = bootstrapAccounts();

/** The `AccountManager` itself, for non-hook callers. Components use `useActiveAccount()`. */
export const accountManager = accounts.manager;

/**
 * Keeps the other tabs in step. Started here rather than in bootstrap so the
 * storage restore has already happened — the channel carries what changes
 * *after* a tab starts, and nothing else.
 */
export const accountMirror = createMirror({
  manager: accountManager,
  persistence: accounts.persistence,
});
