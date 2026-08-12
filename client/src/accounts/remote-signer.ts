/**
 * NIP-46, hardened.
 *
 * One Account type for every remote signer: nsec.app, Amber's bunker mode,
 * Keycast and anything self-hosted all arrive here, and their differences are
 * absorbed at transport rather than by branching the UI.
 *
 * Three things the library gets wrong and this module fixes, each one a way a
 * real signer breaks a spec-legal client:
 *
 * - **No request ever times out.** `makeRequest` returns a bare deferred, and
 *   Amber answers a request it hasn't been told to remember with an Android
 *   notification and *no wire response at all*. A missed notification would
 *   otherwise hang that promise for the life of the tab.
 * - **A bare `"ack"` is accepted as proof of pairing.** NIP-46 makes validating
 *   the `secret` we issued a MUST, precisely because our `nostrconnect://` URI is
 *   public — it's on screen in a QR and it travels through relays. Any observer
 *   could answer `{"result":"ack"}` and become our signer.
 * - **`onAuth` opens a popup from a relay callback.** No user gesture, so blockers
 *   eat it silently, and nsec.app uses `auth_url` for *every* un-permissioned
 *   request. The prompt is replaced with a link the user clicks.
 */
import {
  NostrConnectAccount,
  type NostrConnectAccountSignerData,
} from "applesauce-accounts/accounts";
import { BaseAccount, type SerializedAccount } from "applesauce-accounts";
import { hexToBytes, type NostrEvent } from "applesauce-core/helpers/event";
import { getHiddenContent } from "applesauce-core/helpers";
import { normalizeRelayUrl } from "applesauce-core/helpers/relays";
import {
  NostrConnectSigner,
  PrivateKeySigner,
  type NostrConnectSignerOptions,
} from "applesauce-signers";
import { isNIP04 } from "applesauce-signers/helpers/encryption";
import {
  buildSigningPermissions,
  createNostrConnectURI,
  type NostrConnectAppMetadata,
} from "applesauce-signers/helpers/nostr-connect";
import { BehaviorSubject } from "rxjs";

import { env } from "@/lib/runtimeEnv";
import type { AccountMetadata } from "./metadata";
import { requestSignerApproval } from "./signer-approval";

/**
 * nsec.app parses our `relay=` parameters away and answers only here, whatever we
 * ask for — so pairing *with nsec.app* means hearing this relay.
 *
 * Nearly removed on 2026-08-11, and worth recording why it stayed. It was
 * unreachable from the network we tested on, and that alone broke pairing with a
 * *different* signer entirely: the library will not hand back a response until
 * the publish has finished on every relay in the set, so this one burned its full
 * 30s `publishTimeout` on every request and tripped our own 30s deadline — which
 * the user was shown as "your signer didn't respond", about a signer that had
 * answered in 329ms.
 *
 * The fix belonged in the transport, not here: `installRemoteTransport` now
 * releases a request as soon as *one* relay accepts it. A relay nobody can reach
 * costs a background retry loop and nothing else, so hearing this one is cheap
 * again — and leaving it out would silently strand the most popular web signer.
 */
export const NSEC_APP_RELAY = "wss://relay.nsec.app";

/**
 * Where a deployment that never configured its own relay pairs. One of Amber's
 * three shipped bunker defaults, so it demonstrably forwards kind 24133 — and it
 * is already in this app's profile set, so it is known reachable from here.
 */
export const FALLBACK_NIP46_RELAY = "wss://relay.primal.net";

/**
 * What the `nostrconnect://` URI names: this deployment's own relay, and nothing
 * else. It is the one we know is up, it carries no write policy and doesn't
 * store ephemeral events, and naming only it keeps a signer's traffic — which
 * relay operators can see as "this client pubkey is talking to this signer
 * pubkey, now" even though the payloads are encrypted — off third parties.
 *
 * Deliberately *not* `PROFILE_RELAYS`: five long-lived NIP-46 subscriptions is
 * heavier than the job needs, and a long URI makes a denser QR.
 *
 * A `bunker://` pairing never reaches here — those relays come from the URI the
 * signer generated, and we are not the ones choosing.
 */
