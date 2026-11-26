/**
 * A test that dials a relay fails (test/setup.ts), as one that fetches does: the
 * setup's socket never opens, so the code under test would only wait out its
 * deadline. 36 tests did that unnoticed before the guard.
 */
import { describe, expect, it } from "vitest";
import { pool } from "@/lib/relayPool";

describe("the relay-socket guard", () => {
  it.fails("fails a test that opens a WebSocket", () => {
    const socket = new WebSocket("wss://relay.example/");
    expect(socket.readyState).toBe(WebSocket.CONNECTING);
  });

  // The pool opens a socket only for a relay it hasn't met in the file, and sometimes
  // after the test has ended: the ask itself is what fails.
  it.fails("fails a test that asks the relay pool", () => {
    pool
      .request(["wss://relay.example/"], [{ kinds: [1] }])
      .subscribe({ error: () => {} })
      .unsubscribe();
  });

  it("lets a test that opens none pass", () => {
    expect(true).toBe(true);
  });
});
