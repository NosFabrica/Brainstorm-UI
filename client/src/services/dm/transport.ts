/**
 * The DM engine's sockets: the app's one relay pool, per relay, because both
 * subscriptions are tracked relay by relay.
 *
 * Inbox relays commonly refuse to hand out wraps until the reader logs in
 * (NIP-42) — that is what keeps someone else from downloading your inbox. The
 * live subscription waits for that login (the pool's subscriptions do); history
 * pages don't, and report `auth` instead so the pager can park the relay until
 * services/relayAuth signs in, with the reader's consent. Publishing is the
 * same: many inbox relays only take a wrap from a signed-in sender, so a send
 * refused with `auth-required` waits briefly for that login and tries again.
 */
import { AuthRequiredError, RelayClosedError } from "applesauce-relay";
import {
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  of,
  Subscription,
  timeout,
  type Observable,
} from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { pool } from "@/lib/relayPool";
import { allowWriteAuth } from "@/services/relayAuth";
import type { DmTransport, PublishResult } from "./engine";

/** How long a refused publish waits for services/relayAuth to sign in. */
const AUTH_WAIT_MS = 6000;

/** A state observable's current value — the library's are BehaviorSubjects underneath. */
function now<T>(state$: Observable<T>, fallback: T): T {
  let value = fallback;
  state$.subscribe((v) => (value = v)).unsubscribe();
  return value;
}

const reasonOf = (error: unknown) =>
  error instanceof RelayClosedError ? error.reason : error instanceof Error ? error.message : String(error);

export const poolTransport: DmTransport = {
  live(url, f, handlers) {
    const relay = pool.relay(url);
    const sub = relay.subscription([f], { reconnect: Infinity, resubscribe: Infinity }).subscribe({
      next: (message) => (message === "EOSE" ? handlers.onEose() : handlers.onEvent(message as NostrEvent)),
      error: () => handlers.onAuthRequired(false),
    });
    const auth = combineLatest([relay.authRequiredForRead$, relay.authenticated$])
      .pipe(
        map(([required, authed]) => required && !authed),
        distinctUntilChanged(),
      )
      .subscribe((needs) => handlers.onAuthRequired(needs));
    const drops = relay.connected$
      .pipe(
        distinctUntilChanged(),
        filter((up) => !up),
      )
      .subscribe(() => handlers.onDisconnected?.());
    return () => {
      sub.unsubscribe();
      auth.unsubscribe();
      drops.unsubscribe();
    };
  },

  page(url, f, handlers) {
    let finished = false;
    const sub = pool
      .relay(url)
      .req([f], { waitForAuth: false })
      .subscribe({
        next: (message) => {
          if (finished) return;
          if (message.type === "EVENT") handlers.onEvent(message.event);
          else if (message.type === "EOSE") {
            finished = true;
            handlers.onEose();
          } else if (message.type === "CLOSED") {
            finished = true;
            handlers.onClosed(message.reason, message.reason.startsWith("auth-required"));
          }
        },
        error: (error: unknown) => {
          if (finished) return;
          finished = true;
          handlers.onClosed(reasonOf(error), error instanceof AuthRequiredError);
        },
      });
    return () => sub.unsubscribe();
  },

  async publish(url, event) {
    const relay = pool.relay(url);
    const once = async (): Promise<PublishResult> => {
      // Already told to sign in on this connection: the library would hold the
      // event for that login, then report a bare "Timeout" — say so at once.
      if (now(relay.authRequiredForPublish$, false) && !relay.authenticated)
        return { ok: false, message: "auth-required: sign in to publish", auth: true };
      // Whether the socket was open at any point: a relay that never connected
      // didn't refuse anything. The relay's state answers that, not the type of
      // what was thrown — a relay in reconnect backoff fails as a plain timeout.
      let connected = false;
      // A relay that says nothing in an OK sometimes says why in a NOTICE.
      // NOTICEs aren't tied to an event, so it is kept only as a hint for silence.
      let notice: string | undefined;
      const watch = new Subscription();
      watch.add(relay.connected$.subscribe((up) => (connected ||= up)));
      watch.add(relay.notice$.subscribe((text) => (notice = text)));
      const silence = (error?: unknown): PublishResult => {
        if (!connected) return { ok: false, message: "Could not connect", unreachable: true };
        // The socket closed under us (a CloseEvent, not an Error): the relay may have it.
        if (error !== undefined && !(error instanceof Error))
          return { ok: false, message: "Connection lost", dropped: true };
        // Anything but our own wait running out is the library's words, kept as they are.
        if (error instanceof Error && error.message !== "Timeout") return { ok: false, message: error.message };
        return { ok: false, message: "Timeout", ...(notice ? { notice } : {}) };
      };
      try {
        // No library retry: an `auth-required` answer has to come back to us as
        // one, not as a "Timeout" after the retries wait on a login.
        const result = await relay.publish(event, { timeout: 10_000, retries: false });
        if (result.ok) return { ok: true, message: result.message };
        // The library's own wait running out comes back dressed as an answer.
        return result.message === "Timeout" ? silence() : { ok: false, message: result.message };
      } catch (error) {
        if (error instanceof RelayClosedError)
          return { ok: false, message: error.reason, auth: error instanceof AuthRequiredError };
        return silence(error);
      } finally {
        watch.unsubscribe();
      }
    };
    const first = await once();
    if (!first.auth) return first;
    // This relay may now be answered (services/relayAuth) — for messages only.
    allowWriteAuth(relay.url);
    // Refused although signed in: a login won't change that.
    if (relay.authenticated) return { ok: false, message: first.message };
    // Recipients' inbox relays often take wraps only from a signed-in sender.
    // services/relayAuth answers the challenge if the reader allowed it; give
    // that a moment, then try once more.
    const signedIn = await firstValueFrom(
      relay.authenticated$.pipe(
        filter((yes) => yes),
        timeout({ first: AUTH_WAIT_MS, with: () => of(false) }),
      ),
    );
    return signedIn ? once() : first;
  },

  onAuthenticated(url, callback) {
    const sub = pool
      .relay(url)
      .authenticated$.pipe(
        distinctUntilChanged(),
        filter((yes) => yes),
      )
      .subscribe(() => callback());
    return () => sub.unsubscribe();
  },
};
