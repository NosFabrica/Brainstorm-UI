/**
 * Brings the durable event cache up, at module load.
 *
 * Here rather than in `lib/` because it needs the account manager, and `lib/`
 * may not import upward. Here rather than in a React effect because effects run
 * after the first render, and by then the queries this exists to satisfy have
 * already gone to the relays.
 *
 * `bootstrapAccounts` is synchronous, so the active account is known the moment
 * this module is imported — including on a RELOAD, where `completeLogin` never
 * runs and nothing else would warm the store at all.
 */
import { accountManager } from "@/accounts";
import { clearEventCache, hydrateEventStore, startEventCache } from "@/lib/eventCache";

let hydratedFor: string | null = null;

/** Hydrate for whoever is active now, and again whenever that changes. */
export function startStoreHydration(): void {
  startEventCache();
  hydrateFor(accountManager.active?.pubkey ?? null);

  accountManager.active$.subscribe((account) => {
    hydrateFor(account?.pubkey ?? null);
  });
}

function hydrateFor(pubkey: string | null): void {
  if (pubkey === hydratedFor) return;
  hydratedFor = pubkey;
  if (!pubkey) return;
  // `clearEventCache` stops the writer on sign-out, so signing back in has to
  // start it again. Idempotent, so the boot call above costs nothing.
  startEventCache();
  void hydrateEventStore(pubkey).catch(() => 0);
}

/**
 * Sign-out drops the cache. Which profiles someone looked at is a browsing
 * trail, and it should not outlive the session on a shared device.
 */
export function clearHydratedStore(): void {
  hydratedFor = null;
  void clearEventCache().catch(() => undefined);
}
