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
 * never holds a read.** Live subscriptions are not reads: they wait for the
 * login and resume. applesauce's `Relay.req` defaults to waiting for a
 * login when a relay answers `CLOSED auth-required`; the app authenticates
 * only when a signer is present and allowed to (services/relayAuth), so a REQ
 * left waiting would wait for the group request's 5s fallback — the ~7s a
 * screen took to render when a relay in the reader's own relay list was gated
 * (the team, 2026-09-24). A gated relay is skipped at once; the read completes
 * when the relays that can answer have answered, and the gated one joins the
 * next read if it gets authenticated meanwhile. A relay that cannot be reached
 * is skipped the same way: no single relay decides when a read is done.
 */
import { Relay, RelayGroup, RelayPool, type GroupRequestCompleteOperator, type RelayOptions } from "applesauce-relay";
import { normalizeURL } from "applesauce-core/helpers/url";
import { Subject, filter, isObservable, map, race, scan, take, timer, type Observable } from "rxjs";
import { isUnreachableLocalRelay, onConsentChange } from "./localNetwork";
import { SEARCH_RELAY, SEARCH_RELAY_READ_TOKEN } from "./relays";

/**
 * How long an idle socket stays open. The library's 30s means a pause between
 * two searches costs a fresh DNS + TCP + TLS + upgrade (~0.5s desktop, more on
 * mobile); a few minutes covers a reader thinking between searches.
 */
const KEEP_ALIVE_MS = 5 * 60_000;

/**
 * A relay whose reads never wait for authentication — and whose live
 * subscriptions still do. A subscription on a gated relay is not a read
 * anyone is looking at a spinner for: it waits for services/relayAuth to
 * sign in, then resumes, as the library intends. Only one-shot reads skip.
 */
type ReqFilters = Parameters<Relay["req"]>[0];
type OneFilter = Exclude<ReqFilters, unknown[] | Observable<unknown>>;

/**
 * Our search relay answers a read only when it carries a NIP-50 `search`
 * token; a filter without one (every fallback lookup) gets the whole-corpus
 * token. Filters that already search — the typeahead, an observer's ranking —
 * pass through as they are.
 */
export function withSearchToken(filters: ReqFilters): ReqFilters {
  const one = (f: OneFilter): OneFilter =>
    (f as { search?: string }).search ? f : ({ ...f, search: SEARCH_RELAY_READ_TOKEN } as OneFilter);
  if (isObservable(filters))
    return (filters as Observable<OneFilter | OneFilter[]>).pipe(
      map((f) => (Array.isArray(f) ? f.map(one) : one(f))),
    ) as ReqFilters;
  return (Array.isArray(filters) ? (filters as OneFilter[]).map(one) : one(filters as OneFilter)) as ReqFilters;
}

class ReadFirstRelay extends Relay {
  /** Every read — `request` and `subscription` included — comes through here. */
  req(filters: ReqFilters, opts?: Parameters<Relay["req"]>[1]): ReturnType<Relay["req"]> {
    return super.req(this.url === SEARCH_RELAY ? withSearchToken(filters) : filters, { waitForAuth: false, ...opts });
  }

  subscription(
    filters: Parameters<Relay["subscription"]>[0],
    opts?: Parameters<Relay["subscription"]>[1],
  ): ReturnType<Relay["subscription"]> {
    return super.subscription(filters, { waitForAuth: true, ...opts });
  }

  /**
   * Open the socket now, ahead of the first REQ. A brief look at the watch
   * tower is what a REQ does to connect; letting go of it at once leaves the
   * socket on the keep-alive timer, so a REQ that follows rides it.
   */
  warm(): void {
    if (this.connected) return;
    this.watchTower.subscribe().unsubscribe();
  }

  /**
   * The app is back (lib/appResume). A relay whose socket dropped while it was
   * away — iOS closes a suspended app's sockets, and says so on its return — is
   * sitting out the library's reconnect backoff, which grows to five minutes
   * over a long absence. That wait is cut short: the next REQ connects now.
   */
  wake(): void {
    if (this.ready || !this.reconnectSubscription) return;
    this.reconnectSubscription.unsubscribe();
    this.reconnectSubscription = null;
    this.attempts$.next(0);
    this._ready$.next(true);
  }
}

