// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseNostrConnectURI } from "applesauce-signers/helpers/nostr-connect";

import {
  beginRemotePairing,
  bunkerUriProblem,
  connectWithBunkerURI,
  isPairingCancelled,
  remoteSignerMessage,
} from "./remote-login";
import { isRemoteSignerTimeout, NIP46_PERMISSIONS, PAIRING_TIMEOUT_MS } from "./remote-signer";
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

    expect(fake.received.map((request) => request.method)).toEqual(["get_public_key", "sign_event"]);
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
});
