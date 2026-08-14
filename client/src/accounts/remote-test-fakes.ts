/**
 * A remote signer, in memory.
 *
 * NIP-46 is two keypairs talking over a relay, so a fake relay plus a fake
 * signer is enough to exercise every path the real thing has — the pairing
 * handshake, the secret that proves it, the requests afterwards, and the two
 * failure modes that matter most: a signer that answers with an error string,
 * and one that says nothing at all.
 */
import type { NostrEvent } from "applesauce-core/helpers/event";
import { PrivateKeySigner, type NostrPool } from "applesauce-signers";
import { parseNostrConnectURI } from "applesauce-signers/helpers/nostr-connect";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { Subject } from "rxjs";

export const NOSTR_CONNECT_KIND = 24133;

export type FakeRemoteSigner = {
  /** The pool a client talks to us over. */
  pool: NostrPool;
  /** The identity we sign for. */
  userPubkey: string;
  /** Our own pubkey, as it appears in a `bunker://` URI. */
  remotePubkey: string;
  /** A `bunker://` URI naming us, for the paste route. */
  bunkerURI(options?: { secret?: string; relays?: string[] }): string;
  /** Answer a `nostrconnect://` URI, as a signer does once its owner approves. */
  pair(uri: string): Promise<void>;
  /** Answer a pairing with a bare `"ack"` — what a relay observer can forge. */
  forgeAck(uri: string): Promise<void>;
  /** Answer with a bare `"ack"` as the real signer does — Amethyst's behaviour. */
  ackAsSigner(uri: string): Promise<void>;
  /** Fail the next request of this method with this error string. */
  failWith(method: string, error: string): void;
  /**
   * Answer the next request of this method with NIP-46's `auth_url` — "approve
   * this in a browser first" — and then answer it properly, as a signer does
   * once its owner has. nsecbunker and nsec.app both work this way.
   */
  demandAuth(method: string, url: string): void;
  /** Say nothing at all, as Amber does for an un-remembered request. */
  goSilent(): void;
  /**
   * Ignore just this method, as Amber does for ones it doesn't recognise —
   * which is not the same as answering with an error, and is the case a caller's
   * try/catch cannot see.
   */
  swallow(method: string): void;
  /**
   * Answer `switch_relays` with these, as Amber does — it replies with its own
   * defaults and rewrites the stored connection. Unset, the method is refused
   * with "Unrecognized method", which is nsec.app's behaviour.
   */
  wantsRelays(relays: string[]): void;
  /** Requests we've been sent, in order. */
  received: { method: string; params: string[] }[];
};

export function createFakeRemoteSigner(): FakeRemoteSigner {
  const remoteKey = generateSecretKey();
  const remotePubkey = getPublicKey(remoteKey);
  const userKey = generateSecretKey();
  const userPubkey = getPublicKey(userKey);
  const remote = new PrivateKeySigner(remoteKey);

  const wire = new Subject<NostrEvent>();
  const received: { method: string; params: string[] }[] = [];
  const failures = new Map<string, string>();
  const auths = new Map<string, string>();
  let silent = false;

  async function sendAs(key: Uint8Array, client: string, payload: unknown): Promise<void> {
    const content = await new PrivateKeySigner(key).nip44.encrypt(client, JSON.stringify(payload));
    wire.next(
      finalizeEvent(
        {
          kind: NOSTR_CONNECT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", client]],
          content,
        },
        key,
      ) as NostrEvent,
    );
  }

  const send = (client: string, payload: unknown) => sendAs(remoteKey, client, payload);

  /** Set to make the signer ask us to move; unset, `switch_relays` is refused. */
  let preferredRelays: string[] | null = null;
  const swallowed = new Set<string>();

  /**
   * One event id is one request, however many relays carry it. The transport
   * publishes per relay so a dead one can't hold the request up, so the same
   * event legitimately arrives more than once — a real signer dedupes by id.
   */
  const handled = new Set<string>();

  async function handle(event: NostrEvent): Promise<void> {
    if (event.id) {
      if (handled.has(event.id)) return;
      handled.add(event.id);
    }
    const request = JSON.parse(await remote.nip44.decrypt(event.pubkey, event.content));
    received.push({ method: request.method, params: request.params });
    if (silent || swallowed.has(request.method)) return;

    const auth = auths.get(request.method);
    if (auth) {
      auths.delete(request.method);
      // The same id is answered twice: the prompt, then the real result. The
      // request stays outstanding across both, which is why `onAuth` must not
      // reject it.
      await send(event.pubkey, { id: request.id, result: "auth_url", error: auth });
    }

    const failure = failures.get(request.method);
    if (failure) {
      failures.delete(request.method);
      await send(event.pubkey, { id: request.id, result: "", error: failure });
      return;
    }

    switch (request.method) {
      case "connect":
        // The `secret` from a bunker:// URI comes back, or a bare ack.
        await send(event.pubkey, { id: request.id, result: request.params[1] || "ack" });
        break;
      case "get_public_key":
        await send(event.pubkey, { id: request.id, result: userPubkey });
        break;
      case "sign_event": {
        const template = JSON.parse(request.params[0]);
        delete template.pubkey;
        delete template.id;
        delete template.sig;
        await send(event.pubkey, {
          id: request.id,
          result: JSON.stringify(finalizeEvent(template, userKey)),
        });
        break;
      }
      case "ping":
        await send(event.pubkey, { id: request.id, result: "pong" });
        break;
      case "switch_relays":
        if (!preferredRelays) {
          await send(event.pubkey, {
            id: request.id,
            result: "",
            error: "Unsupported method",
          });
          break;
        }
        await send(event.pubkey, { id: request.id, result: preferredRelays });
        break;
      case "nip44_encrypt":
      case "nip44_decrypt":
        await send(event.pubkey, { id: request.id, result: request.params[1] });
        break;
      default:
        await send(event.pubkey, {
          id: request.id,
          result: "",
          error: `Unrecognized method: ${request.method}`,
        });
    }
  }

  return {
    pool: {
      subscription: () => wire.asObservable(),
      // Shaped like the real pool's: a `PublishResponse` per relay. The
      // transport releases a request on `ok`, so a bare `undefined` here would
      // make every call sit out the publish grace instead.
      publish: async (relays, event) => {
        await handle(event);
        return [{ ok: true, from: relays[0] ?? "wss://fake.relay", message: "" }];
      },
    },
    userPubkey,
    remotePubkey,
    bunkerURI({ secret = "bunker-secret", relays = ["wss://fake.relay"] } = {}) {
      const params = relays.map((relay) => `relay=${encodeURIComponent(relay)}`).join("&");
      return `bunker://${remotePubkey}?${params}&secret=${secret}`;
    },
    async pair(uri) {
      const { client, connectSecret, secret } = parseNostrConnectURI(uri);
      await send(client, { result: connectSecret ?? secret });
    },
    /** From a stranger's key — the whole point is that they never saw the secret. */
    async forgeAck(uri) {
      const { client } = parseNostrConnectURI(uri);
      await sendAs(generateSecretKey(), client, { result: "ack" });
    },
    async ackAsSigner(uri) {
      const { client } = parseNostrConnectURI(uri);
      await send(client, { result: "ack" });
    },
    failWith(method, error) {
      failures.set(method, error);
    },
    demandAuth(method, url) {
      auths.set(method, url);
    },
    goSilent() {
      silent = true;
    },
    swallow(method) {
      swallowed.add(method);
    },
    wantsRelays(relays) {
      preferredRelays = relays;
    },
    received,
  };
}
