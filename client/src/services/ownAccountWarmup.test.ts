/**
 * The signed-in account's profile, AI keys and Blossom servers come in one REQ, and the
 * hooks that would each have asked for theirs join it instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAsks, askOnce, inFlightFor, replaceableAskKey } from "@/lib/askOnce";
import { profileAskKey } from "@/lib/profileAsk";

const PK = "b".repeat(64);
const req = vi.hoisted(() => ({ calls: [] as unknown[][], release: () => {} }));
vi.mock("@/lib/relayRequest", () => ({
  requestAll: (...a: unknown[]) => {
    req.calls.push(a);
    return new Promise((resolve) => {
      req.release = () => resolve([]);
    });
  },
}));
vi.mock("@/lib/relayRouting", () => ({ outboxRelays: () => Promise.resolve(["wss://mine.example/"]) }));

import { warmOwnAccount } from "./ownAccountWarmup";

beforeEach(() => {
  __resetAsks();
  req.calls = [];
});

describe("warmOwnAccount", () => {
  it("asks the account's own relays for its profile, AI keys and Blossom servers in one REQ", async () => {
    warmOwnAccount(PK);
    await vi.waitFor(() => expect(req.calls).toHaveLength(1));
    expect(req.calls[0][0]).toEqual(["wss://mine.example/"]);
    expect(req.calls[0][1]).toEqual({ kinds: [0, 12000, 10063], authors: [PK] });
  });

  it("is what the profile's and the AI keys' asks join while it is out", async () => {
    const ask = warmOwnAccount(PK);
    expect(inFlightFor(profileAskKey(PK))).toBe(ask);
    expect(inFlightFor(replaceableAskKey(12000, PK))).toBe(ask);
    const own = vi.fn();
    expect(askOnce(replaceableAskKey(12000, PK), { minMs: 1 }, own)).toBe(ask);
    expect(own).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(req.calls).toHaveLength(1));
    req.release();
  });

  it("is sent once per window, however often sign-in runs", async () => {
    warmOwnAccount(PK);
    warmOwnAccount(PK);
    await vi.waitFor(() => expect(req.calls).toHaveLength(1));
    req.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(warmOwnAccount(PK)).toBeUndefined();
  });

  it("leaves an ask already made for the profile standing", () => {
    const earlier = askOnce(profileAskKey(PK), { minMs: 60_000 }, () => new Promise(() => {}));
    warmOwnAccount(PK);
    expect(inFlightFor(profileAskKey(PK))).toBe(earlier);
  });
});
