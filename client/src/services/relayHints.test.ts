// @vitest-environment node
/**
 * Whose relay each hint names.
 *
 * A hint says "the thing this tag points at can be found here". Which relay
 * that is depends on the TAG, not the event: a `p` names a person, an `a` names
 * a coordinate whose author is inside it, and an `e` names somebody's event.
 * The easy mistake is computing one hint per event and stamping it on all three
 * — right for an RSVP, where every tag points at the host, and wrong for a
 * retraction, where the `e` and `a` point at the viewer's own event and only
 * the `p` points at anyone else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);
const MY_RELAY = "wss://mine.example/";
const THEIR_RELAY = "wss://theirs.example/";

const held = new Map<string, NostrEvent>();
const signed: Record<string, unknown>[] = [];

vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (kind: number, pubkey: string) => held.get(`${kind}:${pubkey}`),
    getEvent: () => undefined,
    add: (e: unknown) => e,
  },
}));
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
  loadReplaceable: async () => undefined,
}));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: ME }),
  requireActiveAccount: () => ({ pubkey: ME }),
  signAs: async (_a: unknown, template: Record<string, unknown>) => {
    signed.push(template);
    return { ...template, pubkey: ME, id: "e".repeat(64), sig: "s" };
  },
  signingFailure: (e: unknown) => ({ success: false, error: String(e) }),
}));
vi.mock("@/services/nostr", () => ({
  publishToRelays: async () => ({ success: true }),
  pool: { publish: async () => [{ ok: true, from: "wss://x", message: "" }] },
  fetchEventsByFilter: async () => [],
}));

const relayList = (pubkey: string, url: string): NostrEvent =>
  ({ id: "1".repeat(64), kind: 10002, pubkey, created_at: 1, tags: [["r", url]], content: "", sig: "s" }) as NostrEvent;

/** The hint in a tag, or undefined for a bare one. */
const hintOf = (tags: string[][], name: string, value?: string) =>
  tags.find((t) => t[0] === name && (value === undefined || t[1] === value))?.[2];

beforeEach(async () => {
  vi.clearAllMocks();
  signed.length = 0;
  held.clear();
  held.set(`10002:${ME}`, relayList(ME, "wss://mine.example"));
  held.set(`10002:${THEM}`, relayList(THEM, "wss://theirs.example"));
  const { resetRelayRoutingCache } = await import("@/lib/relayRouting");
  resetRelayRoutingCache();
});

describe("an RSVP, where every tag points at the host", () => {
  it("hints the host on the a, the e and the p alike", async () => {
    const { publishRsvp } = await import("./rsvp");
    await publishRsvp({ id: "f".repeat(64), pubkey: THEM, kind: 31923, tags: [["d", "party"]] } as never);

    const tags = signed[0].tags as string[][];
    expect(hintOf(tags, "a")).toBe(THEIR_RELAY);
    expect(hintOf(tags, "e")).toBe(THEIR_RELAY);
    expect(hintOf(tags, "p")).toBe(THEIR_RELAY);
  });
});

describe("a retraction, where the tags point two different ways", () => {
  it("hints the viewer's own relay on what it deletes, and the host's on the p", async () => {
    const { withdrawRsvp } = await import("./rsvp");
    await withdrawRsvp({ id: "c".repeat(64), d: "xyz" }, THEM);

    const tags = signed[0].tags as string[][];
    // The RSVP being withdrawn is the VIEWER's event.
    expect(hintOf(tags, "e")).toBe(MY_RELAY);
    expect(hintOf(tags, "a")).toBe(MY_RELAY);
    // The person it concerns is not.
    expect(hintOf(tags, "p")).toBe(THEIR_RELAY);
  });

  it("does the same for a revoked vouch", async () => {
    const { revokeVouch } = await import("./vouches");
    await revokeVouch(THEM, "d".repeat(64));

    const tags = signed[0].tags as string[][];
    expect(hintOf(tags, "e")).toBe(MY_RELAY);
    expect(hintOf(tags, "a")).toBe(MY_RELAY);
    expect(hintOf(tags, "p")).toBe(THEIR_RELAY);
  });
});

describe("a follow list", () => {
  /**
   * NIP-02 is `["p", <pubkey>, <relay>, <petname>]`, and those hints are how
   * other clients bootstrap routing for the people you follow.
   */
  it("carries a relay hint for the person followed", async () => {
    const { followUser } = await import("./socialActions");
    await followUser(THEM, { kind: 3, pubkey: ME, created_at: 1, tags: [], content: "" } as never);

    const contacts = signed.find((t) => t.kind === 3);
    expect(hintOf(contacts?.tags as string[][], "p", THEM)).toBe(THEIR_RELAY);
  });
});
