/**
 * The DM engine's sockets: the app's one relay pool, per relay, because both
 * subscriptions are tracked relay by relay.
 *
 * Inbox relays commonly refuse to hand out wraps until the reader logs in
 * (NIP-42) — that is what keeps someone else from downloading your inbox. The
 * live subscription waits for that login (the pool's subscriptions do); history
 * pages don't, and report `auth` instead so the pager can park the relay until
 * services/relayAuth signs in, with the reader's consent.
 */
import { AuthRequiredError, RelayClosedError } from "applesauce-relay";
import { combineLatest, distinctUntilChanged, filter, map } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { pool } from "@/lib/relayPool";
import type { DmTransport } from "./engine";

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
    return () => {
      sub.unsubscribe();
      auth.unsubscribe();
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
    try {
      const result = await pool.relay(url).publish(event, { timeout: 10_000 });
      return { ok: result.ok, message: result.message };
    } catch (error) {
      return { ok: false, message: reasonOf(error) };
    }
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
