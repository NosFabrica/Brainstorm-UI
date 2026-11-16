import { describe, expect, it } from "vitest";
import type { NostrEvent } from "applesauce-core/helpers";

import {
  declaresLists,
  declaresTrustProvider,
  describeDesignation,
  listRows,
  mergeDesignation,
  missingSignals,
  planDesignation,
  rankProviderOf,
  signalRows,
  trustProviderStatusOf,
  withoutProvider,
} from "./nip85Declaration";

const TA = "a".repeat(64);
const OTHER_TA = "b".repeat(64);
const RELAY = "wss://nip85.example.com";

function event10040(tags: string[][]): NostrEvent {
  return {
    id: "0".repeat(64),
    pubkey: "c".repeat(64),
    created_at: 1700000000,
    kind: 10040,
    tags,
    content: "",
    sig: "d".repeat(128),
  };
}

describe("declaresTrustProvider", () => {
  it("accepts a declaration naming our TA on our relay for both rank and followers", () => {
    const event = event10040([
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(true);
  });

  it("rejects a declaration pointing at a different TA", () => {
    const event = event10040([
      ["30382:rank", OTHER_TA, RELAY],
      ["30382:followers", OTHER_TA, RELAY],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(false);
  });

  // Brainstorm publishes both metrics; a rank-only declaration is stale or
  // partial, and prompting for a re-sign is the remedy.
  it("rejects when the followers tag is missing", () => {
    const event = event10040([["30382:rank", TA, RELAY]]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(false);
  });

  it("rejects when the relay hint differs", () => {
    const event = event10040([
      ["30382:rank", TA, "wss://elsewhere.example.com"],
      ["30382:followers", TA, "wss://elsewhere.example.com"],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(false);
  });

  // An empty-tags 10040 is the NIP-85 deactivation form.
  it("rejects a deactivation (empty tag list)", () => {
    expect(declaresTrustProvider(event10040([]), TA, RELAY)).toBe(false);
  });

  // Guards the caller that hasn't been assigned a TA yet — an empty expected
  // key must never accidentally match a malformed tag.
  it("rejects when the expected TA is empty", () => {
    const event = event10040([
      ["30382:rank", "", RELAY],
      ["30382:followers", "", RELAY],
    ]);
    expect(declaresTrustProvider(event, "", RELAY)).toBe(false);
  });

  it("accepts when matching tags sit among unrelated ones", () => {
    const event = event10040([
      ["30382:rank", OTHER_TA, RELAY],
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
      ["30382:hops", TA, RELAY],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(true);
  });
});

// Trusted Lists are published by the same Brainstorm assistant; other apps find
// them through the 10040. Adding them must not cost the user anything already
// in their 10040 — another provider's rows included.
/**
 * Issue #313: the Assistant signs five assertion signals, and the Treasure Map
 * must give it every one — a Map of rank and followers alone left reporters,
 * muters and hops with no provider, so other apps couldn't find them.
 */
describe("signalRows", () => {
  it("gives the assistant every signal it publishes, on the relay it publishes to", () => {
    expect(signalRows(TA, RELAY)).toEqual([
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
      ["30382:reporters", TA, RELAY],
      ["30382:muters", TA, RELAY],
      ["30382:hops", TA, RELAY],
    ]);
  });

  it("merged over a Map naming another provider, that provider's row survives", () => {
    const theirs = [["30382:something-else", OTHER_TA, "wss://elsewhere.example.com"]];
    const merged = mergeDesignation(theirs, signalRows(TA, RELAY));
    expect(merged).toContainEqual(theirs[0]);
    expect(merged).toHaveLength(6);
  });
});

/**
 * The other half of #313: a Map that gives your own Assistant the rank duty but
 * not every signal is asked for again. One that gives rank to another
 * Assistant is that service's to complete, so nothing is missing from ours.
 */
describe("missingSignals", () => {
  it("names the signals a rank-and-followers Map leaves without a provider", () => {
    const event = event10040([
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
    ]);
    expect(missingSignals(event, TA, RELAY)).toEqual(["30382:reporters", "30382:muters", "30382:hops"]);
  });

  it("is nothing when the Map gives the Assistant every signal", () => {
    expect(missingSignals(event10040(signalRows(TA, RELAY)), TA, RELAY)).toEqual([]);
  });

  it("is nothing when another Assistant has the rank duty, whatever else is missing", () => {
    const event = event10040([["30382:rank", OTHER_TA, RELAY]]);
    expect(missingSignals(event, TA, RELAY)).toEqual([]);
  });

  it("is nothing with no Map, a deactivation, or no Assistant to name", () => {
    expect(missingSignals(null, TA, RELAY)).toEqual([]);
    expect(missingSignals(event10040([]), TA, RELAY)).toEqual([]);
    expect(missingSignals(event10040([["30382:rank", "", RELAY]]), "", RELAY)).toEqual([]);
  });

  it("a signal naming the Assistant on another relay still counts as missing here", () => {
    const event = event10040([
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
      ["30382:reporters", TA, "wss://elsewhere.example.com"],
      ["30382:muters", TA, RELAY],
      ["30382:hops", TA, RELAY],
    ]);
    expect(missingSignals(event, TA, RELAY)).toEqual(["30382:reporters"]);
  });
});

describe("listRows / mergeDesignation", () => {
  const LISTS = { key: "e".repeat(64), relay: "wss://nip85-staging.example" };

  it("names the assistant for every Trusted List kind", () => {
    expect(listRows(LISTS)).toEqual([
      ["30392", LISTS.key, LISTS.relay],
      ["30393", LISTS.key, LISTS.relay],
      ["30394", LISTS.key, LISTS.relay],
    ]);
  });

  it("replaces only the rows it sets and keeps every other tag", () => {
    const existing = [
      ["30382:rank", OTHER_TA, RELAY],
      ["30382:hops", OTHER_TA, RELAY],
      ["30383:rank", "f".repeat(64), "wss://someone-else.example"],
    ];
    const merged = mergeDesignation(existing, [
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
      ...listRows(LISTS),
    ]);

    expect(merged).toContainEqual(["30382:hops", OTHER_TA, RELAY]);
    expect(merged).toContainEqual(["30383:rank", "f".repeat(64), "wss://someone-else.example"]);
    expect(merged).toContainEqual(["30382:rank", TA, RELAY]);
    expect(merged).not.toContainEqual(["30382:rank", OTHER_TA, RELAY]);
    expect(merged.filter((t) => t[0] === "30382:rank")).toHaveLength(1);
    expect(merged).toContainEqual(["30394", LISTS.key, LISTS.relay]);
  });
});

/**
 * Fill empty, never take. A path adding this deployment's Assistant to a Map
 * fills a slot nobody holds, or one this Assistant already holds; it never
 * replaces a row naming another Assistant — another deployment's or an
 * external service's — unless that row's category is one the person chose to
 * move. Rows it isn't setting are kept as they are.
 */
describe("planDesignation", () => {
  const ELSEWHERE = "wss://elsewhere.example.com";
  const LISTS = { key: TA, relay: RELAY };

  it("fills slots nobody holds", () => {
    const plan = planDesignation([], signalRows(TA, RELAY), { self: TA });
    expect(plan).toEqual(signalRows(TA, RELAY));
  });

  it("replaces a slot this deployment's Assistant already holds", () => {
    const plan = planDesignation([["30382:rank", TA, ELSEWHERE]], [["30382:rank", TA, RELAY]], { self: TA });
    expect(plan).toEqual([["30382:rank", TA, RELAY]]);
  });

  it("never takes a slot another Assistant holds, in any category it wasn't asked to move", () => {
    const existing = [
      ["30382:rank", OTHER_TA, ELSEWHERE],
      ["30392", OTHER_TA, ELSEWHERE],
    ];
    const plan = planDesignation(existing, [...signalRows(TA, RELAY), ...listRows(LISTS)], { self: TA });
    expect(plan).toContainEqual(["30382:rank", OTHER_TA, ELSEWHERE]);
    expect(plan).not.toContainEqual(["30382:rank", TA, RELAY]);
    expect(plan).toContainEqual(["30392", OTHER_TA, ELSEWHERE]);
    expect(plan).not.toContainEqual(["30392", TA, RELAY]);
    // The empty slots beside them are still filled.
    expect(plan).toContainEqual(["30382:followers", TA, RELAY]);
    expect(plan).toContainEqual(["30393", TA, RELAY]);
  });

  it("takes another Assistant's slots only in the categories it was asked to move", () => {
    const existing = [
      ["30382:rank", OTHER_TA, ELSEWHERE],
      ["30392", OTHER_TA, ELSEWHERE],
    ];
    const plan = planDesignation(existing, [...signalRows(TA, RELAY), ...listRows(LISTS)], {
      self: TA,
      take: ["scores"],
    });
    expect(plan).toContainEqual(["30382:rank", TA, RELAY]);
    expect(plan).not.toContainEqual(["30382:rank", OTHER_TA, ELSEWHERE]);
    expect(plan).toContainEqual(["30392", OTHER_TA, ELSEWHERE]);
    expect(plan).not.toContainEqual(["30392", TA, RELAY]);
  });

  // A Duty is held by whoever the Map resolves it to — the most specific key
  // that reaches it (Treasure Maps § 6) — not only by a row with the same key.
  // The editor's "Everything" writes `*`; a category without its own rows gets
  // a family key. A row of ours would be more specific, and so would take it.
  it("never takes a Duty another Assistant holds through `*`", () => {
    const everything = [["*", OTHER_TA, ""]];
    const plan = planDesignation(everything, [...signalRows(TA, RELAY), ...listRows(LISTS)], { self: TA });
    expect(plan).toEqual(everything);
  });

  it.each([
    ["3038x", "the Scores family"],
    ["30382", "the whole Scores kind"],
  ])("never takes Scores another Assistant holds through %s (%s), and still fills the Lists", (key) => {
    const plan = planDesignation([[key, OTHER_TA, ELSEWHERE]], [...signalRows(TA, RELAY), ...listRows(LISTS)], {
      self: TA,
    });
    expect(plan).toEqual([[key, OTHER_TA, ELSEWHERE], ...listRows(LISTS)]);
  });

  it("never takes Lists another Assistant holds through the Lists family, and still fills the Scores", () => {
    const plan = planDesignation([["3039x", OTHER_TA, ELSEWHERE]], [...signalRows(TA, RELAY), ...listRows(LISTS)], {
      self: TA,
    });
    expect(plan).toEqual([["3039x", OTHER_TA, ELSEWHERE], ...signalRows(TA, RELAY)]);
  });

  it("takes a Duty held through a broader key only in the categories it was asked to move", () => {
    const plan = planDesignation([["*", OTHER_TA, ""]], [...signalRows(TA, RELAY), ...listRows(LISTS)], {
      self: TA,
      take: ["scores"],
    });
    // The Lists and Concepts stay the other Assistant's: its `*` row is kept.
    expect(plan).toEqual([["*", OTHER_TA, ""], ...signalRows(TA, RELAY)]);
  });

  // Ours is the Preferred row, another Assistant an Alternate: the Duty is
  // ours, so our row is refreshed where it stands and the Alternate is kept.
  it("refreshes its own Preferred row and keeps an Alternate beside it", () => {
    const existing = [
      ["30382:rank", TA, ELSEWHERE],
      ["30382:rank", OTHER_TA, ELSEWHERE],
    ];
    const plan = planDesignation(existing, [["30382:rank", TA, RELAY]], { self: TA });
    expect(plan).toEqual([
      ["30382:rank", TA, RELAY],
      ["30382:rank", OTHER_TA, ELSEWHERE],
    ]);
  });

  it("leaves a Duty alone where it is only an Alternate", () => {
    const existing = [
      ["30382:rank", OTHER_TA, ELSEWHERE],
      ["30382:rank", TA, ELSEWHERE],
    ];
    expect(planDesignation(existing, [["30382:rank", TA, RELAY]], { self: TA })).toEqual(existing);
  });

  it("keeps every row it isn't setting", () => {
    const unrelated = [
      ["39998", OTHER_TA, ELSEWHERE],
      ["client", "Brainstorm"],
    ];
    const plan = planDesignation(unrelated, signalRows(TA, RELAY), { self: TA, take: ["scores"] });
    expect(plan).toContainEqual(unrelated[0]);
    expect(plan).toContainEqual(unrelated[1]);
  });
});

// Deactivating used to sign an empty 10040, wiping every provider the user had.
describe("withoutProvider", () => {
  it("drops only the rows naming our key", () => {
    const theirs = [
      ["30382:rank", OTHER_TA, "wss://elsewhere.example"],
      ["30392", "e".repeat(64), "wss://lists.example"],
    ];
    const existing = [["30382:rank", TA, RELAY], ["30382:followers", TA, RELAY], ...theirs];

    expect(withoutProvider(existing, TA)).toEqual(theirs);
  });
});

describe("declaresLists", () => {
  const LISTS = { key: "e".repeat(64), relay: "wss://nip85-staging.example" };

  it("is true only when every list kind names the assistant on its relay", () => {
    expect(declaresLists(event10040([["30382:rank", TA, RELAY], ...listRows(LISTS)]), LISTS)).toBe(true);
    // A trailing slash is the same relay.
    expect(declaresLists(event10040(listRows({ ...LISTS, relay: `${LISTS.relay}/` })), LISTS)).toBe(true);
  });

  it("is false with a kind missing, another key, or no 10040 at all", () => {
    expect(declaresLists(event10040(listRows(LISTS).slice(0, 2)), LISTS)).toBe(false);
    expect(declaresLists(event10040(listRows({ ...LISTS, key: OTHER_TA })), LISTS)).toBe(false);
    expect(declaresLists(undefined, LISTS)).toBe(false);
  });
});

/**
 * A 10040 read for people. Every one on the search relay is a Brainstorm
 * activation — empty content, rows pointing at scores.brainstorm.world — and
 * rendered as a blank "Post" row and an empty page (Benjamin, 2026-09-23,
 * `kind:10040` on Everything). The description is what a row and a page say.
 */
/**
 * Who publishes the reader's scores today: the Assistant their Map gives the
 * rank duty to, and where. The Activate page names it, so "another provider"
 * is never nameless — in practice it is often Brainstorm's own Assistant on
 * another deployment.
 */
describe("rankProviderOf", () => {
  it("names the Assistant holding the rank duty, and its relay", () => {
    const event = event10040([
      ["30392", OTHER_TA, "wss://lists.example.com"],
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
    ]);
    expect(rankProviderOf(event)).toEqual({ pubkey: TA, relay: RELAY });
  });

  it("is null with no rank row, a deactivation, or no Map", () => {
    expect(rankProviderOf(event10040([["30392", TA, RELAY]]))).toBeNull();
    expect(rankProviderOf(event10040([]))).toBeNull();
    expect(rankProviderOf(null)).toBeNull();
  });

  it("reads a rank row with no relay hint as a provider with no relay", () => {
    expect(rankProviderOf(event10040([["30382:rank", TA]]))).toEqual({ pubkey: TA, relay: "" });
  });

  // Scores given through a broader key are still given: the Map resolves the
  // rank duty to that Assistant (Treasure Maps § 6), and Switch must name it.
  it.each([
    ["the Scores family", "3038x"],
    ["the whole Scores kind", "30382"],
    ["everything", "*"],
  ])("names the Assistant holding the rank duty through %s", (_what, key) => {
    expect(rankProviderOf(event10040([[key, OTHER_TA, "wss://elsewhere.example.com"]]))).toEqual({
      pubkey: OTHER_TA,
      relay: "wss://elsewhere.example.com",
    });
  });

  it("the most specific key wins, and of two rows with one key the first", () => {
    expect(
      rankProviderOf(
        event10040([
          ["*", OTHER_TA, ""],
          ["30382:rank", TA, RELAY],
        ]),
      ),
    ).toEqual({ pubkey: TA, relay: RELAY });
    expect(
      rankProviderOf(
        event10040([
          ["30382:rank", TA, RELAY],
          ["30382:rank", OTHER_TA, "wss://elsewhere.example.com"],
        ]),
      ),
    ).toEqual({ pubkey: TA, relay: RELAY });
  });
});

describe("trustProviderStatusOf", () => {
  it("is none with no Map, or one that gives Scores to nobody", () => {
    expect(trustProviderStatusOf(null, TA, RELAY)).toBe("none");
    expect(trustProviderStatusOf(event10040([["30392", OTHER_TA, RELAY]]), TA, RELAY)).toBe("none");
  });

  it("is brainstorm when the rank duty is this Assistant's, other when it is someone else's", () => {
    expect(trustProviderStatusOf(event10040([["30382:rank", TA, RELAY]]), TA, RELAY)).toBe("brainstorm");
    expect(trustProviderStatusOf(event10040([["30382:rank", OTHER_TA, RELAY]]), TA, RELAY)).toBe("other");
  });

  // Read as "none", Switch took Scores with no warning and nobody named.
  it.each(["3038x", "30382", "*"])("another Assistant holding Scores through %s is other, not none", (key) => {
    expect(trustProviderStatusOf(event10040([[key, OTHER_TA, ""]]), TA, RELAY)).toBe("other");
  });
});

describe("describeDesignation", () => {
  it("names the signals, the lists, and the provider, for an activation of ours", () => {
    const d = describeDesignation(
      event10040([
        ["30382:rank", TA, "wss://scores.brainstorm.world"],
        ["30382:followers", TA, "wss://scores.brainstorm.world"],
        ["30392", TA, "wss://scores.brainstorm.world"],
        ["30393", TA, "wss://scores.brainstorm.world"],
      ]),
    );
    expect(d.signals).toEqual(["Rank", "Followers"]);
    expect(d.lists).toBe(true);
    expect(d.providers).toEqual([{ pubkey: TA, relay: "wss://scores.brainstorm.world", brainstorm: true }]);
    expect(d.summary).toBe("Activated Brainstorm trust signals · Rank, Followers, Trusted Lists");
  });

  it("says whose signals they are when the provider is not ours", () => {
    const d = describeDesignation(event10040([["30382:rank", OTHER_TA, "wss://nip85.example.com"]]));
    expect(d.signals).toEqual(["Rank"]);
    expect(d.lists).toBe(false);
    expect(d.providers).toEqual([{ pubkey: OTHER_TA, relay: "wss://nip85.example.com", brainstorm: false }]);
    expect(d.summary).toBe("Trusts a provider for Rank");
  });

  it("an empty designation says so", () => {
    expect(describeDesignation(event10040([])).summary).toBe("No trust provider designated");
  });

  // An Assistant's own Treasure Map names itself for what it publishes now
  // (treasure-maps.md § 9.2). Read as a designation, every one read as
  // "Activated Brainstorm trust signals" (brainstorm_server#110 audit, item 9).
  it("an Assistant's own Map says what it publishes, and is no activation", () => {
    const ASSISTANT = "e".repeat(64);
    const SCORES = "wss://nip85.brainstorm.world";
    const d = describeDesignation({
      pubkey: ASSISTANT,
      tags: [
        ...["rank", "followers", "reporters", "muters", "hops"].map((m) => [`30382:${m}`, ASSISTANT, SCORES]),
        ["client", "Brainstorm"],
      ],
    });
    expect(d.self).toBe(true);
    expect(d.signals).toEqual(["Rank", "Followers", "Reporters", "Muters", "Hops"]);
    expect(d.providers).toEqual([{ pubkey: ASSISTANT, relay: SCORES, brainstorm: true }]);
    expect(d.summary).toBe("Publishes and keeps up to date · Rank, Followers, Reporters, Muters, Hops");
  });

  it("reads a self-entry beside rows naming others as no part of what they designate", () => {
    const AUTHOR = "c".repeat(64);
    const d = describeDesignation(
      event10040([
        ["30382:rank", AUTHOR.toUpperCase(), "wss://nip85.brainstorm.world"],
        ["30382:followers", TA, "wss://scores.brainstorm.world"],
      ]),
    );
    expect(d.self).toBe(false);
    expect(d.signals).toEqual(["Followers"]);
    expect(d.providers).toEqual([{ pubkey: TA, relay: "wss://scores.brainstorm.world", brainstorm: true }]);
    expect(d.summary).toBe("Activated Brainstorm trust signals · Followers");
  });
});
