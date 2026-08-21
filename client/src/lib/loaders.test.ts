// @vitest-environment node
/**
 * The two claims ticket 04 is actually about, each counted rather than asserted
 * by shape:
 *
 *   1. A profile already in the EventStore costs no relay request.
 *   2. Three callers asking for overlapping authors in the same tick issue one
 *      REQ between them, not three.
 *
 * Both are counted against a fake pool, because "how many REQs left the browser"
 * is the whole point and nothing else can answer it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable } from "rxjs";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { NostrEvent } from "nostr-tools";

/** Every REQ the loader issues, with the filters it carried. */
const requests: unknown[][] = [];
/** Profiles the fake relays hold, by pubkey. */
const relayHas = new Map<string, NostrEvent>();

vi.mock("./relayPool", () => ({
  pool: {
    request: (relays: unknown, filters: unknown) => {
      requests.push([relays, filters]);
      const asArray = Array.isArray(filters) ? filters : [filters];
      const authors = asArray.flatMap((f) => (f as { authors?: string[] })?.authors ?? []);
      // Asynchronously, as a relay answers. Emitting on subscribe would complete
      // the shared batch before the other pointers had attached to it, and every
      // caller but the first would see nothing — an artefact of the fake, not of
      // the loader.
      return new Observable<NostrEvent>((subscriber) => {
        const timer = setTimeout(() => {
          for (const pubkey of authors) {
            const event = relayHas.get(pubkey);
            if (event) subscriber.next(event);
          }
          subscriber.complete();
        }, 0);
        return () => clearTimeout(timer);
      });
    },
  },
}));

const { eventStore } = await import("./eventStore");
const { addressLoader, loadReplaceable } = await import("./loaders");

function profile(name: string): NostrEvent {
  const secret = generateSecretKey();
  return finalizeEvent(
    { kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name }) },
    secret,
  ) as NostrEvent;
}

beforeEach(() => {
  requests.length = 0;
  relayHas.clear();
});

describe("a profile the store already holds", () => {
  it("costs no relay request at all", async () => {
    const held = profile("ana");
    eventStore.add(held);

    const found = await loadReplaceable(0, held.pubkey);

    expect(found?.id).toBe(held.id);
    expect(requests).toHaveLength(0);
  });

  it("still goes to the relays for one it does not hold", async () => {
    const wanted = profile("bo");
    relayHas.set(wanted.pubkey, wanted);

    const found = await loadReplaceable(0, wanted.pubkey);

    expect(found?.id).toBe(wanted.id);
    expect(requests).toHaveLength(1);
  });
});

/**
 * The dashboard case: articles, alerts and the thread module each ask for their
 * own author set on mount, overlapping but not identical, under three different
 * react-query keys that react-query cannot collapse.
 */
describe("three callers asking for overlapping authors in one tick", () => {
  it("issues one REQ between them, not three", async () => {
    const [a, b, c, d] = [profile("a"), profile("b"), profile("c"), profile("d")];
    for (const event of [a, b, c, d]) relayHas.set(event.pubkey, event);

    const articles = Promise.all([a, b].map((e) => loadReplaceable(0, e.pubkey)));
    const alerts = Promise.all([b, c].map((e) => loadReplaceable(0, e.pubkey)));
    const thread = Promise.all([c, d].map((e) => loadReplaceable(0, e.pubkey)));
    const found = (await Promise.all([articles, alerts, thread])).flat();

    expect(found.filter(Boolean)).toHaveLength(6);
    expect(requests).toHaveLength(1);

    // and the one REQ asked for each distinct author once
    const filters = requests[0][1] as { authors?: string[] } | { authors?: string[] }[];
    const authors = (Array.isArray(filters) ? filters : [filters]).flatMap((f) => f.authors ?? []);
    expect(new Set(authors).size).toBe(4);
  });

  it("does not re-request the ones the store picked up along the way", async () => {
    const [a, b] = [profile("a"), profile("b")];
    for (const event of [a, b]) relayHas.set(event.pubkey, event);

    await Promise.all([a, b].map((e) => loadReplaceable(0, e.pubkey)));
    expect(requests).toHaveLength(1);

    // a second screen wants the same two
    await Promise.all([a, b].map((e) => loadReplaceable(0, e.pubkey)));
    expect(requests).toHaveLength(1);
  });
});

/**
 * The admin health card passes operator-entered relays to `fetchProfileEvent` to
 * find out whether *those relays* carry the kind-0. Store-first turned that into
 * a question about memory.
 */
describe("a caller asking about specific relays", () => {
  it("goes to them even when the store already has the profile", async () => {
    const held = profile("ana");
    eventStore.add(held);
    relayHas.set(held.pubkey, held);

    const found = await loadReplaceable(0, held.pubkey, { relays: ["wss://probe"], fromRelays: true });

    expect(found?.id).toBe(held.id);
    expect(requests).toHaveLength(1);
    // normalised by the loader, hence the trailing slash
    expect(requests[0][0]).toEqual(["wss://probe/"]);
  });

  it("still answers from the store for an ordinary read", async () => {
    const held = profile("ana");
    eventStore.add(held);

    await loadReplaceable(0, held.pubkey, { relays: ["wss://probe"] });

    expect(requests).toHaveLength(0);
  });
});

describe("the loader observable", () => {
  it("requests nothing until it is subscribed", async () => {
    const wanted = profile("cold");
    relayHas.set(wanted.pubkey, wanted);

    // held, never subscribed — the mistake the applesauce docs warn about
    addressLoader({ kind: 0, pubkey: wanted.pubkey });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(requests).toHaveLength(0);
  });
});
