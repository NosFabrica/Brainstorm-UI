import { describe, it, expect } from "vitest";
import { createHouseTrustSource } from "@/lib/tagging-sdk/trust";
import { TRUST_SETTINGS, NIP85_AUTHOR_PUBKEYS } from "./tagging";

/**
 * The trust predicate, exercised through the REAL shipped settings.
 *
 * Issue #41 B1: the shipped predicate admitted every asserter — 105 of 105 on
 * the live corpus, 0 rejected — so a throwaway account with no standing had the
 * same weight as anyone else, and its taggings showed on real profiles.
 *
 * The cases below are the reported profile
 * (`2aa46e1f18c8…`), with each asserter's real published score as measured on
 * 2026-08-11. That is deliberate: this file is the regression test for a
 * specific screenshot, not for an abstract policy.
 */

const HEX = (seed: string) => seed.repeat(64).slice(0, 64);

// The three real asserters on the reported profile.
const DAVID = "e5272de914bd" + HEX("0").slice(12); // rank 100 on both corpora
const SUBJECT = "2aa46e1f18c8" + HEX("1").slice(12); // self-tag, no score
const THROWAWAY = "a9e96194e7fc" + HEX("2").slice(12); // "Brainstorm QA Alpha", no score

/** A relay that knows about `scored` and has never heard of anyone else. */
function trustSourceOver(scored: Record<string, { rank: number; hops?: number }>) {
  return createHouseTrustSource({
    fetchEvents: async ({ "#d": subjects }: { "#d": string[] }) =>
      subjects
        .filter((pk) => scored[pk])
        .map((pk) => ({
          kind: 30382,
          pubkey: NIP85_AUTHOR_PUBKEYS[0],
          created_at: 1_700_000_000,
          tags: [
            ["d", pk],
            ["rank", String(scored[pk].rank)],
            ...(scored[pk].hops === undefined ? [] : [["hops", String(scored[pk].hops)]]),
          ],
        })),
    assertionAuthorPubkeys: NIP85_AUTHOR_PUBKEYS,
    minRank: TRUST_SETTINGS.minRank,
    maxHops: TRUST_SETTINGS.maxHops,
    unknownPolicy: TRUST_SETTINGS.unknownPolicy,
  });
}

describe("asserter trust policy (shipped settings)", () => {
  it("rejects an asserter with no published score", async () => {
    // The whole of B1. If this passes with `unknownPolicy: "trusted"` restored,
    // the flip has been reverted and the reported bug is back.
    const src = trustSourceOver({ [DAVID]: { rank: 100 } });
    await src.ensure([DAVID, THROWAWAY]);
    expect(src.predicate(THROWAWAY)).toBe(false);
  });

  it("reproduces the reported profile: keeps the scored voice, drops the other two", async () => {
    const src = trustSourceOver({ [DAVID]: { rank: 100 } });
    await src.ensure([DAVID, SUBJECT, THROWAWAY]);

    expect(src.predicate(DAVID)).toBe(true);
    // Both unscored — including the subject's own self-tag. This is what the
    // reference client does, and it is why the "only you can see this" line on
    // your own tags is part of the same change rather than a nicety.
    expect(src.predicate(SUBJECT)).toBe(false);
    expect(src.predicate(THROWAWAY)).toBe(false);
  });

  it("does not reject a scored asserter merely for lacking hops", async () => {
    // The corpus we read publishes no `hops`, and the SDK reads a missing one
    // as 999 ("unreachable"). With the kit's `maxHops: 20` this inverted the
    // filter — every SCORED asserter failed while unscored ones sailed through.
    const src = trustSourceOver({ [DAVID]: { rank: 100 } }); // no hops tag
    await src.ensure([DAVID]);
    expect(src.predicate(DAVID)).toBe(true);
  });

  it("still admits a scored asserter once hops IS published", async () => {
    // Brainstorm's own corpus publishes hops 2–5 (measured 2026-08-11). The 999
    // override must not turn into a filter when we repoint at it (#41 B1-proper).
    const src = trustSourceOver({ [DAVID]: { rank: 100, hops: 5 } });
    await src.ensure([DAVID]);
    expect(src.predicate(DAVID)).toBe(true);
  });

  it("treats an unreachable trust relay as untrusted, not as a free pass", async () => {
    // Failing OPEN here would reintroduce B1 under a different trigger: an
    // outage would put every unfiltered tagging back on screen.
    const src = createHouseTrustSource({
      fetchEvents: async () => {
        throw new Error("relay unreachable");
      },
      assertionAuthorPubkeys: NIP85_AUTHOR_PUBKEYS,
      minRank: TRUST_SETTINGS.minRank,
      maxHops: TRUST_SETTINGS.maxHops,
      unknownPolicy: TRUST_SETTINGS.unknownPolicy,
    });
    await src.ensure([DAVID, THROWAWAY]);
    expect(src.predicate(DAVID)).toBe(false);
    expect(src.predicate(THROWAWAY)).toBe(false);
  });

  it("ships the strict policy", () => {
    // Guards the config value itself. `unknownPolicy` is a string the SDK
    // compares against 'trusted' — ANY other value means "unscored doesn't
    // count", so this asserts the intent rather than the spelling.
    expect(TRUST_SETTINGS.unknownPolicy).not.toBe("trusted");
  });
});
