// @vitest-environment jsdom
/**
 * Admin people search talks plain NIP-50 to VITE_SEARCH_RELAY_URL. On the
 * SearchOverTrust relay a read with no lens is refused (`CLOSED auth-required:`),
 * so every REQ must carry `observer:` — the house observer, the default point
 * of view brainstorm-server used to supply — or `include:spam` when there is
 * none. A refusal must end the search at once, not wait out the timeout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtimeEnv", () => ({
  env: {
    VITE_NIP85_RELAY_URL: "",
    VITE_API_URL: "",
    VITE_TAG_RELAY_URLS: "",
    VITE_SEARCH_RELAY_URL: "wss://search.example/",
    VITE_FEATURE_AGENT_SUITE: "",
    VITE_FEATURE_ASSISTANTS_ADMIN: "",
  },
}));
const houseMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => houseMock() }));

import { searchNostrProfiles } from "./nostr";

const HOUSE = "b".repeat(64);

class FakeSocket {
  static last: FakeSocket;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {}
  reply(frame: unknown[]) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

/** Open the socket and wait for the REQ the search sends. */
async function opened(): Promise<{ sock: FakeSocket; search: string }> {
  const sock = FakeSocket.last;
  sock.onopen?.();
  await vi.waitFor(() => expect(sock.sent).toHaveLength(1));
  return { sock, search: JSON.parse(sock.sent[0])[2].search };
}

const profile = (pubkey: string, kind = 0) => ({
  id: "1".repeat(64),
  kind,
  pubkey,
  created_at: 1,
  content: JSON.stringify({ name: "jack" }),
  tags: [],
  sig: "s",
});

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  houseMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("searchNostrProfiles", () => {
  it("reads through the house observer", async () => {
    houseMock.mockResolvedValue(HOUSE);
    const done = searchNostrProfiles("jack");
    const { sock, search } = await opened();
    expect(search).toBe(`jack observer:${HOUSE}`);
    sock.reply(["EVENT", "search-1", profile("a".repeat(64))]);
    sock.reply(["EOSE", "search-1"]);
    expect((await done).map((r) => r.pubkey)).toEqual(["a".repeat(64)]);
  });

  it("waives the lens with include:spam when there is no house observer", async () => {
    houseMock.mockRejectedValue(new Error("nostr.json unreachable"));
    const done = searchNostrProfiles("jack");
    const { sock, search } = await opened();
    expect(search).toBe("jack include:spam");
    sock.reply(["EOSE", "search-1"]);
    await done;
  });

  it("ends on CLOSED instead of waiting out the timeout", async () => {
    houseMock.mockResolvedValue(HOUSE);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const done = searchNostrProfiles("jack", { timeoutMs: 60_000 });
    const { sock } = await opened();
    sock.reply(["CLOSED", "search-1", "auth-required: this relay answers through a web of trust"]);
    expect(await done).toEqual([]);
    warn.mockRestore();
  });

  it("keeps only kind-0 events", async () => {
    houseMock.mockResolvedValue(HOUSE);
    const done = searchNostrProfiles("jack");
    const { sock } = await opened();
    sock.reply(["EVENT", "search-1", profile("c".repeat(64), 30382)]);
    sock.reply(["EVENT", "search-1", profile("d".repeat(64))]);
    sock.reply(["EOSE", "search-1"]);
    expect((await done).map((r) => r.pubkey)).toEqual(["d".repeat(64)]);
  });
});
