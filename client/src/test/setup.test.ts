import { describe, expect, it } from "vitest";

// A unit test that reached a real relay crashed a later, unrelated test: the
// connection landed after its own file had finished, and Node's socket then
// fired an event built by the next file's jsdom ("The "event" argument must be
// an instance of Event. Received an instance of Event").
describe("the test environment", () => {
  it("never opens a real relay connection", async () => {
    const socket = new WebSocket("wss://relay.damus.io/");
    let opened = false;
    socket.addEventListener("open", () => (opened = true));

    expect(socket.constructor.name).toBe("OfflineWebSocket");
    expect(socket.url).toBe("wss://relay.damus.io/");
    expect(socket.readyState).toBe(WebSocket.CONNECTING);
    expect(() => socket.send("[]")).not.toThrow();

    let closed = false;
    socket.addEventListener("close", () => (closed = true));
    socket.close();
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(closed).toBe(true);
    expect(opened).toBe(false);
  });
});