/**
 * Wakes whatever is waiting to retry a relay (a live subscription's backoff,
 * services/dm/transport) the moment the app comes back.
 */
export const relayWake$ = new Subject<void>();

/** A retry delay that grows to `capMs`, cut short when the app comes back. */
export function wakeableBackoff(capMs = 30_000) {
  return (_error: unknown, attempt: number): Observable<unknown> =>
    race(timer(Math.min(attempt * 1000, capMs)), relayWake$.pipe(take(1)));
}

/**
 * Connect to `relay` before anything is asked of it, so the first read skips
 * the DNS + TCP + TLS + upgrade. A no-op when the socket is already open, or
 * for a relay this pool did not build.
 */
export function warmRelay(relay: Relay): void {
  if (relay instanceof ReadFirstRelay) relay.warm();
}

/**
 * How long the other relays get once one has answered a read. The library
 * waits 5s; a relay that connects and says nothing (or is just far away) held
 * every read that long. Long enough for a second relay on a normal link to
 * finish, short enough that nobody notices the wait.
 */
export const STRAGGLER_GRACE_MS = 1200;

/**
 * Every relay asked has answered or failed. The library's own rule counts only
 * the relays that have reported so far, so a relay that fails fast — a gated
 * one, a dead one, both now skipped in milliseconds — ended a read on its own
 * while the relays that could answer were still connecting, and the read came
 * back empty. This one counts against the list that was asked.
 */
function everyAskedRelayDone(relays: string[]): GroupRequestCompleteOperator {
  const asked = new Set(relays.map((url) => normalizeURL(url)));
  return (messages) =>
    messages.pipe(
      filter((message) => message.type === "EOSE" || message.type === "ERROR"),
      scan((done, message) => done.add(message.from), new Set<string>()),
      map((done) => [...asked].every((url) => done.has(url))),
    );
}

/** A read is done when every relay asked has answered, or a grace after the first did. */
const readComplete = (relays: Parameters<RelayPool["request"]>[0]) =>
  RelayGroup.completeOnAny(
    RelayGroup.completeAfterFirstRelay(STRAGGLER_GRACE_MS),
    // A live list of relays has no fixed "asked"; the library's rule stands there.
    Array.isArray(relays) ? everyAskedRelayDone(relays) : RelayGroup.completeOnAllEose(),
  );

/** The relays of a list this page may open a socket to (see `refusingLocal`). */
const reachable = (urls: string[]) => urls.filter((url) => !isUnreachableLocalRelay(url));

function reachableRelays(relays: string[] | Observable<string[]>): string[] | Observable<string[]> {
  return isObservable(relays) ? relays.pipe(map(reachable)) : reachable(relays);
}

type FilterMapInput = Parameters<RelayPool["subscriptionMap"]>[0];
type FilterMap = Exclude<FilterMapInput, Observable<unknown>>;

function reachableMap(relays: FilterMapInput): FilterMapInput {
  const keep = (map: FilterMap): FilterMap =>
    Object.fromEntries(Object.entries(map).filter(([url]) => !isUnreachableLocalRelay(url)));
  return isObservable(relays) ? relays.pipe(map(keep)) : keep(relays);
}

class ReadFirstPool extends RelayPool {
  /** Every one-shot read gets the app's completion rule unless the caller brings its own. */
  request(
    relays: Parameters<RelayPool["request"]>[0],
    filters: Parameters<RelayPool["request"]>[1],
    opts?: Parameters<RelayPool["request"]>[2],
  ): ReturnType<RelayPool["request"]> {
    return super.request(relays, filters, { complete: readComplete(relays), ...opts });
  }

  /**
   * A refused relay (see `refusingLocal`) is left out of a publish up front.
   * Reads fail it fast — they must, a read waits on every relay it asked — but
   * a publish waits seconds for a socket that is never going to open before it
   * counts the relay as failed.
   */
  publish(
    relays: Parameters<RelayPool["publish"]>[0],
    event: Parameters<RelayPool["publish"]>[1],
    opts?: Parameters<RelayPool["publish"]>[2],
  ): ReturnType<RelayPool["publish"]> {
    // The search relay is in the read fallbacks (lib/relays) but is an index, not a publish target.
    const targets = reachableRelays(relays);
    return super.publish(
      isObservable(targets)
        ? targets.pipe(map((urls) => urls.filter((u) => normalizeURL(u) !== SEARCH_RELAY)))
        : targets.filter((u) => normalizeURL(u) !== SEARCH_RELAY),
      event,
      opts,
    );
  }

