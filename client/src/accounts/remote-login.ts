/**
 * The three ways into a remote signer, and what to say when one fails.
 *
 * All three are reachable everywhere; only the emphasis moves, because a signer
 * can live on a second device even when Brainstorm is on the phone. Amber
 * registers `nostrconnect://` as a deep link, so a same-device QR is never the
 * mobile default.
 *
 * | Route            | Mobile    | Desktop   |
 * | ---------------- | --------- | --------- |
 * | Open signer app  | primary   | secondary |
 * | Scan a QR        | secondary | primary   |
 * | Paste `bunker://`| secondary | secondary |
 *
 * The first two are one pairing seen three ways — the same URI as a link, as a
 * QR and on the clipboard — so `beginRemotePairing` serves all of them.
 */
import { NostrConnectSigner } from "applesauce-signers";
import type { Observable } from "rxjs";

import {
  isRemoteSignerTimeout,
  NIP46_PERMISSIONS,
  PAIRING_TIMEOUT_MS,
  RemoteAccount,
  RemoteSigner,
  RemoteSignerTimeoutError,
  subscribeRelays,
} from "./remote-signer";

/** A pairing we started: the URI to show, the Account it becomes, and the way out. */
export type RemotePairing = {
  /** `nostrconnect://…` — the link, the QR and the clipboard all carry this. */
  uri: string;
  /** The relays we're listening on, for the transport indicator. */
  relays: string[];
  /**
   * True once something answered this pairing with a bare `"ack"` and we turned
   * it away. The screen says so immediately; the pairing deliberately stays open,
   * because the URI is public and ending it on one unsigned message would let any
   * observer cancel the handshake.
   */
  ackRefused$: Observable<boolean>;
  /** Resolves once the signer answers with the secret we minted. */
  completed: Promise<RemoteAccount>;
  /**
   * The Account is adopted and this connection is now its Signer's. Say so
   * before closing the screen, or `cancel` will tear down the transport the
   * user just signed in over.
   */
  keep(): void;
  /**
   * Give up, and close the connection. Safe to call unconditionally on the way
   * out — after `keep` it does nothing. `completed` rejects with
   * `PairingCancelled` if it hadn't already settled.
   */
  cancel(): void;
};

/**
 * Something answered, but only with `"ack"`, and the pairing then ran out of time.
 *
 * Deliberately not "your signer answered wrongly". Anyone who can read the URI
 * can send an `"ack"` — it is on screen as a QR and it travels through relays —
 * so the honest reading of this state is ambiguous: either the user's signer
 * answered in a form we can't accept, or an observer answered and the real signer
 * never did. Both end in the same place and have the same way out, so the copy
 * covers both rather than picking one and being wrong half the time.
 */
export class AckRefusedError extends Error {
  constructor() {
    super(
      "Something answered without the code we sent, so we couldn't confirm it was your signer. Pair by pasting a bunker:// link from the signer instead.",
    );
    this.name = "AckRefusedError";
  }
}

/** The user backed out of a pairing. Never shown as an error. */
export class PairingCancelled extends Error {
  constructor() {
    super("Pairing cancelled");
    this.name = "PairingCancelled";
  }
}

export function isPairingCancelled(error: unknown): boolean {
  return (
    error instanceof PairingCancelled || (error as { name?: string })?.name === "PairingCancelled"
  );
}

/**
 * Start a `nostrconnect://` pairing.
 *
 * We listen on our relay *and* the one nsec.app answers on regardless of what we
 * ask for, while the URI names only ours — see `remote-signer`. The deadline is
 * generous because the user may be walking to another device, but it exists:
 * kind 24133 is ephemeral, so a relay that blips loses the handshake with no
 * error anywhere, and without a deadline the screen would wait forever.
 */
export function beginRemotePairing(): RemotePairing {
  const relays = subscribeRelays();
  const signer = new RemoteSigner({ relays, requireConnectSecret: true });
  const uri = signer.nostrConnectURI();

  const abort = new AbortController();
  let cancelled = false;
  let kept = false;
  const timer = setTimeout(() => abort.abort(), PAIRING_TIMEOUT_MS);

  const completed = (async () => {
    try {
      await signer.waitForSigner(abort.signal);
    } catch (error) {
      // `waitForSigner` rejects with a bare "Aborted" for all three of these, and
      // they are different things to say. A refused pairing is the one that must
      // never read as silence: the signer did answer, we turned the answer down.
      if (cancelled) throw new PairingCancelled();
      if (signer.ackRefused) throw new AckRefusedError();
      throw new RemoteSignerTimeoutError("Your signer didn't answer. Try again, or paste a link.");
    } finally {
      clearTimeout(timer);
    }
    return new RemoteAccount(await signer.getPublicKey(), signer);
  })();

  // A cancel is a normal end, and the caller may not be waiting on it any more —
  // it owns the rejection so backing out doesn't surface as an unhandled one.
  // The caller's own handler still sees it; this is a second branch, not a catch.
  completed.catch(() => {});

  return {
    uri,
    relays,
    ackRefused$: signer.ackRefused$,
    completed,
    keep() {
      kept = true;
      clearTimeout(timer);
    },
    cancel() {
      // Aborting closes the signer's subscription, which is right for a pairing
      // nobody adopted and wrong for one that is now an Account's only way to
      // sign — that Account would go quiet the moment its screen closed.
      if (kept) return;
      cancelled = true;
      abort.abort();
    },
  };
}

