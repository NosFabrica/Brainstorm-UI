// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NostrConnectSigner } from "applesauce-signers";
import { parseNostrConnectURI } from "applesauce-signers/helpers/nostr-connect";

import { createFakeRemoteSigner } from "./remote-test-fakes";
import {
  advertisedRelays,
  appMetadata,
  FALLBACK_NIP46_RELAY,
  isRemoteSignerTimeout,
  NIP46_PERMISSIONS,
  NSEC_APP_RELAY,
  REQUEST_TIMEOUT_MS,
  RemoteAccount,
  RemoteSigner,
  SIGNED_KINDS,
  subscribeRelays,
  withTimeout,
} from "./remote-signer";
import { installRemoteTransport } from "./remote-transport";

describe("what we ask a signer for", () => {
  it("names every kind the app signs, so nothing becomes a later prompt", () => {
    // NIP-46 has no way to ask for more later, and under Amber's default policy
    // an omitted kind is a notification its owner may never see.
    for (const kind of [0, 3, 5, 1984, 9734, 10000, 10002, 10040, 22242, 24242, 27235, 30078]) {
      expect(NIP46_PERMISSIONS).toContain(`sign_event:${kind}`);
    }
    expect(SIGNED_KINDS).toHaveLength(12);
  });

  it("asks for NIP-44 explicitly — buildSigningPermissions never does", () => {
    expect(NIP46_PERMISSIONS).toContain("nip44_encrypt");
    expect(NIP46_PERMISSIONS).toContain("nip44_decrypt");
  });

  it("never sends a bare sign_event, which Amber drops silently", () => {
    expect(NIP46_PERMISSIONS).not.toContain("sign_event");
  });

  it("always carries a name, url and image — nsec.app rejects a URI without them", () => {
    const metadata = appMetadata();
    expect(metadata.name).toBeTruthy();
    expect(metadata.url).toBeTruthy();
    expect(metadata.image).toBeTruthy();
  });

  // The connect screen shows the user what we are about to send, so they can
  // check it against what their signer displays. That comparison is worthless if
  // the two can drift, so this pins them to one source.
  it("puts exactly what appMetadata() says into the URI", () => {
    installRemoteTransport(createFakeRemoteSigner().pool);
    const signer = new RemoteSigner({ relays: ["wss://fake.relay"], requireConnectSecret: true });
    const encoded = new URL(signer.nostrConnectURI()).searchParams;
    const metadata = appMetadata();

    expect(encoded.get("name")).toBe(metadata.name);
    expect(encoded.get("url")).toBe(metadata.url);
    expect(encoded.get("image")).toBe(metadata.image);
  });
});

describe("relays", () => {
  it("listens on the one nsec.app answers on, whatever we asked for", () => {
    expect(subscribeRelays()).toContain(NSEC_APP_RELAY);
  });

  it("advertises only ours, so no other signer's traffic routes through it", () => {
    expect(advertisedRelays()).not.toContain(NSEC_APP_RELAY);
  });

  it("keeps the advertised set small rather than reusing the profile relays", () => {
    expect(advertisedRelays().length).toBeLessThanOrEqual(3);
  });

  /** `advertisedRelays` reads `env`, which is captured at module load. */
  async function withConfiguredRelay(value: string) {
    vi.resetModules();
    vi.doMock("@/lib/runtimeEnv", () => ({ env: { VITE_NIP85_RELAY_URL: value } }));
    try {
      return (await import("./remote-signer")).advertisedRelays();
    } finally {
      vi.doUnmock("@/lib/runtimeEnv");
      vi.resetModules();
    }
  }

  // `RelayPool.relay()` runs `normalizeURL` but never `ensureWebSocketURL`, so an
  // http:// value survives all the way to `new WebSocket()`, which throws on it.
  it("makes a websocket URL of a deployment that configured http://", async () => {
    expect(await withConfiguredRelay("http://localhost:7778")).toEqual(["ws://localhost:7778/"]);
  });

  it("leaves a well-formed value alone", async () => {
    expect(await withConfiguredRelay("wss://nip85.nosfabrica.com")).toEqual([
      "wss://nip85.nosfabrica.com/",
    ]);
  });

  it("falls back rather than advertising something unparseable", async () => {
    expect(await withConfiguredRelay("not a url")).toEqual([FALLBACK_NIP46_RELAY]);
  });

  it("puts the narrow set in the URI even though the signer listens broadly", () => {
    installRemoteTransport(createFakeRemoteSigner().pool);
    const signer = new RemoteSigner({ relays: subscribeRelays(), requireConnectSecret: true });
    const uri = parseNostrConnectURI(signer.nostrConnectURI());

    expect(signer.relays).toContain(NSEC_APP_RELAY);
    expect(uri.relays).toEqual(advertisedRelays());
    expect(uri.relays).not.toContain(NSEC_APP_RELAY);
  });
});

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up on a promise that never settles", async () => {
    const forever = new Promise<string>(() => {});
    const guarded = withTimeout(forever, 1000);
    vi.advanceTimersByTime(1000);
    await expect(guarded).rejects.toSatisfy(isRemoteSignerTimeout);
  });

  it("passes an answer that arrives in time straight through", async () => {
    await expect(withTimeout(Promise.resolve("pong"), 1000)).resolves.toBe("pong");
  });

  it("swallows a late answer rather than leaving it unhandled", async () => {
    let reject!: (error: Error) => void;
    const late = new Promise<string>((_, r) => (reject = r));
    const guarded = withTimeout(late, 1000);
    vi.advanceTimersByTime(1000);
    await expect(guarded).rejects.toSatisfy(isRemoteSignerTimeout);
    reject(new Error("too late"));
    await Promise.resolve();
  });
});