  /**
   * Live subscriptions wait for a gated relay's login; see ReadFirstRelay.
   * And leave a refused relay out: a live subscription never finishes, so it
   * waits on nothing, and a refused socket in it would be retried with backoff
   * for the rest of the session.
   */
  subscription(
    relays: Parameters<RelayPool["subscription"]>[0],
    filters: Parameters<RelayPool["subscription"]>[1],
    options?: Parameters<RelayPool["subscription"]>[2],
  ): ReturnType<RelayPool["subscription"]> {
    return super.subscription(reachableRelays(relays), filters, { waitForAuth: true, ...options });
  }

  /** The same for per-relay filters, which `outboxSubscription` rides on too. */
  subscriptionMap(
    relays: Parameters<RelayPool["subscriptionMap"]>[0],
    options?: Parameters<RelayPool["subscriptionMap"]>[1],
  ): ReturnType<RelayPool["subscriptionMap"]> {
    return super.subscriptionMap(reachableMap(relays), { waitForAuth: true, ...options });
  }

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

/**
 * The socket a refused relay gets: one that fails the moment it is watched, as
 * a relay that cannot be reached does. Nothing touches the network.
 */
class RefusedSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly readyState = RefusedSocket.CLOSED;
  binaryType = "blob";
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  constructor(readonly url: string) {
    // After the caller has attached its handlers, as a real socket's errors are.
    setTimeout(() => {
      this.onerror?.({ type: "error" });
      this.onclose?.({ type: "close", code: 1006, reason: "local relay not chosen by the reader", wasClean: false });
    }, 0);
  }
  send(): void {}
  close(): void {}
}

type SocketCtor = RelayOptions["WebSocket"];

/**
 * The one door every socket goes through, so no route around it: a relay on
 * the reader's own device or LAN that they didn't choose (lib/localNetwork) is
 * refused here. Relay lists already drop such relays (`dedupeRelays`); this
 * catches every other way a URL arrives — a hint on an event, the provider
 * relay a kind-10040 names, `pool.relay(url)`. A refusal fails fast like any
 * unreachable relay, so reads finish on the relays that can answer.
 */
function refusingLocal(Socket: SocketCtor, refused: Set<string>): SocketCtor {
  if (!Socket) return Socket;
  return new Proxy(Socket, {
    construct(target, args: unknown[]) {
      const url = String(args[0]);
      if (!isUnreachableLocalRelay(url)) return Reflect.construct(target, args);
      refused.add(url);
      return new RefusedSocket(url);
    },
  });
}

/**
 * Consent changed: start over with every pooled relay whose answer flipped.
 * One refused before the reader chose it sits in the library's reconnect
 * backoff (not ready, for seconds to minutes) — dropping it means the next
 * read opens a fresh socket at once. One that lost consent (its account
 * signed out) has its open socket closed.
 */
function resyncConsent(pool: RelayPool, refused: Set<string>): void {
  for (const relay of [...pool.relays.values()]) {
    const was = refused.has(relay.url);
    if (was === isUnreachableLocalRelay(relay.url)) continue;
    refused.delete(relay.url);
    pool.remove(relay);
  }
}

/** The pool the app runs on, built once below; exposed so a test can build its own over a fake socket. */
export function createPool(options: RelayOptions = {}): RelayPool {
  // A one-shot read does not retry a relay whose socket will not connect —
  // the library's three retries with backoff kept an article waiting on an
  // author's `umbrel.local`. Live subscriptions keep their reconnects.
  /** The relays this pool handed a refused socket. */
  const refused = new Set<string>();
  const pool = new ReadFirstPool({
    keepAlive: KEEP_ALIVE_MS,
    requestReconnect: 0,
    ...options,
    WebSocket: refusingLocal(options.WebSocket ?? globalThis.WebSocket, refused),
  });
  onConsentChange(() => resyncConsent(pool, refused));
  return pool;
}

export const pool = createPool();

/** The app is back: every pooled relay, and every retry waiting on one, goes now. */
export function wakeRelays(target: RelayPool = pool): void {
  for (const relay of target.relays.values()) if (relay instanceof ReadFirstRelay) relay.wake();
  relayWake$.next();
}
