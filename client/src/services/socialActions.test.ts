/**
 * The follow list is the most dangerous event this app publishes: kind 3 is
 * replaceable, so a short one overwrites a long one and the follows are gone.
 * `pickAuthoritativeBase` and the `unsafe` gate exist to make that impossible,
 * and until now neither had a test.
 *
 * These are characterisation tests. They were written against the hand-rolled tag
 * manipulation and must keep passing verbatim across the move to the library's
 * factories — that is what makes the move a swap rather than a rewrite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable } from "rxjs";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";

const publishToRelays = vi.fn(async () => ({ success: true }));
const signAs = vi.fn(async (_account: unknown, template: Record<string, unknown>) => ({
  ...template,
  id: "e".repeat(64),
  sig: "s".repeat(128),
}));
const activeAccount = vi.fn();
const submitFollowList = vi.fn(async () => undefined);
/** What the relays answer with, per kind. */
const relayHas = new Map<number, unknown[]>();
/** Events that live ONLY on one named relay, keyed `url|kind` — the recovery target. */
const relayOnlyHas = new Map<string, unknown[]>();
/** Relays that refuse the connection outright. */
const deadRelays = new Set<string>();
/** The outbox warm — tests make it "reveal" the real list by seeding relayHas. */
const fetchOutboxRelayList = vi.fn(async () => undefined as unknown);
/** Whether the active key was minted in this app (createdInApp). */
const createdInApp = vi.fn(() => false);

vi.mock("./nostr", () => ({
  publishToRelays: (...args: unknown[]) => publishToRelays(...(args as [])),
  loadOutboxRelayListFromDb: () => ["wss://one"],
  fetchOutboxRelayList: (...args: unknown[]) => fetchOutboxRelayList(...(args as [])),
}));

vi.mock("@/accounts/display", () => ({
  identityHas: () => createdInApp(),
}));

// The relay reads go through `lib/relayRequest` now, which reaches the pool
// directly rather than through `services/nostr`.
const poolRequest = vi.fn((relays: string[], filter: { kinds: number[] }) =>
  new Observable((subscriber) => {
    const timer = setTimeout(() => {
      if (relays.some((r) => deadRelays.has(r))) {
        subscriber.error(new Error("connection refused"));
        return;
      }
      const kind = filter.kinds[0];
      const events = [
        ...(relayHas.get(kind) ?? []),
        ...relays.flatMap((r) => relayOnlyHas.get(`${r}|${kind}`) ?? []),
      ];
      for (const event of events) subscriber.next(event);
      subscriber.complete();
    }, 0);
    return () => clearTimeout(timer);
  }),
);
vi.mock("@/lib/relayPool", () => ({
  pool: { request: (...args: unknown[]) => poolRequest(...(args as [string[], { kinds: number[] }])) },
}));
const storeAdd = vi.fn((e: unknown) => e);
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: (e: unknown) => storeAdd(e) } }));
// The real module drags in deployment config; the recovery path only needs the shape check.
vi.mock("@/config/tagging", () => ({
  isRelayUrl: (url: string) => /^wss?:\/\/[^\s/$.?#][^\s]*$/i.test(url.trim()),
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => activeAccount(),
  signAs: (...args: unknown[]) => signAs(...(args as [never, never])),
  signingFailure: (e: unknown) => ({ success: false, error: String(e) }),
}));

vi.mock("./api", () => ({ apiClient: { submitFollowList: () => submitFollowList() } }));
vi.mock("@/accounts/session", () => ({ activeHasSession: () => true }));

const ME = "a".repeat(64);
const THEM = "b".repeat(64);
const OTHER = "c".repeat(64);

function listEvent(kind: number, pubkeys: string[], created_at = 100) {
  return {
    id: `${kind}`.padStart(64, "d"),
    pubkey: ME,
    created_at,
    kind,
    tags: pubkeys.map((pk) => ["p", pk]),
    content: "",
    sig: "s".repeat(128),
  };
}

/** The tags of the event that was actually signed. */
const signedTags = () => (signAs.mock.calls.at(-1)?.[1] as { tags: string[][] })?.tags ?? [];
const signedPubkeys = () => signedTags().filter((t) => t[0] === "p").map((t) => t[1]);

let social: typeof import("./socialActions");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  localStorage.clear();
  relayHas.clear();
  relayOnlyHas.clear();
  deadRelays.clear();
  activeAccount.mockReturnValue({ pubkey: ME });
  publishToRelays.mockResolvedValue({ success: true });
  createdInApp.mockReturnValue(false);
  // clearAllMocks keeps implementations — restore the inert default so a
  // test's relay-seeding warm can't leak into its neighbours.
  fetchOutboxRelayList.mockImplementation(async () => undefined);
  social = await import("./socialActions");
});