export function advertisedRelays(): string[] {
  const configured = env.VITE_NIP85_RELAY_URL.trim().replace(/\/+$/, "");
  // A deployment that configures `http://…` gets it back unchanged from
  // `RelayPool.relay()` — that only runs `normalizeURL`, never
  // `ensureWebSocketURL` — and `new WebSocket()` then throws on the scheme,
  // taking NIP-46 down with it. Fix the scheme here, where the value enters.
  return [safeRelayURL(configured) ?? FALLBACK_NIP46_RELAY];
}

/** `ws(s)://` or nothing. An unparseable configured value must not be advertised. */
function safeRelayURL(configured: string): string | null {
  if (!configured) return null;
  try {
    return normalizeRelayUrl(configured);
  } catch {
    return null;
  }
}

/**
 * Where we listen for a signer: the relay we advertise, and nothing else.
 *
 * `NSEC_APP_RELAY` was in here so nsec.app could be paired by QR at all — it
 * ignores our `relay=` and answers only on its own. Removed 2026-08-12: it is
 * unreachable from at least one real deployment's network, where it produced a
 * permanent background reconnect loop and, before the transport was fixed, took
 * every signer down with it. Carrying a relay that fails for everyone to serve
 * one signer is the wrong trade.
 *
 * What it costs: nsec.app can no longer be paired by `nostrconnect://`. It can
 * still be paired by pasting a `bunker://` link, which brings its own relays —
 * and `followSignerRelays` now moves us onto whatever a signer names, so that
 * route needs nothing from this list.
 */
export function subscribeRelays(): string[] {
  return advertisedRelays();
}

/**
 * Every kind this app will ever ask a remote signer to sign. NIP-46 has no way
 * to request more permissions later — `connect`'s third parameter is the only
 * lever there is — and under Amber's default sign policy anything omitted here
 * becomes a notification its owner may never see.
 */
export const SIGNED_KINDS = [
  0, // profile
  3, // follows
  5, // deletion, for undoing a report
  1984, // report
  9734, // zap request
  10000, // mute list
  10002, // relay list
  10040, // NIP-85 provider declaration
  22242, // Brainstorm login challenge
  24242, // Blossom upload auth
  27235, // NIP-98 HTTP auth
  30078, // NIP-78 app data
];

/**
 * `buildSigningPermissions` emits `get_public_key` and one `sign_event:<kind>`
 * per kind, and nothing else — the encryption methods have to be appended by
 * hand. They are not padding: the alert-preference list is NIP-44 encrypted to
 * the user's own key, so the first visit to settings needs them.
 */
export const NIP46_PERMISSIONS = [
  ...buildSigningPermissions(SIGNED_KINDS),
  "nip44_encrypt",
  "nip44_decrypt",
];

/** Long enough to walk to your phone, find the app and read the screen. */
export const PAIRING_TIMEOUT_MS = 3 * 60_000;

/** Short enough that a missed notification is reported rather than waited on. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Longer, because `connect` is the one call that can be waiting on a person: a
 * `bunker://` pairing puts an approval screen in front of them, and a signer
 * that has been re-paired since asks again.
 */
export const CONNECT_TIMEOUT_MS = 90_000;

/**
 * What the signer shows its owner while they decide. This is the only trust
 * surface the handshake has, and it is not optional: nsec.app rejects a URI
 * carrying none of `name`/`url`/`image` outright, as "Bad connection string".
 *
 * The URL matters more than it looks — nsec.app stores an empty name and icon on
 * approval and identifies us by origin and favicon from then on.
 */
export function appMetadata(): NostrConnectAppMetadata {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://brainstorm.world";
  return {
    name: "Brainstorm",
    url: origin,
    image: `${origin}/favicon-192.png`,
  };
}

/** A request the signer never answered. Distinct from one it declined. */
export class RemoteSignerTimeoutError extends Error {
  constructor(message = "Your signer didn't respond.") {
    super(message);
    this.name = "RemoteSignerTimeoutError";
  }
}

export function isRemoteSignerTimeout(error: unknown): boolean {
  return (
    error instanceof RemoteSignerTimeoutError ||
    (error as { name?: string })?.name === "RemoteSignerTimeoutError"
  );
}

/**
 * Give a promise a deadline. The loser keeps its handler — `Promise.race`
 * attaches one to both — so a signer answering after we gave up is dropped
 * rather than surfacing as an unhandled rejection.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RemoteSignerTimeoutError(message)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export type RemoteSignerOptions = NostrConnectSignerOptions & {
  /**
   * We issued the `secret` and are waiting for it back, so a bare `"ack"` proves
   * nothing. True for a `nostrconnect://` pairing; false where the signer's own
   * `bunker://` URI already named its pubkey and there is nobody to impersonate.
   */
  requireConnectSecret?: boolean;
};

