// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseNostrConnectURI } from "applesauce-signers/helpers/nostr-connect";

import {
  AckRefusedError,
  beginRemotePairing,
  bunkerUriProblem,
  connectWithBunkerURI,
  isPairingCancelled,
  remoteSignerMessage,
} from "./remote-login";
import {
  isRemoteSignerTimeout,
  NIP46_PERMISSIONS,
  PAIRING_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from "./remote-signer";
import { createFakeRemoteSigner } from "./remote-test-fakes";
import { installRemoteTransport } from "./remote-transport";

/** Let the signer's subscription actually open before anyone answers it. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pairing with a nostrconnect:// URI", () => {
  it("carries the metadata and every permission in one shot", () => {
    installRemoteTransport(createFakeRemoteSigner().pool);
    const { uri, cancel } = beginRemotePairing();
    const parsed = parseNostrConnectURI(uri);

    expect(parsed.metadata?.name).toBe("Brainstorm");
    expect(parsed.metadata?.url).toBeTruthy();
    expect(parsed.metadata?.image).toBeTruthy();
    expect(parsed.metadata?.permissions).toEqual(NIP46_PERMISSIONS);
    cancel();
  });

  it("becomes an Account signing for whoever the signer speaks for", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const pairing = beginRemotePairing();
    await flush();
    await fake.pair(pairing.uri);

    const account = await pairing.completed;
    expect(account.pubkey).toBe(fake.userPubkey);
    expect(account.type).toBe("nostr-connect");
  });

  // Our relay is the one place the choice is genuinely ours — it goes in the URI.
  // Once the signer has answered, where it listens is its fact to state.
  it("follows the signer off our relay when it asks to move", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    fake.wantsRelays(["wss://the-signer-moved-here"]);

    const pairing = beginRemotePairing();
    await flush();
    await fake.pair(pairing.uri);

    const account = await pairing.completed;
    expect(account.signer.relays).toEqual(["wss://the-signer-moved-here"]);
  });

  it("keeps the pairing when the signer won't discuss relays", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const pairing = beginRemotePairing();
    await flush();
    await fake.pair(pairing.uri);

    const account = await pairing.completed;
    expect(account.pubkey).toBe(fake.userPubkey);
  });

  it("leaves an adopted connection alone when the screen that started it closes", async () => {
    // Closing the modal cancels the pairing, and cancelling aborts the signer.
    // A `nostrconnect://` pairing is already connected, so tearing it down isn't
    // fatal — `requireConnection` quietly rebuilds it — but the rebuild is a
    // `connect` the flow never needed, and nsec.app answers an un-permissioned
    // `connect` with a fresh `auth_url`, i.e. a second approval to chase.
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const pairing = beginRemotePairing();
    await flush();
    await fake.pair(pairing.uri);
    const account = await pairing.completed;

    pairing.keep();
    pairing.cancel();
    await account.signEvent({ kind: 1, content: "", tags: [], created_at: 1 });

    // The point is the absence of `connect`, not the exact list: a re-pair after
    // adoption is the failure this guards. `switch_relays` belongs to the
    // pairing, and is asked once.
    const asked = fake.received.map((request) => request.method);
    expect(asked).toEqual(["switch_relays", "get_public_key", "sign_event"]);
    expect(asked).not.toContain("connect");
  });

  it("tells a cancel apart from a signer that never answered", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const pairing = beginRemotePairing();
    await flush();
    pairing.cancel();

    await expect(pairing.completed).rejects.toSatisfy(isPairingCancelled);
  });

  it("gives up eventually — an ephemeral event lost to a relay blip has no error", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeRemoteSigner();
      installRemoteTransport(fake.pool);

      const pairing = beginRemotePairing();
      const settled = expect(pairing.completed).rejects.toSatisfy(isRemoteSignerTimeout);
      await vi.advanceTimersByTimeAsync(PAIRING_TIMEOUT_MS + 1);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pairing with a pasted bunker:// URI", () => {
  it("connects on the relays the signer named, not ours", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const account = await connectWithBunkerURI(fake.bunkerURI({ relays: ["wss://theirs"] }));

    expect(account.pubkey).toBe(fake.userPubkey);
    expect(account.signer.relays).toEqual(["wss://theirs"]);
    expect(fake.received[0].method).toBe("connect");
  });

  it("asks for every permission at connect — there is no asking later", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    await connectWithBunkerURI(fake.bunkerURI());

    const connect = fake.received.find((request) => request.method === "connect")!;
    expect(connect.params[2].split(",")).toEqual(NIP46_PERMISSIONS);
  });

  it("surfaces the signer's own refusal", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    fake.failWith("connect", "already connected");

    await expect(connectWithBunkerURI(fake.bunkerURI())).rejects.toThrow("already connected");
  });
});

/**
 * NIP-46's `switch_relays`: we ask where the signer wants to be reached and go
 * there. Only the signer knows — Amber answers with its own defaults and rewrites
 * its stored connection, and a pairing that stays pointed at relays the signer
 * has moved off is simply dead with no error anywhere.
 *
 * Optional in practice, so refusing it must cost nothing: of the three signers
 * researched only Amber implements it, and nsec.app and nsecbunker both answer
 * "Unsupported method". Failing a login over an optional capability would break
 * pairings that work today.
 */
describe("where the signer wants to be reached", () => {
  it("moves to the relays the signer asks for", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    fake.wantsRelays(["wss://the-signer-moved-here"]);

    const account = await connectWithBunkerURI(fake.bunkerURI({ relays: ["wss://theirs"] }));

    expect(account.signer.relays).toEqual(["wss://the-signer-moved-here"]);
  });

  // Serialised live off the signer, so the move has to survive a reload — a
  // pairing that reverts to the old relays on the next boot is no pairing.
  it("remembers the move, so the next reload doesn't undo it", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    fake.wantsRelays(["wss://the-signer-moved-here"]);

    const account = await connectWithBunkerURI(fake.bunkerURI({ relays: ["wss://theirs"] }));

    expect(account.toJSON().signer.relays).toEqual(["wss://the-signer-moved-here"]);
  });

  /**
   * `switchRelays` restarts the subscription — `close()` then `open()` — and
   * `close()` clears `isConnected` while `open()` never restores it. The next
   * call then goes through `requireConnection()` and re-sends the **single-use**
   * bunker secret, which is the `invalid secret` failure ticket 27 exists to
   * prevent. Amber is the one signer that implements `switch_relays`, so this
   * would fire on exactly the signer the feature is for.
   */
  it("does not re-pair itself after moving", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    fake.wantsRelays(["wss://the-signer-moved-here"]);

    await connectWithBunkerURI(fake.bunkerURI({ relays: ["wss://theirs"] }));

    expect(fake.received.map((r) => r.method)).toEqual([
      "connect",
      "switch_relays",
      "get_public_key",
    ]);
  });

  it("stays where it is when the signer doesn't implement it", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const account = await connectWithBunkerURI(fake.bunkerURI({ relays: ["wss://theirs"] }));

    expect(account.signer.relays).toEqual(["wss://theirs"]);
    expect(fake.received.map((r) => r.method)).toContain("switch_relays");
  });

  // The trap this ticket exists to avoid: an optional method that a signer
  // refuses must not take the login down with it.
  it("signs in anyway when the method is refused", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const account = await connectWithBunkerURI(fake.bunkerURI());

    expect(account.pubkey).toBe(fake.userPubkey);
  });

  it("signs in anyway when the signer answers with an error", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    fake.failWith("switch_relays", "");

    const account = await connectWithBunkerURI(fake.bunkerURI());

    expect(account.pubkey).toBe(fake.userPubkey);
  });

  /**
   * Silence, not an error — Amber ignores methods it doesn't recognise rather
   * than replying. `makeRequest`'s deferred only ever settles on a matching
   * response, so without a deadline of our own nothing rejects, the `try/catch`
   * never runs, and the login hangs with the pairing timer already cleared.
   */
  it("signs in anyway when the signer says nothing at all", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fake = createFakeRemoteSigner();
      installRemoteTransport(fake.pool);
      fake.swallow("switch_relays");

      const login = connectWithBunkerURI(fake.bunkerURI());
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 100);

      expect((await login).pubkey).toBe(fake.userPubkey);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what a pasted string is allowed to be", () => {
  it("refuses an nbunksec — it embeds a private key and is a CI credential", () => {
    expect(bunkerUriProblem("nbunksec1qqqqqqq")).toMatch(/private key/i);
  });

  it("names the nsecbunker admin link for what it is", () => {
    expect(bunkerUriProblem("bunker://npub1abc@relay.example,relay2.example")).toMatch(/admin/i);
  });

  it("names the old NDK client token", () => {
    expect(bunkerUriProblem(`npub1abcdef#${"ab".repeat(32)}`)).toMatch(/nsecbunker/i);
  });

  it("says what a link without relays is missing", () => {
    expect(bunkerUriProblem(`bunker://${"ab".repeat(32)}`)).toMatch(/relays/i);
  });

  it("asks for something rather than complaining about nothing", () => {
    expect(bunkerUriProblem("   ")).toMatch(/paste/i);
  });

  it("passes a real one", () => {
    expect(bunkerUriProblem(`bunker://${"ab".repeat(32)}?relay=wss://x.example&secret=s`)).toBeNull();
  });
});