describe("following", () => {
  it("adds one contact and keeps the rest", async () => {
    const base = listEvent(3, [OTHER]);

    const res = await social.followUser(THEM, base as never);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([OTHER, THEM]);
  });

  it("stamps the client tag exactly once", async () => {
    await social.followUser(THEM, listEvent(3, [OTHER]) as never);

    const client = signedTags().filter((t) => t[0] === "client");
    expect(client).toEqual([["client", "Brainstorm"]]);
  });

  it("is a no-op when they are already followed", async () => {
    const res = await social.followUser(THEM, listEvent(3, [THEM]) as never);

    expect(res.success).toBe(true);
    expect(signAs).not.toHaveBeenCalled();
  });

  // From-scratch without friction is reserved for keys minted in this app — the
  // only case where "no list exists anywhere" is a fact rather than a guess.
  it("publishes an empty list for an account created in this app", async () => {
    createdInApp.mockReturnValue(true);

    const res = await social.followUser(THEM, null);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([THEM]);
  });

  it("keeps the content of the list it is amending", async () => {
    const base = { ...listEvent(3, [OTHER]), content: '{"wss://relay":{"read":true}}' };

    await social.followUser(THEM, base as never);

    expect((signAs.mock.calls.at(-1)?.[1] as { content: string }).content).toBe(
      '{"wss://relay":{"read":true}}',
    );
  });
});

/**
 * The wipe guard. `knownFollowCount` remembers the longest list this device has
 * ever seen, and nothing may publish a shorter one over it.
 */
describe("a relay answering with a shorter list than we know about", () => {
  beforeEach(async () => {
    const { recordFollowList } = await import("@/lib/followStore");
    recordFollowList(ME, listEvent(3, [OTHER, "d".repeat(64), "f".repeat(64)]) as never, {
      authoritative: true,
    });
  });

  /**
   * It recovers rather than refusing: the stored copy is one of the candidates
   * `pickAuthoritativeBase` weighs, so the long list wins and the short relay
   * answer is simply ignored. The refusal branch is the belt-and-braces for a
   * store that has a count but no usable event — which is why the *outcome* to
   * assert here is "did not truncate", not "declined".
   */
  it("builds on the stored long list, not the short answer", async () => {
    const res = await social.followUser(THEM, listEvent(3, [OTHER]) as never);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toHaveLength(4); // the three we knew, plus the new one
    expect(signedPubkeys()).toContain(THEM);
  });

  it("unfollows out of the long list, so the other two survive", async () => {
    const res = await social.unfollowUser(OTHER, listEvent(3, [OTHER]) as never);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toHaveLength(2);
    expect(signedPubkeys()).not.toContain(OTHER);
  });

  it("takes the longest candidate when one of them is long enough", async () => {
    const full = listEvent(3, [OTHER, "d".repeat(64), "f".repeat(64)]);

    const res = await social.followUser(THEM, full as never);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toHaveLength(4);
  });
});

describe("unfollowing", () => {
  it("removes only the named contact", async () => {
    const res = await social.unfollowUser(THEM, listEvent(3, [OTHER, THEM]) as never);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([OTHER]);
  });

  it("is a no-op when they are not followed", async () => {
    const res = await social.unfollowUser(THEM, listEvent(3, [OTHER]) as never);

    expect(res.success).toBe(true);
    expect(signAs).not.toHaveBeenCalled();
  });

  it("refuses when there is no base at all — an unfollow cannot create a list", async () => {
    const res = await social.unfollowUser(THEM, null);

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
  });
});

/**
 * The from-scratch guard. A missing base for an imported key is ambiguous —
 * "no list exists" and "no relay answered" look identical — and publishing a
 * fresh kind-3 on a guess is how a real list gets replaced. Only a key minted
 * in this app, or an explicit user confirmation, may create a first list.
 */