/**
 * Pair from a `bunker://` URI the signer generated. Its relays come from the URI
 * — we don't choose here, and mustn't: it is listening on those and nowhere else.
 *
 * These links are short-lived by design. nsec.app's token is single-use with a
 * ten-minute life, and Amber regenerates its secret whenever the URI is viewed.
 */
export async function connectWithBunkerURI(uri: string): Promise<RemoteAccount> {
  const { remote, relays, bunkerSecret } = NostrConnectSigner.parseBunkerURI(uri.trim());
  const signer = new RemoteSigner({ relays, remote, bunkerSecret });
  await signer.connect(bunkerSecret, NIP46_PERMISSIONS);
  return new RemoteAccount(await signer.getPublicKey(), signer);
}

/**
 * Why a pasted string isn't a `bunker://` URI, in words that help.
 *
 * Two dead formats still circulate and both hit the library's "remote is not a
 * valid hex key" branch, which explains nothing. A third — `nbunksec1…` — parses
 * fine and must still be refused: it is a CI credential that *embeds a private
 * key*, and pasting one into a login box hands over a bearer secret.
 */
export function bunkerUriProblem(input: string): string | null {
  const uri = input.trim();
  if (!uri) return "Paste the connection link from your signer.";

  if (uri.startsWith("nbunksec1")) {
    return "That's an automation credential — it contains a private key, so it doesn't belong in a login box. Use a bunker:// link instead.";
  }
  if (/^bunker:\/\/npub1/i.test(uri)) {
    return "That's an admin login link for a bunker server, not an app connection. Your signer should offer a separate link for connecting apps.";
  }
  if (/^npub1[a-z0-9]+#/i.test(uri)) {
    return "That's an old nsecbunker token, which nothing supports any more. Ask your signer for a bunker:// link.";
  }
  if (!/^bunker:\/\//i.test(uri)) {
    return "That doesn't look like a connection link. It should start with bunker://";
  }

  try {
    NostrConnectSigner.parseBunkerURI(uri);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("missing relays")) {
      return "This link doesn't name any relays, so there's no way to reach your signer. Ask it for a fresh one.";
    }
    return "We couldn't read that connection link. Copy it again from your signer.";
  }
}

/**
 * What a failed handshake means, in the signer's own words.
 *
 * Every string matched here is one a real signer returns verbatim, and each one
 * has a different thing for the user to do about it — which is the whole point
 * of matching them rather than showing "connection failed".
 */
export function remoteSignerMessage(error: unknown): string {
  if (isPairingCancelled(error)) return "";
  // Before the timeout branch: a refusal is not silence, and saying it is sends
  // the user off to look for a notification that was already answered.
  if (error instanceof AckRefusedError || (error as { name?: string })?.name === "AckRefusedError") {
    return (error as Error).message;
  }
  if (isRemoteSignerTimeout(error)) {
    return "Your signer didn't respond. Open it and check for a pending notification, then try again.";
  }

  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (
    message.includes("invalid secret") ||
    message.includes("no secret") ||
    message.includes("secret not in use")
  ) {
    return "This link has expired — they're single-use and short-lived. Get a fresh one from your signer and paste it straight away.";
  }
  if (message.includes("already connected")) {
    return "Your signer still thinks this app is connected. Open it, remove or reset Brainstorm, then try again.";
  }
  if (message.includes("no permission")) {
    return "Your signer doesn't recognise this app. Connect it again from the signer's side.";
  }
  if (message.includes("user rejected") || message.includes("not authorized")) {
    return "The request was declined in your signer.";
  }
  if (message.includes("unsupported method") || message.includes("unrecognized method")) {
    return "Your signer doesn't support something this app asked for. Signing should still work.";
  }
  return raw || "We couldn't reach your signer. Check your connection and try again.";
}
