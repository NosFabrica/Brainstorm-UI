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
import {
  AuthRequiredError,
  Relay,
  RelayClosedError,
  RelayGroup,
  RelayPool,
  type GroupRequestCompleteOperator,
  type RelayOptions,
} from "applesauce-relay";
import { normalizeURL } from "applesauce-core/helpers/url";
import type { Filter as NostrFilter } from "applesauce-core/helpers/filter";
import {
  EMPTY,
  Subject,
  defer,
  filter,
  identity,
  isObservable,
  map,
  NEVER,
  concat,
  of,
  race,
  repeat,
  retry,
  scan,
  share,
  take,
  tap,
  throwError,
  timer,
  type Observable,
} from "rxjs";
import { isUnreachableLocalRelay, onConsentChange } from "./localNetwork";
import { answersFilters } from "./relayAnswers";
import { PROFILE_RELAYS, SEARCH_RELAY, SEARCH_RELAY_READ_TOKEN } from "./relays";

/**
 * How long an idle socket stays open, for the relays the app comes back to. The
 * library's 30s means a pause between two searches costs a fresh DNS + TCP +
 * TLS + upgrade (~0.5s desktop, more on mobile); a few minutes covers a reader
 * thinking between searches.
 *
 * Only for those: the search relay, the profile relays every fallback read
 * asks, and the reader's inbox relays (`keepRelayAlive`, from the DM
 * transport). An author's outbox or a note's relay hint is usually asked once;
 * holding each of those sockets open for five minutes kept dozens of them
 * idling on a phone after a feed had scrolled past. They get the library's 30s.
 */
const KEEP_ALIVE_MS = 5 * 60_000;

/** The relays whose sockets get `KEEP_ALIVE_MS`, normalized as the pool keys them. */
const kept = new Set<string>();
/** Seeded on first use rather than at module load: the relay sets are read when a socket is made. */
let seeded = false;
const longLived = (): Set<string> => {
  if (!seeded) {
    seeded = true;
    for (const url of [SEARCH_RELAY, ...PROFILE_RELAYS]) kept.add(normalizeURL(url));
  }
  return kept;
};

/** The library's own idle timeout, for everything else. */
const DEFAULT_KEEP_ALIVE_MS = 30_000;

/**
 * Hold this relay's socket open between reads for minutes, not seconds: one
 * the reader keeps coming back to (their inbox relay). Applies to a socket
 * already open as well as to one opened later.
 */
export function keepRelayAlive(url: string, target: RelayPool = pool): void {
  const normalized = normalizeURL(url);
  longLived().add(normalized);
  const relay = target.relays.get(normalized);
  if (relay) relay.keepAlive = KEEP_ALIVE_MS;
}

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

/**
 * purplepag.es indexes profiles and lists, nothing else: asked on 2026-11-23,
 * it answered kinds 0, 3, 10000, 10002, 10040 and 10050, and nothing for 1, 6,
 * 7, 20, 30000, 30002, 30023, 30078, 30311, 30402 or 39999; a filter with no
 * kinds (an id lookup) it refuses outright. It is one of `PROFILE_RELAYS`, so
 * every read that merges those in — an author's notes, live streams, profile
 * prefs, an event by id — asked it questions it never answers: about one REQ
 * in ten on a profile page.
 */
const PROFILE_INDEX = normalizeURL("wss://purplepag.es/");

/** Whether purplepag.es can answer the filter: kinds only, and each a profile, a contact list or a replaceable list. */
export function profileIndexAnswers(filter: OneFilter): boolean {
  const kinds = (filter as { kinds?: number[] }).kinds;
  return !!kinds?.length && kinds.every((k) => k === 0 || k === 3 || (k >= 10_000 && k < 20_000));
}

/** The filters purplepag.es can answer; null when none (a live list of filters is passed as it is). */
function forProfileIndex(filters: ReqFilters): ReqFilters | null {
  if (isObservable(filters)) return filters;
  const all = Array.isArray(filters) ? (filters as OneFilter[]) : [filters as OneFilter];
  const kept = all.filter(profileIndexAnswers);
  if (!kept.length) return null;
  return (kept.length === all.length ? filters : kept) as ReqFilters;
}