describe("creating a first follow list", () => {
  it("refuses for an imported key when nothing was found anywhere", async () => {
    const res = await social.followPubkeys([THEM]);

    expect(res.success).toBe(false);
    expect(res.needsBaseConfirmation).toBe(true);
    expect(signAs).not.toHaveBeenCalled();
  });

  it("warms the outbox list and retries before giving up", async () => {
    // The first fetch (hardcoded profile relays) finds nothing; the warm makes
    // the user's real write relays reachable, and the retry finds the list.
    fetchOutboxRelayList.mockImplementationOnce(async () => {
      relayHas.set(3, [listEvent(3, [OTHER])]);
      return undefined;
    });

    const res = await social.followPubkeys([THEM]);

    expect(fetchOutboxRelayList).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([OTHER, THEM]); // merged, not from scratch
  });

  it("creates the list once the user has explicitly confirmed", async () => {
    const res = await social.followPubkeys([THEM], { allowFromScratch: true });

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([THEM]);
  });

  it("never asks a key created in this app for confirmation", async () => {
    createdInApp.mockReturnValue(true);

    const res = await social.followPubkeys([THEM]);

    expect(res.success).toBe(true);
    expect(res.needsBaseConfirmation).toBeUndefined();
    expect(fetchOutboxRelayList).not.toHaveBeenCalled();
    expect(signedPubkeys()).toEqual([THEM]);
  });

  it("applies the same guard to a single follow", async () => {
    const refused = await social.followUser(THEM, null);
    expect(refused.success).toBe(false);
    expect(refused.needsBaseConfirmation).toBe(true);
    expect(signAs).not.toHaveBeenCalled();

    const confirmed = await social.followUser(THEM, null, { allowFromScratch: true });
    expect(confirmed.success).toBe(true);
    expect(signedPubkeys()).toEqual([THEM]);
  });

  it("merges onto a recovered base handed in as cachedBase, even with quiet relays", async () => {
    // The relays answer nothing and the floor write may have failed — the
    // explicitly-passed base alone must be enough to avoid the dialog loop.
    const res = await social.followPubkeys([THEM], { cachedBase: listEvent(3, [OTHER]) as never });

    expect(res.success).toBe(true);
    expect(res.needsBaseConfirmation).toBeUndefined();
    expect(signedPubkeys()).toEqual([OTHER, THEM]);
  });

  it("a known floor still beats everything — refusal, not a dialog", async () => {
    // The store has a count but no usable event (corrupt row): unsafe wins and
    // the outcome is a retryable failure, never a from-scratch confirmation.
    localStorage.setItem(
      `brainstorm_known_follows:${ME}`,
      JSON.stringify({ event: { tags: [["p", OTHER]] }, count: 5, updated_at: 1 }),
    );

    const res = await social.followPubkeys([THEM]);

    expect(res.success).toBe(false);
    expect(res.needsBaseConfirmation).toBeUndefined();
    expect(signAs).not.toHaveBeenCalled();
  });
});

describe("following several at once", () => {
  it("merges them into the base in one signed event", async () => {
    relayHas.set(3, [listEvent(3, [OTHER])]);

    const res = await social.followPubkeys([THEM, "d".repeat(64)]);

    expect(res.success).toBe(true);
    expect(signAs).toHaveBeenCalledTimes(1);
    expect(signedPubkeys()).toEqual([OTHER, THEM, "d".repeat(64)]);
  });

  it("skips the ones already there", async () => {
    relayHas.set(3, [listEvent(3, [OTHER, THEM])]);

    await social.followPubkeys([THEM, "d".repeat(64)]);

    expect(signedPubkeys()).toEqual([OTHER, THEM, "d".repeat(64)]);
  });
});

/**
 * Recovery from a user-named relay — the one path where events enter the app
 * from a relay the user typed rather than one we ship. Nothing may be kept
 * unless it cryptographically proves to be the Account's own list, which is why
 * these events are signed for real instead of carrying the file's fake sigs.
 */
