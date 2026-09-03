/**
 * The state a deliberately deferred re-auth leaves behind: the user is signed in,
 * holds a perfectly good Account, and every authenticated request fails until
 * they do something. Nothing else says so, which is what the unlock card and the
 * "sign in again" state read this for. Without an Unlock cache — private
 * browsing, or plain HTTP — it is every page load, not an occasional state.
 */
import type { AccountManager, BaseAccount } from "applesauce-accounts";
import { distinctUntilChanged, from, map, merge, of, startWith, switchMap, type Observable } from "rxjs";

import { LocalAccount } from "./local-account";
import type { AccountMetadata, BrainstormAccount } from "./metadata";
import { hasSession } from "./session";
import { canSignSilently } from "./signing";

/**
 * No Session, and no way to mint one without asking — which is what makes it the
 * user's move. A key that opens from the Unlock cache heals on the next request
 * without anyone noticing, and an extension prompts in its own app.
 */
export async function sessionDeferred(account: BrainstormAccount): Promise<boolean> {
  if (hasSession(account)) return false;
  return !(await canSignSilently(account));
}

/**
 * The Active Account while its Session is deferred, or null.
 *
 * Two things end this state, so both are watched: a metadata write, where the
 * Session lives, and the Signer opening — anything the user published unlocks
 * the key, and from then on the next request re-auths on its own.
 */
export function deferredSession$(
  manager: AccountManager<AccountMetadata>,
): Observable<BrainstormAccount | null> {
  return manager.active$.pipe(
    switchMap((active) => {
      if (!active) return of(null);
      const account = active as unknown as BrainstormAccount;
      const metadata$ = (active as BaseAccount<any, any, AccountMetadata>).metadata$;
      const changed$ =
        active instanceof LocalAccount ? merge(metadata$, active.signer.unlocked$) : metadata$;
      return changed$.pipe(
        startWith(null),
        switchMap(() => from(sessionDeferred(account))),
        map((deferred) => (deferred ? account : null)),
      );
    }),
    distinctUntilChanged(),
  );
}