/**
 * An `auth-required:` refusal, wherever the relay put the prefix. NIP-01 puts it
 * first; strfry sends `ERROR: auth-required: requested filter requires
 * authentication` (relay.mwaters.net, 2026-11-08), and the library — which reads
 * the prefix at index 0, case-sensitively — took that for a clean close, while a
 * lowercase `error: auth-required: …` it reads as a plain error.
 */
const AUTH_REQUIRED = /(^|[\s:])auth-required:/i;

/** Whether a CLOSED (or OK) reason asks for a NIP-42 login, in any of the spellings relays use. */
export function isAuthRequiredReason(reason: string | undefined): boolean {
  return !!reason && AUTH_REQUIRED.test(reason);
}

type ReqOptions = NonNullable<Parameters<Relay["req"]>[1]>;
type ReqMessages = ReturnType<Relay["req"]>;
type ReqMessage = ReqMessages extends Observable<infer M> ? M : never;

/**
 * Drop every EVENT the relay sent that its REQ didn't ask for. applesauce-relay
 * passes on whatever arrives on a subscription id, so a relay asked for
 * `{ authors: [me], kinds: [3] }` could answer with another key's contact list,
 * and every "newest wins" read (requestNewest, pickAuthoritativeBase,
 * fetchTrustProviderList) would take it for the user's own. The filters are the
 * ones the library reports sending, on its OPEN frame — so a live REQ whose
 * filters change is judged by the filters now on the wire.
 */
function onlyWhatWasAsked(source: ReqMessages): ReqMessages {
  return defer(() => {
    let asked: NostrFilter[] | undefined;
    return source.pipe(
      filter((message: ReqMessage) => {
        if (message.type === "OPEN") asked = message.filters as NostrFilter[];
        if (message.type !== "EVENT") return true;
        return !!asked && answersFilters(asked, message.event);
      }),
    );
  }) as ReqMessages;
}

/** How many times a live REQ is asked again after the relay CLOSEs it; the library's `resubscribe` shape. */
function resubscribeCount(resubscribe: ReqOptions["resubscribe"]): number {
  if (resubscribe === undefined || resubscribe === false) return 0;
  if (resubscribe === true) return Infinity;
  if (typeof resubscribe === "number") return resubscribe;
  return resubscribe.count ?? Infinity;
}

class ReadFirstRelay extends Relay {
  /**
   * Every read — `request` and `subscription` included — comes through here.
   * One-shot reads never wait for a login; live ones do, and are asked again
   * by [liveReq]'s rules rather than the library's.
   */
  req(filters: ReqFilters, opts?: ReqOptions): ReqMessages {
    if (normalizeURL(this.url) === PROFILE_INDEX) {
      const answerable = forProfileIndex(filters);
      // Nothing it can answer: done at once, as an EOSE, so a read waiting on
      // every relay asked (everyAskedRelayDone) doesn't wait on this one — and
      // a live one stays open, silent, as the relay itself would.
      if (!answerable) {
        const done = of({ type: "EOSE", from: this.url, id: "profile-index-skip" } as const);
        return (opts?.waitForAuth ? concat(done, NEVER) : done) as ReqMessages;
      }
      filters = answerable;
    }
    const asked = this.url === SEARCH_RELAY ? withSearchToken(filters) : filters;
    if (opts?.waitForAuth) return this.liveReq(asked, opts);
    return onlyWhatWasAsked(super.req(asked, { ...opts, waitForAuth: false })).pipe(
      // A refusal the library didn't recognise still tells services/relayAuth to log in.
      tap((message) => {
        if (message.type === "CLOSED" && isAuthRequiredReason(message.reason)) this.flagAuthRequired();
      }),
    );
  }

  subscription(
    filters: Parameters<Relay["subscription"]>[0],
    opts?: Parameters<Relay["subscription"]>[1],
  ): ReturnType<Relay["subscription"]> {
    return super.subscription(filters, { waitForAuth: true, ...opts });
  }

