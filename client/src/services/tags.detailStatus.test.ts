import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `fetchTagDetail`'s existence check — issue #41 B3.
 *
 * The reported defect: `/tags/<any npub>/<any string>` rendered a complete,
 * branded page whose headline was the attacker's string and whose byline read
 * "Tag created by <that npub's real display name>", linked to their profile. No
 * account, no signing key, and nothing on a relay to take down. The read never
 * checked whether the tag existed — it synthesized an identity from the URL.
 *
 * The fix has to distinguish three cases, and getting any pair of them confused
 * is its own bug:
 *   - real tag                → render it
 *   - nothing there           → not-found, and the slug must appear NOWHERE
 *   - relays didn't answer    → "can't load", NOT not-found; 404-ing a real tag
 *                               because a relay blinked is the mirror-image
 *                               mistake
 */

const AUTHOR = "a".repeat(64);
const SLUG = "this-label-was-never-created-by-anyone";

const relay = vi.hoisted(() => ({ handler: vi.fn() }));

vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: (filter: Record<string, unknown>) => relay.handler(filter),
  fetchProfileMap: async () => new Map(),
  hasLocalSecretKey: () => false,
  loadOutboxRelayListFromDb: () => [],
  pool: { publish: async () => [] },
}));

/** A tag-element (kind 39999) as the hub stores it. */
const element = (slug: string, name: string) => ({
  id: "e".repeat(64),
  kind: 39999,
  pubkey: AUTHOR,
  created_at: 1_700_000_000,
  content: JSON.stringify({ tag: { name } }),
  tags: [["d", slug]],
});

/** A tagging (kind 39999 assertion) applying the tag to someone. */
const tagging = (slug: string, target: string) => ({
  id: "f".repeat(64),
  kind: 39999,
  pubkey: "c".repeat(64),
  created_at: 1_700_000_100,
  content: "",
  tags: [
    ["d", slug],
    ["a", `39998:${AUTHOR}:${slug}`],
    ["p", target],
    ["polarity", "1"],
  ],
});

async function detail() {
  const { fetchTagDetail } = await import("./tags");
  return fetchTagDetail(AUTHOR, SLUG);
}

beforeEach(() => {
  vi.resetModules();
  relay.handler.mockReset();
});

describe("fetchTagDetail existence check", () => {
  it("reports a fabricated URL as absent", async () => {
    // Every read succeeds and finds nothing — the exact shape of an invented
    // link. This is the reproduction from the issue.
    relay.handler.mockResolvedValue([]);
    const result = await detail();
    expect(result.status).toBe("absent");
  });

  it("does not report absent when the relays failed to answer", async () => {
    // The old code swallowed this throw, making a dead relay indistinguishable
    // from a nonexistent tag. A 404 here would tell people a real tag is gone.
    relay.handler.mockRejectedValue(new Error("relay unreachable"));
    const result = await detail();
    expect(result.status).toBe("unavailable");
    expect(result.status).not.toBe("absent");
  });

  it("reports a minted-but-unused tag as real", async () => {
    // Minting and applying are separate acts. A tag with an element and no
    // carriers legitimately exists, and must not 404.
    relay.handler.mockImplementation(async (f: Record<string, unknown>) =>
      (f["#d"] as string[])?.includes(SLUG) ? [element(SLUG, "Never Created")] : [],
    );
    const result = await detail();
    expect(result.status).toBe("ok");
    expect(result.carriers).toHaveLength(0);
  });

  it("reports a tag as real when people have applied it, even with no element", async () => {
    // The guard that stops this fix breaking legitimate pages: an element that
    // never propagated to our relay set, on a tag people genuinely use.
    relay.handler.mockImplementation(async (f: Record<string, unknown>) => {
      const kinds = f.kinds as number[];
      if ((f["#d"] as string[])?.includes(SLUG) && f.authors) return []; // no element
      return kinds?.includes(39999) ? [tagging(SLUG, "b".repeat(64))] : [];
    });
    const result = await detail();
    expect(result.status).toBe("ok");
  });
});
