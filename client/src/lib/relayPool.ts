/**
 * The app's one relay pool.
 *
 * It used to live inside `services/nostr.ts`, which the accounts module may not
 * import — `accounts/index.ts` bootstraps at module load and `services/nostr.ts`
 * imports it, so reaching back the other way is a cycle. The NIP-46 transport
 * needs a pool at that same moment, so the pool moved down here where both can
 * reach it and neither depends on the other.
 *
 * One rule every read through it obeys: **a relay that demands NIP-42 auth
 * never holds a read.** applesauce's `Relay.req` defaults to waiting for a
 * login when a relay answers `CLOSED auth-required`; the app authenticates
 * only when a signer is present and allowed to (services/relayAuth), so a REQ
 * left waiting would wait for the group request's 5s fallback — the ~7s a
 * screen took to render when a relay in the reader's own relay list was gated
 * (the team, 2026-09-24). A gated relay is skipped at once; the read completes
 * when the relays that can answer have answered, and the gated one joins the
 * next read if it gets authenticated meanwhile. A relay that cannot be reached
 * is skipped the same way: no single relay decides when a read is done.
 */
import { Relay, RelayPool, type RelayOptions } from "applesauce-relay";
import { normalizeURL } from "applesauce-core/helpers/url";

/**
 * How long an idle socket stays open. The library's 30s means a pause between
 * two searches costs a fresh DNS + TCP + TLS + upgrade (~0.5s desktop, more on
 * mobile); a few minutes covers a reader thinking between searches.
 */
const KEEP_ALIVE_MS = 5 * 60_000;

/** A relay whose REQs never wait for authentication. */
class ReadFirstRelay extends Relay {
  req(filters: Parameters<Relay["req"]>[0], opts?: Parameters<Relay["req"]>[1]): ReturnType<Relay["req"]> {
    return super.req(filters, { waitForAuth: false, ...opts });
  }
}

class ReadFirstPool extends RelayPool {
  /** The library's `relay()`, minting ReadFirstRelay — it takes no factory. */
  relay(url: string): Relay {
    url = normalizeURL(url);
    const existing = this.relays.get(url);
    if (existing) return existing;
    const relay = new ReadFirstRelay(url, this.options);
    this.relays.set(url, relay);
    this.relays$.next(this.relays);
    this.add$.next(relay);
    return relay;
  }
}

/** The pool the app runs on, built once below; exposed so a test can build its own over a fake socket. */
export function createPool(options: RelayOptions = {}): RelayPool {
  // A one-shot read does not retry a relay whose socket will not connect —
  // the library's three retries with backoff kept an article waiting on an
  // author's `umbrel.local`. Live subscriptions keep their reconnects.
  return new ReadFirstPool({ keepAlive: KEEP_ALIVE_MS, requestReconnect: 0, ...options });
}

export const pool = createPool();
