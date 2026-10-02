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
import { combineLatest, distinctUntilChanged, filter, firstValueFrom, map, of, timeout } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { pool } from "@/lib/relayPool";
import { allowWriteAuth } from "@/services/relayAuth";
import type { DmTransport } from "./engine";

/** How long a refused publish waits for services/relayAuth to sign in. */
const AUTH_WAIT_MS = 6000;

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
    const once = async () => {
      try {
        // No library retry: an `auth-required` answer has to come back to us as
        // one, not as a "Timeout" after the retries wait on a login.
        const result = await relay.publish(event, { timeout: 10_000, retries: false });
        return { ok: result.ok, message: result.message };
      } catch (error) {
        return { ok: false, message: reasonOf(error), auth: error instanceof AuthRequiredError };
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