describe("a signer that stops answering", () => {
  it("times the request out rather than hanging for the life of the tab", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeRemoteSigner();
      installRemoteTransport(fake.pool);
      const signer = new RemoteSigner({
        relays: ["wss://fake.relay"],
        remote: fake.remotePubkey,
        pubkey: fake.userPubkey,
      });
      // Amber's real failure mode: an Android notification, and no wire response.
      fake.goSilent();

      const signing = signer.signEvent({ kind: 1, content: "", tags: [], created_at: 0 });
      const settled = expect(signing).rejects.toSatisfy(isRemoteSignerTimeout);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the pairing secret", () => {
  it("refuses a bare ack, which any relay observer can forge", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    const signer = new RemoteSigner({ relays: ["wss://fake.relay"], requireConnectSecret: true });
    const uri = signer.nostrConnectURI();

    const waiting = signer.waitForSigner();
    await fake.forgeAck(uri);
    await flush();

    expect(signer.remote).toBeUndefined();
    expect(signer.isConnected).toBe(false);

    // and the real signer, answering with the secret we minted, still gets in
    await fake.pair(uri);
    await waiting;
    expect(signer.remote).toBe(fake.remotePubkey);
  });

  // A refusal used to be indistinguishable from silence — the event was dropped,
  // nothing settled, and three minutes later the screen blamed the signer. That
  // misdiagnosis cost a whole debugging session on 2026-08-11.
  it("records the refusal, so it can be told apart from a signer saying nothing", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    const signer = new RemoteSigner({ relays: ["wss://fake.relay"], requireConnectSecret: true });
    const uri = signer.nostrConnectURI();

    void signer.waitForSigner().catch(() => {});
    expect(signer.ackRefused).toBe(false);

    await fake.ackAsSigner(uri);
    await flush();

    expect(signer.ackRefused).toBe(true);
  });

  it("stays quiet about a pairing that came back with the secret we minted", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    const signer = new RemoteSigner({ relays: ["wss://fake.relay"], requireConnectSecret: true });
    const uri = signer.nostrConnectURI();

    const waiting = signer.waitForSigner();
    await fake.pair(uri);
    await waiting;

    expect(signer.remote).toBe(fake.remotePubkey);
    expect(signer.ackRefused).toBe(false);
  });

  it("accepts a bare ack where we never issued a secret to check", async () => {
    // The bunker:// flow: the signer named its own pubkey, so there is nobody to
    // impersonate and nothing of ours to prove.
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);
    const signer = new RemoteSigner({ relays: ["wss://fake.relay"], remote: fake.remotePubkey });

    await expect(signer.connect()).resolves.toBe("ack");
  });
});

describe("a restored account", () => {
  it("signs with the transport its signer was built against", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const account = RemoteAccount.fromJSON({
      type: "nostr-connect",
      id: "restored",
      pubkey: fake.userPubkey,
      metadata: { remembered: true },
      signer: {
        clientKey: "11".repeat(32),
        remote: fake.remotePubkey,
        relays: ["wss://fake.relay"],
        bunkerSecret: "bunker-secret",
      },
    });

    const signed = await account.signEvent({
      kind: 1,
      content: "hello",
      tags: [],
      created_at: 1,
    });
    expect(signed.pubkey).toBe(fake.userPubkey);
  });

  /**
   * The library gates every operation on `requireConnection()`, which re-runs
   * `connect()` whenever its in-memory `isConnected` is false — and that flag is
   * never persisted, so it is false for every restored Account.
   *
   * Re-pairing is the wrong move and cannot succeed: NIP-46 makes a bunker
   * secret single-use ("remote-signer SHOULD ignore new attempts to establish
   * connection with old secret"), so the signer answers `invalid secret` — or
   * `already connected`, on Amber. Observed against Amethyst 2026-08-12: every
   * account switch and every reload failed this way, with an error toast and no
   * approval prompt, because the pairing was being redone rather than used.
   */
  it("uses the pairing it already has instead of making a new one", async () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const account = RemoteAccount.fromJSON({
      type: "nostr-connect",
      id: "restored",
      pubkey: fake.userPubkey,
      metadata: { remembered: true },
      signer: {
        clientKey: "11".repeat(32),
        remote: fake.remotePubkey,
        relays: ["wss://fake.relay"],
        bunkerSecret: "",
      },
    });

    await account.signEvent({ kind: 1, content: "hello", tags: [], created_at: 1 });

    expect(fake.received.map((request) => request.method)).toEqual(["sign_event"]);
  });

  // `connect()` was also the only thing calling `open()`, which is what
  // subscribes to the signer's replies. Skipping the connect without opening
  // would leave a signer that can publish and never hear anything back.
  it("is listening for replies, which the skipped connect used to arrange", () => {
    const fake = createFakeRemoteSigner();
    installRemoteTransport(fake.pool);

    const account = RemoteAccount.fromJSON({
      type: "nostr-connect",
      id: "restored",
      pubkey: fake.userPubkey,
      metadata: { remembered: true },
      signer: {
        clientKey: "11".repeat(32),
        remote: fake.remotePubkey,
        relays: ["wss://fake.relay"],
        bunkerSecret: "",
      },
    });

    expect(account.signer.listening).toBe(true);
  });

  it("cannot even be constructed before a transport is installed", () => {
    // Not "starts mute" — it throws, so persistence quarantines the entry and
    // that identity is gone for the life of the browser. Hence the ordering.
    NostrConnectSigner.pool = undefined;
    NostrConnectSigner.subscriptionMethod = undefined;
    expect(
      () => new RemoteSigner({ relays: ["wss://fake.relay"], remote: "ab".repeat(32) }),
    ).toThrow(/subscriptionMethod/);
  });
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
