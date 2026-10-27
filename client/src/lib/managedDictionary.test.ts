/**
 * "Managed by" on Settings › Dictionary: who may manage the reader's
 * Dictionary, whose shows by default (the Treasure Map's Concepts Assistant,
 * else the local one), and each concept resolved for that choice alone.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import type { HeaderEvent } from "@/lib/conceptResolution";
import type { DictionaryEntry } from "@/services/dictionary";
import {
  ALL,
  ME,
  defaultChoice,
  designatedManager,
  managedByParam,
  managedEntries,
  managerOptions,
  parseManagedBy,
} from "./managedDictionary";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const USER = "1".repeat(64);
const LOCAL = "2".repeat(64);
const TAPESTRY = "3".repeat(64);
const OTHER = "4".repeat(64);
const HOUSE = "5".repeat(64);
const COMMUNITY = `39998:${AVI}:github-accounts`;

const map = (...tags: string[][]) => ({ tags });

describe("the Treasure Map's Concepts Assistant", () => {
  it("is the delegate of a bare 39998", () => {
    expect(designatedManager(map(["30382:rank", LOCAL], ["39998", TAPESTRY, "wss://r"]))).toBe(TAPESTRY);
  });

  it("is the delegate of 39998:dlist-header, the same slot", () => {
    expect(designatedManager(map(["39998:dlist-header", TAPESTRY]))).toBe(TAPESTRY);
  });

  it("is the first delegate: later ones are backups", () => {
    expect(designatedManager(map(["39998", TAPESTRY], ["39998", OTHER]))).toBe(TAPESTRY);
  });

  it("falls back to a bare *, which reaches every category", () => {
    expect(designatedManager(map(["*", OTHER]))).toBe(OTHER);
    expect(designatedManager(map(["*", OTHER], ["39998", TAPESTRY]))).toBe(TAPESTRY);
  });

  it("is no one when only one list or 39999 is given out, or there's no Map", () => {
    expect(designatedManager(map(["39998:github-accounts", TAPESTRY], ["39999", OTHER]))).toBeNull();
    expect(designatedManager(null)).toBeNull();
  });
});

describe("the choices", () => {
  it("are the reader, then their Assistants as given, the Map's Assistant added when untagged", () => {
    const options = managerOptions({ me: USER, assistants: [LOCAL, TAPESTRY], local: LOCAL, designated: OTHER });
    expect(options.map((o) => o.key)).toEqual([ME, LOCAL, TAPESTRY, OTHER]);
    expect(options.find((o) => o.local)?.pubkey).toBe(LOCAL);
    expect(options.find((o) => o.designated)?.pubkey).toBe(OTHER);
  });

  it("never list the reader as an Assistant of their own", () => {
    const options = managerOptions({ me: USER, assistants: [USER, LOCAL], local: LOCAL, designated: USER });
    expect(options.map((o) => o.key)).toEqual([ME, LOCAL]);
    expect(options[0].designated).toBe(true);
  });
});

describe("the default", () => {
  it("is the Map's Concepts Assistant", () => {
    const options = managerOptions({ me: USER, assistants: [LOCAL, TAPESTRY], local: LOCAL, designated: TAPESTRY });
    expect(defaultChoice(options)).toBe(TAPESTRY);
  });

  it("is the reader when the Map gives Concepts to them", () => {
    expect(defaultChoice(managerOptions({ me: USER, assistants: [LOCAL], local: LOCAL, designated: USER }))).toBe(ME);
  });

  it("is the local Assistant when the Map gives Concepts to no one", () => {
    const options = managerOptions({ me: USER, assistants: [TAPESTRY, LOCAL], local: LOCAL, designated: null });
    expect(defaultChoice(options)).toBe(LOCAL);
  });

  it("is the reader with no Assistant at all", () => {
    expect(defaultChoice(managerOptions({ me: USER, assistants: [], local: null, designated: null }))).toBe(ME);
  });
});

describe("the URL", () => {
  const options = managerOptions({ me: USER, assistants: [LOCAL, TAPESTRY], local: LOCAL, designated: null });

  it("names a choice by me, all, or the Assistant's npub or hex key", () => {
    expect(parseManagedBy(null, options)).toEqual({ choice: LOCAL, unknown: false });
    expect(parseManagedBy("me", options)).toEqual({ choice: ME, unknown: false });
    expect(parseManagedBy("all", options)).toEqual({ choice: ALL, unknown: false });
    expect(parseManagedBy(nip19.npubEncode(TAPESTRY), options)).toEqual({ choice: TAPESTRY, unknown: false });
    expect(parseManagedBy(TAPESTRY.toUpperCase(), options)).toEqual({ choice: TAPESTRY, unknown: false });
    expect(parseManagedBy(nip19.npubEncode(USER), options)).toEqual({ choice: ME, unknown: false });
  });

  it("naming someone else, or all with one Assistant, shows the default and says so", () => {
    expect(parseManagedBy(nip19.npubEncode(OTHER), options)).toEqual({ choice: LOCAL, unknown: true });
    expect(parseManagedBy("nonsense", options)).toEqual({ choice: LOCAL, unknown: true });
    const one = managerOptions({ me: USER, assistants: [LOCAL], local: LOCAL, designated: null });
    expect(parseManagedBy("all", one)).toEqual({ choice: LOCAL, unknown: true });
  });

  it("writes what it reads", () => {
    for (const key of [ME, ALL, TAPESTRY]) expect(parseManagedBy(managedByParam(key), options).choice).toBe(key);
  });
});

describe("an entry, as the choice sees it", () => {
  const header = (pubkey: string, extra: string[][] = []): HeaderEvent => ({
    id: pubkey.slice(0, 8).padEnd(64, "0"),
    pubkey,
    kind: 39998,
    created_at: 1_790_000_000,
    tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...extra],
  });
  const community = header(AVI, [["required", "github-username"]]);
  const copy = (pubkey: string) =>
    header(pubkey, [
      ["required", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);
  const entry = (copies: Record<string, HeaderEvent>, house: HeaderEvent | null = null): DictionaryEntry => ({
    communityCoordinate: COMMUNITY,
    resolved: null,
    inDictionary: false,
    items: [],
    candidates: { community, house, copies },
  });
  const options = managerOptions({ me: USER, assistants: [LOCAL, TAPESTRY, OTHER], local: LOCAL, designated: null });

  it("yours: your own copy governs, an Assistant's doesn't count", () => {
    const [mine] = managedEntries([entry({ [USER]: copy(USER), [LOCAL]: copy(LOCAL) })], ME, options);
    expect(mine.inDictionary).toBe(true);
    expect(mine.resolved?.source).toBe("personal");
    expect(mine.resolved?.governing.event.pubkey).toBe(USER);
    expect(mine.holder).toBe(USER);
    const [none] = managedEntries([entry({ [LOCAL]: copy(LOCAL) })], ME, options);
    expect(none.inDictionary).toBe(false);
    expect(none.resolved?.source).toBe("community");
  });

  it("an Assistant's: its copy governs; your own copy isn't its", () => {
    const [held] = managedEntries([entry({ [USER]: copy(USER), [TAPESTRY]: copy(TAPESTRY) })], TAPESTRY, options);
    expect(held.inDictionary).toBe(true);
    expect(held.resolved?.source).toBe("assistant");
    expect(held.resolved?.governing.event.pubkey).toBe(TAPESTRY);
    expect(held.holder).toBe(TAPESTRY);
    expect(held.support).toBeNull();
    const [not] = managedEntries([entry({ [USER]: copy(USER) }, copy(HOUSE))], TAPESTRY, options);
    expect(not.inDictionary).toBe(false);
    expect(not.resolved?.source).toBe("house");
    expect(not.holder).toBeNull();
  });

  it("all of them: the first Assistant in the picker's order that holds one, and how many do", () => {
    const [both] = managedEntries(
      [entry({ [USER]: copy(USER), [TAPESTRY]: copy(TAPESTRY), [OTHER]: copy(OTHER) })],
      ALL,
      options,
    );
    expect(both.holder).toBe(TAPESTRY);
    expect(both.support).toEqual({ count: 2, of: 3 });
    const [mineOnly] = managedEntries([entry({ [USER]: copy(USER) })], ALL, options);
    expect(mineOnly.inDictionary).toBe(false);
    expect(mineOnly.support).toEqual({ count: 0, of: 3 });
  });

  it("read without its candidates, stays as it was resolved", () => {
    const bare: DictionaryEntry = { communityCoordinate: COMMUNITY, resolved: null, inDictionary: true, items: [] };
    expect(managedEntries([bare], TAPESTRY, options)[0]).toMatchObject({ inDictionary: true, holder: null });
  });
});