/**
 * The signer every remote Account holds.
 *
 * The overrides are all of it: a deadline on every round trip, and a pairing
 * that only completes when the secret we minted comes back.
 */
export class RemoteSigner extends NostrConnectSigner {
  readonly requireConnectSecret: boolean;

  /**
   * Raised when we turn a pairing answer away for proving itself with a bare
   * `"ack"`.
   *
   * It exists because the refusal is otherwise invisible: dropping the event
   * leaves `waitForSigner` pending, and three minutes later the deadline fires
   * and the screen says the signer never answered — which is a lie, and one that
   * cost a long debugging session on 2026-08-11 before the wire showed the reply
   * sitting in the relay.
   *
   * A stream rather than a flag because the screen has to hear it *as it
   * happens*; a value only read at the deadline is three minutes too late to be
   * of use to anyone.
   */
  readonly ackRefused$ = new BehaviorSubject(false);

  get ackRefused(): boolean {
    return this.ackRefused$.value;
  }

  constructor(options: RemoteSignerOptions) {
    super({ onAuth: requestSignerApproval, ...options });
    this.requireConnectSecret = options.requireConnectSecret ?? false;
  }

  /**
   * Drop a bare `"ack"` while we're still waiting on a pairing we started.
   * Everything else — including the real acknowledgement, which carries the
   * secret — goes through untouched.
   *
   * NIP-46 requires this. In the `nostrconnect://` flow `secret` is *required*,
   * and the obligation is ours, at MUST level: "`secret` value MUST be provided
   * to avoid connection spoofing, client MUST validate the `secret` returned by
   * `connect` response." The library checks `result === "ack" || result ===
   * connectSecret`, which passes anything — so the validation has to live here.
   *
   * The attack the spec is naming: our URI is public — on screen as a QR, and
   * travelling through relays — so anyone who sees it can answer `"ack"` and be
   * adopted as our signer. They never learn the user's key; what they gain is the
   * app signed in as *their* pubkey.
   *
   * `bunker://` is deliberately exempt (`requireConnectSecret` false): there the
   * secret is optional and only SHOULD-level, and the signer named its own pubkey
   * in the URI, so there is nobody to impersonate.
   */
  async handleEvent(event: NostrEvent): Promise<void> {
    if (this.requireConnectSecret && !this.remote) {
      const response = await this.readResponse(event);
      // The secret is a nanoid, so it is never the literal "ack" — this drops
      // exactly the acknowledgement that proves nothing.
      if (response?.result === "ack") {
        this.ackRefused$.next(true);
        return;
      }
    }
    return super.handleEvent(event);
  }

  /** The payload of an incoming event, or null where it isn't ours to read. */
  protected async readResponse(event: NostrEvent): Promise<{ result?: string } | null> {
    try {
      const content =
        getHiddenContent(event) ??
        (isNIP04(event.content)
          ? await this.signer.nip04.decrypt(event.pubkey, event.content)
          : await this.signer.nip44.decrypt(event.pubkey, event.content));
      return content ? JSON.parse(content) : null;
    } catch {
      return null;
    }
  }

  connect(bunkerSecret?: string, permissions?: string[]): Promise<string> {
    return withTimeout(
      super.connect(bunkerSecret, permissions ?? NIP46_PERMISSIONS),
      CONNECT_TIMEOUT_MS,
      "Your signer didn't answer the connection request.",
    );
  }

  getPublicKey(): Promise<string> {
    return withTimeout(super.getPublicKey(), REQUEST_TIMEOUT_MS);
  }

  signEvent(template: Parameters<NostrConnectSigner["signEvent"]>[0]) {
    return withTimeout(super.signEvent(template), REQUEST_TIMEOUT_MS);
  }

  ping(): Promise<"pong"> {
    return withTimeout(super.ping(), REQUEST_TIMEOUT_MS);
  }

