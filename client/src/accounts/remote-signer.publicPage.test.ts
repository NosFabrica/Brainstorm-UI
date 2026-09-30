// @vitest-environment-options {"url": "https://brainstorm.world/"}
/**
 * A remote signer's relays are the reader's choice — pasted in a bunker://
 * link, or named later by the signer itself via `switch_relays`, which swaps
 * the signer's relays and reopens without going through our constructor. So
 * consent is given wherever those relays are used, not only where the signer
 * is built.
 */
import { describe, expect, it, vi } from "vitest";
import { EMPTY } from "rxjs";
import { isUnreachableLocalRelay } from "@/lib/localNetwork";
import { RemoteSigner } from "./remote-signer";

type Methods = {
  subscriptionMethod: (relays: string[], filters: unknown[]) => unknown;
  publishMethod: (relays: string[], event: unknown) => unknown;
};

describe("a remote signer's relays on a public page", () => {
  it("are reached wherever the signer uses them, including ones it switched to", () => {
    const subscriptionMethod = vi.fn(() => EMPTY);
    const publishMethod = vi.fn(async () => undefined);
    const signer = new RemoteSigner({ relays: ["wss://relay.nsec.app"], subscriptionMethod, publishMethod });
    const methods = signer as unknown as Methods;

    expect(isUnreachableLocalRelay("ws://umbrel.local:5555")).toBe(true);
    // What `switchRelays` → `open()` does with the relays the signer named.
    methods.subscriptionMethod(["ws://umbrel.local:5555"], [{ kinds: [24133] }]);
    expect(isUnreachableLocalRelay("ws://umbrel.local:5555")).toBe(false);
    expect(subscriptionMethod).toHaveBeenCalledWith(["ws://umbrel.local:5555"], [{ kinds: [24133] }]);

    methods.publishMethod(["ws://192.168.1.5:7447"], { kind: 24133 });
    expect(isUnreachableLocalRelay("ws://192.168.1.5:7447")).toBe(false);
    expect(publishMethod).toHaveBeenCalledOnce();
  });
});
