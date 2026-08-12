// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from "rxjs";

import { recheckSigner, signerUnreachable$ } from "./signer-liveness";
import type { BrainstormAccount } from "./metadata";

/** What our own timeout throws — the only failure that means "gone". */
function silence() {
  const error = new Error("Your signer didn't respond.");
  error.name = "RemoteSignerTimeoutError";
  return error;
}

const ping = vi.fn(async () => "pong" as const);
const askedAbout: string[][] = [];
const active$ = new BehaviorSubject<unknown>(null);
const reachable$ = new BehaviorSubject(true);

const manager = { active$ } as never;

const BUNKER_RELAYS = ["wss://the-signers-own-relay"];

function remoteAccount(id = "remote-1") {
  return {
    id,
    type: "nostr-connect",
    pubkey: "a".repeat(64),
    signer: { ping, relays: BUNKER_RELAYS },
  } as unknown as BrainstormAccount;
}

function extensionAccount() {
  return { id: "ext-1", type: "extension", pubkey: "b".repeat(64) } as unknown as BrainstormAccount;
}

/** Collect what the stream says, in order. */
function watch() {
  const seen: (BrainstormAccount | null)[] = [];
  const sub = signerUnreachable$(manager, (relays) => {
    askedAbout.push(relays);
    return reachable$;
  }).subscribe((a) => seen.push(a));
  return { seen, stop: () => sub.unsubscribe() };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  ping.mockResolvedValue("pong");
  active$.next(null);
  reachable$.next(true);
  askedAbout.length = 0;
});

describe("a remote signer that has stopped answering", () => {
  it("says nothing while the signer answers", async () => {
    active$.next(remoteAccount());
    const { seen, stop } = watch();
    await settle();

    expect(ping).toHaveBeenCalled();
    expect(seen.at(-1)).toBeNull();
    stop();
  });

  // Research: there is no revocation signal. Amber's "Reset Bunker" mints a new
  // per-connection key, so our stored `remote` is a pubkey nobody listens on and
  // nothing on the wire ever says so. A ping that goes unanswered is the only
  // way to find out before the next publish fails.
  it("names the account when the ping goes unanswered", async () => {
    ping.mockRejectedValue(silence());
    const account = remoteAccount();
    active$.next(account);
    const { seen, stop } = watch();
    await settle();

    expect(seen.at(-1)).toBe(account);
    stop();
  });

  it("never probes an account that doesn't have a remote signer", async () => {
    active$.next(extensionAccount());
    const { seen, stop } = watch();
    await settle();

    expect(ping).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeNull();
    stop();
  });

  // The two indicators stay independent. Relays down is ours to fix and already
  // has its own copy; blaming the signer for it would send the user to the wrong
  // app entirely.
  it("does not blame the signer while the relays are unreachable", async () => {
    reachable$.next(false);
    active$.next(remoteAccount());
    const { seen, stop } = watch();
    await settle();

    expect(ping).not.toHaveBeenCalled();
    expect(seen.at(-1)).toBeNull();
    stop();
  });

  it("probes once the relays come back", async () => {
    reachable$.next(false);
    active$.next(remoteAccount());
    const { stop } = watch();
    await settle();
    expect(ping).not.toHaveBeenCalled();

    reachable$.next(true);
    await settle();

    expect(ping).toHaveBeenCalledTimes(1);
    stop();
  });

  it("clears once the signer answers again", async () => {
    ping.mockRejectedValue(silence());
    const account = remoteAccount();
    active$.next(account);
    const { seen, stop } = watch();
    await settle();
    expect(seen.at(-1)).toBe(account);

    ping.mockResolvedValue("pong");
    recheckSigner();
    await settle();

    expect(seen.at(-1)).toBeNull();
    stop();
  });

  // The relays a bunker:// pairing listens on come from its own URI, and are
  // routinely not the ones this app advertises.
  it("asks about the signer's relays, not the app's", async () => {
    active$.next(remoteAccount());
    const { stop } = watch();
    await settle();

    expect(askedAbout).toContainEqual(BUNKER_RELAYS);
    stop();
  });

  // A signer that doesn't implement ping answers with an error, not silence.
  // Condemning it would be permanent — a recheck reproduces it exactly.
  it("does not call a signer dead for refusing the question", async () => {
    ping.mockRejectedValue(new Error("Unsupported method: ping"));
    active$.next(remoteAccount());
    const { seen, stop } = watch();
    await settle();

    expect(seen.at(-1)).toBeNull();
    stop();
  });

  it("forgets the last answer when the account changes", async () => {
    ping.mockRejectedValue(silence());
    active$.next(remoteAccount("remote-1"));
    const { seen, stop } = watch();
    await settle();
    expect(seen.at(-1)).not.toBeNull();

    ping.mockResolvedValue("pong");
    active$.next(remoteAccount("remote-2"));
    await settle();

    expect(seen.at(-1)).toBeNull();
    stop();
  });
});
