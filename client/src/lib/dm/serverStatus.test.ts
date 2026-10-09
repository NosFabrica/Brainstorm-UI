import { describe, expect, it } from "vitest";
import { serverStatus } from "@/lib/dm/serverStatus";
import type { DmEngineState } from "@/services/dm/engine";
import type { RelayProgress } from "@/lib/dm/pager";

const relay = (url: string, state: RelayProgress["state"], pages = 1): RelayProgress => ({
  url,
  state,
  reachedUntil: 0,
  completeTo: 0,
  pages,
});
const state = (relays: RelayProgress[], live: Record<string, "connecting" | "synced" | "auth"> = {}) =>
  ({ live, history: { relays } }) as unknown as DmEngineState;

describe("serverStatus — a message server, in words a reader can act on", () => {
  const s = state(
    [
      relay("wss://a.example/", "done"),
      relay("wss://b.example/", "stalled"),
      relay("wss://c.example/", "auth"),
      relay("wss://d.example/", "loading", 0),
    ],
    { "wss://e.example/": "synced" },
  );

  it("working, not answering, or asks you to sign in", () => {
    expect(serverStatus("wss://a.example/", s)).toBe("working");
    expect(serverStatus("wss://b.example/", s)).toBe("not-answering");
    expect(serverStatus("wss://c.example/", s)).toBe("sign-in");
    expect(serverStatus("wss://e.example/", s)).toBe("working");
  });

  it("still checking a server that hasn't said anything yet", () => {
    expect(serverStatus("wss://d.example/", s)).toBe("checking");
    expect(serverStatus("wss://unknown.example/", s)).toBe("checking");
  });

  it("a server that still hasn't connected well after another has is not answering", () => {
    const quiet = state([relay("wss://a.example/", "done")], {
      "wss://a.example/": "synced",
      "wss://z.example/": "connecting",
    });
    expect(serverStatus("wss://z.example/", quiet, { waitedMs: 5_000 })).toBe("checking");
    expect(serverStatus("wss://z.example/", quiet, { waitedMs: 20_000 })).toBe("not-answering");
    const nobody = state([], { "wss://z.example/": "connecting" });
    expect(serverStatus("wss://z.example/", nobody, { waitedMs: 20_000 })).toBe("checking");
  });

  it("matches addresses written with or without the trailing slash", () => {
    expect(serverStatus("wss://b.example", s)).toBe("not-answering");
  });
});