  /**
   * Ask where the signer wants to be reached — with the two guards the base
   * implementation is missing.
   *
   * **A deadline**, like every other round trip here. A signer that ignores an
   * unknown method rather than answering leaves `makeRequest`'s deferred pending
   * forever, and a caller's `try/catch` cannot help because nothing ever rejects.
   * Amber does exactly this for methods it doesn't recognise.
   *
   * **Still connected afterwards.** A successful switch restarts the
   * subscription, and `close()` clears `isConnected` while `open()` never puts it
   * back — so the next call would go through `requireConnection()` and re-send
   * the single-use bunker secret, which is the `invalid secret` failure of
   * ticket 27. Amber is the one signer that implements this, so it would fire on
   * precisely the signer the feature exists for.
   */
  async switchRelays(): Promise<string[] | null> {
    const result = await withTimeout(super.switchRelays(), REQUEST_TIMEOUT_MS);
    this.isConnected = true;
    return result;
  }

  /**
   * Every request, including the last one. The library closes the subscription
   * in a `finally` *after* awaiting the `logout` round trip — so against a signer
   * that has stopped answering it never gets there, and the connection we were
   * trying to end outlives the Account for the rest of the tab.
   */
  async logout(): Promise<void> {
    try {
      await withTimeout(super.logout(), REQUEST_TIMEOUT_MS);
    } finally {
      await this.close();
    }
  }

  // The nip04/nip44 objects the base constructor builds bind these through the
  // prototype chain, so overriding here covers both.
  nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return withTimeout(super.nip04Encrypt(pubkey, plaintext), REQUEST_TIMEOUT_MS);
  }
  nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return withTimeout(super.nip04Decrypt(pubkey, ciphertext), REQUEST_TIMEOUT_MS);
  }
  nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return withTimeout(super.nip44Encrypt(pubkey, plaintext), REQUEST_TIMEOUT_MS);
  }
  nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return withTimeout(super.nip44Decrypt(pubkey, ciphertext), REQUEST_TIMEOUT_MS);
  }

  /**
   * The URI we hand to the signer — built here rather than taken from
   * `getNostrConnectURI()`, which emits whatever is in `relays` and would
   * therefore advertise the relay we only *listen* on.
   */
  nostrConnectURI(relays = advertisedRelays()): string {
    return createNostrConnectURI({
      client: this.clientPubkey,
      connectSecret: this.connectSecret,
      relays,
      metadata: { ...appMetadata(), permissions: NIP46_PERMISSIONS },
    });
  }
}

/**
 * The Account behind a remote signer.
 *
 * The library's own type is kept — the serialised form and the `"nostr-connect"`
 * type string are identical — so this is only about which Signer class comes back
 * out of storage.
 */
export class RemoteAccount<Metadata = AccountMetadata> extends NostrConnectAccount<Metadata> {
  declare signer: RemoteSigner;

  static fromJSON<Metadata = AccountMetadata>(
    json: SerializedAccount<NostrConnectAccountSignerData, Metadata>,
  ): RemoteAccount<Metadata> {
    const signer = new RemoteSigner({
      relays: json.signer.relays,
      pubkey: json.pubkey,
      remote: json.signer.remote,
      bunkerSecret: json.signer.bunkerSecret,
      signer: new PrivateKeySigner(hexToBytes(json.signer.clientKey)),
    });

    // This pairing already happened. `isConnected` is in-memory only, and every
    // operation runs through `requireConnection()`, which re-pairs when it is
    // false — so without this a restored Account tries to `connect` again before
    // its first request, and *cannot* succeed: NIP-46 makes a bunker secret
    // single-use, so the signer answers `invalid secret` (Amber: `already
    // connected`). It broke every reload and every account switch.
    //
    // Opening is not optional and does not come for free with the flag: `open()`
    // is what subscribes to the signer's replies, and the only callers are
    // `connect()` and `waitForSigner()`. Skipping the spurious connect without
    // this would leave a signer that publishes requests and can never hear the
    // answers — every one of them timing out at 30s.
    //
    // If the signer really has forgotten us, the request that follows fails on
    // its own and `signer-liveness` calls it unreachable — which is the honest
    // answer, and a far better one than a pairing error nobody can act on.
    signer.isConnected = true;
    // `open()` sets `listening` before it awaits, so a throw leaves the flag set
    // and every later `open()` returns early — the exact mute signer this line
    // exists to prevent, plus an unhandled rejection. Put it back.
    signer.open().catch(() => {
      signer.listening = false;
    });

    return BaseAccount.loadCommonFields(new RemoteAccount<Metadata>(json.pubkey, signer), json);
  }
}
