/**
 * The app's one relay pool.
 *
 * It used to live inside `services/nostr.ts`, which the accounts module may not
 * import — `accounts/index.ts` bootstraps at module load and `services/nostr.ts`
 * imports it, so reaching back the other way is a cycle. The NIP-46 transport
 * needs a pool at that same moment, so the pool moved down here where both can
 * reach it and neither depends on the other.
 */
import { RelayPool } from "applesauce-relay";

/**
 * How long an idle socket stays open. The library's 30s means a pause between
 * two searches costs a fresh DNS + TCP + TLS + upgrade (~0.5s desktop, more on
 * mobile); a few minutes covers a reader thinking between searches.
 */
const KEEP_ALIVE_MS = 5 * 60_000;

export const pool = new RelayPool({ keepAlive: KEEP_ALIVE_MS });
