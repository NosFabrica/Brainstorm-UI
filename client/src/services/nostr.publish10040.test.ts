// @vitest-environment node
/**
 * Where a NIP-85 declaration goes. A kind-10040 points other apps at the relay
 * that holds this account's scores and Trusted Lists — so that relay has to
 * hold the declaration too. It used to go only to the author's outbox relays,
 * which meant Brainstorm's own relay never saw the note naming it.
 *
 * Node, not jsdom: the event is really signed, as in `nostr.publishProfile.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const publish = vi.fn();
const relayPublish = vi.fn();
const outbox: { event: { tags: string[][] } | undefined } = { event: undefined };

vi.mock("@/lib/relayPool", () => ({
  pool: {
    publish: (...args: unknown[]) => publish(...args),
    relay: (url: string) => ({ publish: (...args: unknown[]) => relayPublish(url, ...args) }),
  },
}));

vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (kind: number) => (kind === 10002 ? outbox.event : undefined),
    getEvent: () => undefined,
    add: (e: unknown) => e,
  },
}));

vi.mock("@/lib/runtimeEnv", () => ({
  env: {
    VITE_NIP85_RELAY_URL: "wss://nip85-staging.example",
    VITE_API_URL: "",
    VITE_TAG_RELAY_URLS: "",
    VITE_WOT_SEARCH_RELAY: "",
    VITE_SEARCH_RELAY_URL: "",
    VITE_FEATURE_AGENT_SUITE: "",
    VITE_FEATURE_ASSISTANTS_ADMIN: "",
  },
}));

const SECRET = new Uint8Array(32).fill(7);
const PUBKEY = getPublicKey(SECRET);

const NIP85 = "wss://nip85-staging.example";

const relayList = (...urls: string[]) => ({ kind: 10002, tags: urls.map((u) => ["r", u]) });

let nostr: typeof import("./nostr");

const signed = (kind: number) =>
  finalizeEvent({ kind, created_at: 0, tags: [], content: "" } as never, SECRET);

/** The relay list a publish actually targeted, however it was sent. */
const targeted = (): string[] =>
  publish.mock.calls.length
    ? (publish.mock.calls[0]?.[0] as string[])
    : relayPublish.mock.calls.map((call) => call[0] as string);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  outbox.event = undefined;
  publish.mockResolvedValue([{ ok: true, from: "wss://relay.damus.io/", message: "" }]);
  relayPublish.mockResolvedValue({ ok: true, message: "" });
  nostr = await import("./nostr");
});

describe("publishing a NIP-85 declaration", () => {
  it("sends it to Brainstorm's NIP-85 relay as well as the author's own", async () => {
    outbox.event = relayList("wss://my.relay/");

    await nostr.publishToRelays(signed(10040));

    // `uniqueRelays` hands back its normalized form — no trailing slash.
    expect(targeted()).toContain(NIP85);
    expect(targeted()).toContain("wss://my.relay");
    expect(targeted()).toContain("wss://relay.damus.io");
  });

  it("names the NIP-85 relay once when the author already publishes there", async () => {
    outbox.event = relayList(`${NIP85}/`);

    await nostr.publishToRelays(signed(10040));

    expect(targeted().filter((url) => url.includes("nip85-staging"))).toHaveLength(1);
  });

  it("reaches it on the quorum path too — the one the Activate and Update buttons use", async () => {
    await nostr.publishToRelays(signed(10040), undefined, { need: 2, timeoutMs: 8000 });

    expect(targeted()).toContain(NIP85);
  });

  it("leaves every other kind publishing exactly where it did", async () => {
    outbox.event = relayList("wss://my.relay/");

    await nostr.publishToRelays(signed(1));

    expect(targeted()).not.toContain(NIP85);
  });
});