  /** What the library does on a well-formed refusal: services/relayAuth answers the challenge. */
  private flagAuthRequired(): void {
    if (!this.receivedAuthRequiredForReq.value) this.receivedAuthRequiredForReq.next(true);
  }

  /**
   * A REQ that lives until it is unsubscribed, asked again by two rules:
   *
   * - **Refused before we have logged in**: no delay — wait for the login
   *   (services/relayAuth answers the challenge) and ask again the moment it
   *   lands. A relay refusing the first REQ until we log in is NIP-42's
   *   normal order, not a failure. A login that never happens (no signer, a
   *   reader who said no, a relay that rejects it) leaves the REQ waiting,
   *   sending nothing.
   * - **Refused after a login, or CLOSEd for any other reason**: logging in
   *   again changes nothing, so back off — 1s, 2s, … 30s, cut short when the
   *   app comes back — and start over from 1s once the relay answers (an
   *   EVENT or EOSE).
   *
   * The library's own rules asked again at once in both cases — after a
   * refusal it didn't recognise (`ERROR: auth-required: …`), and after a
   * well-formed one from a relay we had already logged in to — so a relay
   * that keeps refusing got one REQ per round trip for as long as the tab was
   * open: thousands a minute.
   */
  private liveReq(filters: ReqFilters, opts: ReqOptions): ReqMessages {
    const backoff = wakeableBackoff();
    const times = resubscribeCount(opts.resubscribe);
    /** Refusals and closes since the relay last answered; drives the backoff. */
    let strikes = 0;
    /** Whether the REQ now on the wire went out on a logged-in connection. */
    let sentLoggedIn = false;
    /** Whether the last attempt ended in the relay's CLOSED (not an unsubscribe). */
    let closedByRelay = false;
    const askOnce = defer(() =>
      this.waitForAuth(
        this.authRequiredForRead$,
        defer(() => {
          sentLoggedIn = this.authenticated;
          closedByRelay = false;
          return onlyWhatWasAsked(super.req(filters, { ...opts, waitForAuth: false, resubscribe: undefined }));
        }),
      ),
    );
    return askOnce.pipe(
      map((message) => {
        if (message.type === "EVENT" || message.type === "EOSE") strikes = 0;
        if (message.type === "CLOSED") {
          if (isAuthRequiredReason(message.reason)) throw new AuthRequiredError(message.reason);
          closedByRelay = true;
        }
        return message;
      }),
      retry({
        delay: (error: unknown) => {
          const reason = error instanceof RelayClosedError ? error.reason : undefined;
          // `restricted:`, `blocked:` and the rest end the subscription, as before.
          if (!(error instanceof AuthRequiredError) && !isAuthRequiredReason(reason)) return throwError(() => error);
          this.flagAuthRequired();
          // Not logged in yet: askOnce waits for the login, so go straight back to it.
          if (!sentLoggedIn) return of(null);
          return backoff(error, ++strikes);
        },
      }),
      // `repeat({ count: 0 })` would empty the stream, not just not repeat it.
      times > 0
        ? repeat({ count: times, delay: () => (closedByRelay ? backoff(undefined, ++strikes) : EMPTY) })
        : identity,
      share(),
    );
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
 * A relay outside the pool (lib/searchRelay's side sockets) that still drops
 * what its REQs didn't ask for — the one rule here that holds for every read,
 * whichever socket it rides.
 */
class AskedOnlyRelay extends Relay {
  req(filters: ReqFilters, opts?: ReqOptions): ReqMessages {
    return onlyWhatWasAsked(super.req(filters, opts));
  }
}

/** A socket of its own, outside the pool, under the pool's rule on answers. */
export function standaloneRelay(url: string, options?: RelayOptions): Relay {
  return new AskedOnlyRelay(url, options);
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
    // Read when the socket goes idle, so set it per relay (see KEEP_ALIVE_MS).
    // A pool built with its own `keepAlive` (a test's) keeps it for all.
    if (this.options?.keepAlive === undefined)
      relay.keepAlive = longLived().has(url) ? KEEP_ALIVE_MS : DEFAULT_KEEP_ALIVE_MS;
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