describe("what a failure is told to the user", () => {
  it.each([
    ["invalid secret", /expired/i],
    ["secret not in use", /expired/i],
    ["already connected", /remove or reset/i],
    ["no permission", /doesn't recognise/i],
    ["user rejected", /declined/i],
    ["Not authorized", /declined/i],
    ["Unsupported method", /still work/i],
    ["Unrecognized method: foo", /still work/i],
  ])("maps %s", (signerSaid, expected) => {
    expect(remoteSignerMessage(new Error(signerSaid))).toMatch(expected);
  });

  it("says nothing at all about a deliberate cancel", () => {
    expect(remoteSignerMessage({ name: "PairingCancelled" })).toBe("");
  });

  it("tells a silent signer apart from one that declined", () => {
    expect(remoteSignerMessage({ name: "RemoteSignerTimeoutError" })).toMatch(/notification/i);
  });

  // The refusal used to be dropped on the floor, so it surfaced three minutes
  // later as the timeout above — sending the user to hunt for a notification
  // their signer had already answered.
  it("does not call a refused pairing a silent one", () => {
    const refused = remoteSignerMessage(new AckRefusedError());

    expect(refused).toMatch(/couldn't confirm/i);
    expect(refused).not.toMatch(/notification/i);
    expect(refused).not.toBe(remoteSignerMessage({ name: "RemoteSignerTimeoutError" }));
  });
});