describe("recovering a follow list from a named relay", () => {
  const MY_RELAY = "wss://my.relay";
  const sk = generateSecretKey();
  const PK = getPublicKey(sk);

  const signList = (kind: number, pubkeys: string[], key = sk, created_at = 100) =>
    finalizeEvent(
      { kind, created_at, tags: pubkeys.map((pk) => ["p", pk]), content: "" },
      key,
    );

  /** The fire-and-forget backend ingest needs a tick to land before asserting. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("recovers a verified list: floor + store + backend ingest, and no publish", async () => {
    relayOnlyHas.set(`${MY_RELAY}|3`, [signList(3, [OTHER, THEM])]);

    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toMatchObject({ found: true, follows: 2 });
    const { loadKnownFollowList } = await import("@/lib/followStore");
    expect(loadKnownFollowList(PK)?.count).toBe(2);
    expect(storeAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 3 }));
    await settle();
    expect(submitFollowList).toHaveBeenCalledTimes(1);
    // API submit only — recovery never publishes; the merge that follows does.
    expect(publishToRelays).not.toHaveBeenCalled();
    expect(signAs).not.toHaveBeenCalled();
  });

  it("normalizes the typed URL before asking the pool", async () => {
    relayOnlyHas.set(`${MY_RELAY}|3`, [signList(3, [OTHER])]);

    const res = await social.recoverFollowListFromRelay(PK, `  ${MY_RELAY}/  `);

    expect(res).toMatchObject({ found: true, follows: 1 });
  });

  it("rejects a forged copy and keeps nothing", async () => {
    relayOnlyHas.set(`${MY_RELAY}|3`, [{ ...signList(3, [OTHER]), sig: "f".repeat(128) }]);

    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toMatchObject({ found: false, error: expect.stringContaining("invalid copy") });
    const { loadKnownFollowList } = await import("@/lib/followStore");
    expect(loadKnownFollowList(PK)).toBeNull();
    expect(storeAdd).not.toHaveBeenCalled();
    await settle();
    expect(submitFollowList).not.toHaveBeenCalled();
  });

  it("rejects a validly-signed list that belongs to someone else", async () => {
    // The `authors` filter is a request; a hostile relay answers with whatever
    // it likes. A stranger's real signature must not count as ours.
    relayOnlyHas.set(`${MY_RELAY}|3`, [signList(3, [OTHER], generateSecretKey())]);

    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toMatchObject({ found: false, error: expect.stringContaining("invalid copy") });
    expect(storeAdd).not.toHaveBeenCalled();
  });

  it("reads an answering-but-empty relay as not-found, with no error", async () => {
    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toEqual({ found: false });
  });

  it("reads a refused connection as an error, distinct from not-found", async () => {
    deadRelays.add(MY_RELAY);

    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toMatchObject({ found: false, error: expect.stringContaining("reach") });
  });

  it("refuses a non-relay URL without touching the network", async () => {
    const res = await social.recoverFollowListFromRelay(PK, "https://not-a.relay");

    expect(res).toMatchObject({ found: false, error: expect.stringContaining("wss://") });
    expect(poolRequest).not.toHaveBeenCalled();
  });

  it("treats a signed empty list as found — proof the from-scratch shape is safe", async () => {
    relayOnlyHas.set(`${MY_RELAY}|3`, [signList(3, [])]);

    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toMatchObject({ found: true, follows: 0 });
  });

  it("keeps a verified kind-10002 riding along, so the merge finds the real write relays", async () => {
    relayOnlyHas.set(`${MY_RELAY}|3`, [signList(3, [OTHER])]);
    relayOnlyHas.set(`${MY_RELAY}|10002`, [
      finalizeEvent({ kind: 10002, created_at: 100, tags: [["r", "wss://mine"]], content: "" }, sk),
    ]);

    await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(storeAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 10002 }));
  });

  it("drops a forged kind-10002 even when the kind-3 is genuine", async () => {
    relayOnlyHas.set(`${MY_RELAY}|3`, [signList(3, [OTHER])]);
    relayOnlyHas.set(`${MY_RELAY}|10002`, [
      finalizeEvent({ kind: 10002, created_at: 100, tags: [["r", "wss://evil"]], content: "" }, generateSecretKey()),
    ]);

    const res = await social.recoverFollowListFromRelay(PK, MY_RELAY);

    expect(res).toMatchObject({ found: true });
    expect(storeAdd).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 10002 }));
  });
});

describe("muting", () => {
  it("adds a pubkey to the existing list", async () => {
    relayHas.set(10000, [listEvent(10000, [OTHER])]);

    const res = await social.muteUser(THEM);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([OTHER, THEM]);
  });

  it("removes one on unmute", async () => {
    relayHas.set(10000, [listEvent(10000, [OTHER, THEM])]);

    const res = await social.unmuteUser(THEM);

    expect(res.success).toBe(true);
    expect(signedPubkeys()).toEqual([OTHER]);
  });

  it("refuses when the mute list could not be read, rather than replacing it", async () => {
    const res = await social.muteUser(THEM);

    expect(res.success).toBe(false);
    expect(signAs).not.toHaveBeenCalled();
  });

  /**
   * A kind-10000 carries more than `p` tags — muted threads, words and hashtags
   * live there too, and a wholesale replace that only understood `p` would drop
   * every one of them.
   */
  it("leaves muted words and threads alone", async () => {
    const withExtras = {
      ...listEvent(10000, [OTHER]),
      tags: [["p", OTHER], ["word", "spam"], ["t", "nsfw"], ["e", "f".repeat(64)]],
    };
    relayHas.set(10000, [withExtras]);

    await social.muteUser(THEM);

    expect(signedTags()).toEqual(
      expect.arrayContaining([["word", "spam"], ["t", "nsfw"], ["e", "f".repeat(64)]]),
    );
  });
});
