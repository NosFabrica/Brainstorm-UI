// @vitest-environment node
/**
 * The one signature check (lib/verifier): noble until the wasm build has
 * loaded, the wasm build after, and each signature checked once a session.
 *
 * Node, not jsdom: the events are really signed, and jsdom's foreign-realm
 * Uint8Array fails @noble's checks (see `test/setup.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { NostrEvent } from "nostr-tools";
import {
  __resetVerifier,
  loadFastVerifierWhenBusy,
  startFastVerifier,
  verifiedThisSession,
  verifySignature,
} from "./verifier";
import { eventStore } from "./eventStore";

const SECRET = generateSecretKey();
let n = 0;
/** A plain object, as a relay's copy is: no "verified" mark from signing it here. */
const signed = (content = `note ${++n}`): NostrEvent =>
  JSON.parse(JSON.stringify(finalizeEvent({ kind: 1, created_at: 1_700_000_000 + n, tags: [], content }, SECRET)));
const copyOf = (event: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(event));

beforeEach(() => __resetVerifier());
afterEach(() => __resetVerifier());

describe("verifySignature", () => {
  it("accepts a signed event and refuses a tampered one", () => {
    const event = signed();
    expect(verifySignature(copyOf(event))).toBe(true);
    expect(verifySignature({ ...copyOf(event), content: "forged" })).toBe(false);
    expect(verifySignature({ ...copyOf(event), sig: "0".repeat(128) })).toBe(false);
  });

  it("answers false, never throws, for something that is not an event", () => {
    expect(verifySignature({} as NostrEvent)).toBe(false);
    expect(verifySignature({ ...signed(), tags: [[1 as unknown as string]] })).toBe(false);
    expect(verifySignature(null as unknown as NostrEvent)).toBe(false);
  });
});

describe("before and after the wasm build loads", () => {
  it("answers with noble until it has loaded, then with it — never waiting for it", async () => {
    const fast = vi.fn(() => true);
    let finish!: () => void;
    const loading = startFastVerifier(() => new Promise((resolve) => (finish = () => resolve(fast))));

    expect(verifySignature(signed())).toBe(true); // noble, at once
    expect(verifySignature({ ...signed(), sig: "0".repeat(128) })).toBe(false);
    expect(fast).not.toHaveBeenCalled();

    finish();
    expect(await loading).toBe(true);
    verifySignature(signed());
    expect(fast).toHaveBeenCalledTimes(1);
  });

  it("stays on noble when the wasm build can't load (a CSP, a browser without it)", async () => {
    expect(await startFastVerifier(() => Promise.reject(new Error("CompileError")))).toBe(false);
    expect(verifySignature(signed())).toBe(true);
    expect(verifySignature({ ...signed(), content: "forged" })).toBe(false);
  });

  it("is fetched only once there is real verifying to do, not at boot", async () => {
    const load = vi.fn(async () => () => true);
    loadFastVerifierWhenBusy(3, load);
    verifySignature(signed());
    verifySignature(signed());
    expect(load).not.toHaveBeenCalled(); // a page that verifies two events never downloads it
    verifySignature(signed());
    expect(load).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) verifySignature(signed());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not count a signature it already verified this session", () => {
    const load = vi.fn(async () => () => true);
    loadFastVerifierWhenBusy(2, load);
    const event = signed();
    verifySignature(event);
    verifySignature(copyOf(event));
    expect(load).not.toHaveBeenCalled();
  });

  it("loads once, however often it is started", async () => {
    const load = vi.fn(async () => () => true);
    await Promise.all([startFastVerifier(load), startFastVerifier(load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("really loads here, and agrees with noble", async () => {
    expect(await startFastVerifier()).toBe(true);
    const event = signed();
    expect(verifySignature(copyOf(event))).toBe(true);
    expect(verifySignature({ ...copyOf(event), content: "forged" })).toBe(false);
    expect(verifySignature({ ...copyOf(event), sig: event.sig.replace(/^./, (c) => (c === "0" ? "1" : "0")) })).toBe(
      false,
    );
  });
});

describe("once a session per signature", () => {
  it("does not check the same id and sig twice", async () => {
    const fast = vi.fn(() => true);
    await startFastVerifier(async () => fast);
    const event = signed();
    expect(verifySignature(copyOf(event))).toBe(true);
    expect(verifySignature(copyOf(event))).toBe(true);
    expect(fast).toHaveBeenCalledTimes(1);
    expect(verifiedThisSession(copyOf(event))).toBe(true);
  });

  /** IndexedDB is writable by anything on the origin: a genuine id and sig over forged content. */
  it("still refuses forged content carrying a remembered id and sig", () => {
    const event = signed();
    expect(verifySignature(copyOf(event))).toBe(true);
    expect(verifySignature({ ...copyOf(event), content: "steer my publishes elsewhere" })).toBe(false);
  });

  it("remembers only what passed", async () => {
    const fast = vi.fn(() => false);
    await startFastVerifier(async () => fast);
    const event = signed();
    expect(verifySignature(copyOf(event))).toBe(false);
    expect(verifySignature(copyOf(event))).toBe(false);
    expect(fast).toHaveBeenCalledTimes(2);
  });
});

describe("the store's check (lib/eventStore)", () => {
  it("verifies a note once, however many relays send it", async () => {
    const fast = vi.fn(() => true);
    await startFastVerifier(async () => fast);
    const event = signed();
    for (let relay = 0; relay < 5; relay++) eventStore.add(copyOf(event), `wss://relay${relay}.example/`);
    expect(fast).toHaveBeenCalledTimes(1);
    expect(eventStore.getEvent(event.id)).toBeDefined();
  });

  it("still refuses a forgery of an event it does not hold", () => {
    expect(eventStore.add({ ...signed(), content: "forged" })).toBeNull();
  });
});
