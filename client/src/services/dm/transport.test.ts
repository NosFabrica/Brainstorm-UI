import { beforeEach, describe, expect, it, vi } from "vitest";
import { BehaviorSubject, EmptyError, Subject, TimeoutError } from "rxjs";
import type { NostrEvent } from "nostr-tools";

/** Just the relay state publish reads, driven by hand. */
class FakeRelay {
  url = "wss://relay.example/";
  connected$ = new BehaviorSubject(false);
  notice$ = new Subject<string>();
  authRequiredForPublish$ = new BehaviorSubject(false);
  authenticated$ = new BehaviorSubject(false);
  get authenticated() {
    return this.authenticated$.value;
  }
  publish = vi.fn<(event: NostrEvent, opts?: unknown) => Promise<{ ok: boolean; message?: string }>>();
}

let relay: FakeRelay;
vi.mock("@/lib/relayPool", () => ({ pool: { relay: () => relay } }));

const { poolTransport } = await import("./transport");
const event = { id: "e".repeat(64) } as NostrEvent;

beforeEach(() => {
  relay = new FakeRelay();
});

describe("poolTransport.publish", () => {
  it("passes a relay's refusal through in its own words", async () => {
    relay.connected$.next(true);
    relay.publish.mockResolvedValue({ ok: false, message: "restricted: not a member" });
    expect(await poolTransport.publish(relay.url, event)).toEqual({ ok: false, message: "restricted: not a member" });
  });

  it("calls a socket that never opened unreachable, not refused", async () => {
    relay.publish.mockRejectedValue({ type: "error" });
    expect(await poolTransport.publish(relay.url, event)).toMatchObject({ ok: false, unreachable: true });
  });

  it("calls a relay in reconnect backoff unreachable too, though it fails as a timeout", async () => {
    relay.publish.mockRejectedValue(new TimeoutError());
    expect(await poolTransport.publish(relay.url, event)).toMatchObject({ ok: false, unreachable: true });
  });

  it("tells a socket that closed mid-send from one that never opened", async () => {
    relay.connected$.next(true);
    relay.publish.mockImplementation(async () => {
      relay.connected$.next(false);
      throw { type: "close", code: 1006 };
    });
    expect(await poolTransport.publish(relay.url, event)).toMatchObject({ ok: false, dropped: true });
  });

  it("keeps a NOTICE sent instead of an OK, and only then", async () => {
    relay.connected$.next(true);
    relay.publish.mockImplementation(async () => {
      relay.notice$.next("rate limited");
      return { ok: false, message: "Timeout" };
    });
    expect(await poolTransport.publish(relay.url, event)).toEqual({
      ok: false,
      message: "Timeout",
      notice: "rate limited",
    });

    relay.publish.mockImplementation(async () => {
      relay.notice$.next("something else");
      return { ok: false, message: "blocked: spam" };
    });
    expect(await poolTransport.publish(relay.url, event)).toEqual({ ok: false, message: "blocked: spam" });
  });

  it("reads the library's thrown timeout as silence, keeping the NOTICE", async () => {
    relay.connected$.next(true);
    relay.publish.mockImplementation(async () => {
      relay.notice$.next("disk full");
      throw new Error("Timeout");
    });
    expect(await poolTransport.publish(relay.url, event)).toEqual({
      ok: false,
      message: "Timeout",
      notice: "disk full",
    });
  });

  it("calls a socket that closed cleanly before any OK a lost connection, not a refusal", async () => {
    relay.connected$.next(true);
    relay.publish.mockRejectedValue(new EmptyError());
    expect(await poolTransport.publish(relay.url, event)).toEqual({
      ok: false,
      message: "Connection lost",
      dropped: true,
    });
  });

  it("keeps any other error's words", async () => {
    relay.connected$.next(true);
    relay.publish.mockRejectedValue(new Error("Relay does not support this"));
    expect(await poolTransport.publish(relay.url, event)).toEqual({
      ok: false,
      message: "Relay does not support this",
    });
  });

  it("doesn't hold an event for a login the relay already asked for, and sends it once signed in", async () => {
    relay.connected$.next(true);
    relay.authRequiredForPublish$.next(true);
    relay.publish.mockResolvedValue({ ok: true, message: "" });
    const sent = poolTransport.publish(relay.url, event);
    await Promise.resolve();
    expect(relay.publish).not.toHaveBeenCalled();
    relay.authenticated$.next(true);
    expect(await sent).toEqual({ ok: true, message: "" });
    expect(relay.publish).toHaveBeenCalledTimes(1);
  });
});
