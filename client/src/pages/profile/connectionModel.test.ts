import { beforeEach, describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import type { ReportMetadata } from "@/services/nostr";
import { expandProfileCache } from "@/services/profilePageCache";
import {
  computeProcessedPubkeys,
  deriveConnectionClusters,
  getSection,
  getTrustForPkFromMaps,
  sectionCount,
  type TrustCache,
} from "./connectionModel";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const noCache: TrustCache = { get: () => undefined, has: () => false };
const cacheOf = (m: Map<string, number | null>): TrustCache => ({ get: (pk) => m.get(pk), has: (pk) => m.has(pk) });
const maps = (followedBy: [string, number | null][] = []) => ({ followed_by: new Map(followedBy) });
const noReports = () => undefined;

describe("getSection", () => {
  it("reads a section's rows, nothing while the result is missing", () => {
    expect(getSection(null, "followed_by")).toBeUndefined();
    expect(getSection({ followed_by: [A] }, "followed_by")).toEqual([A]);
  });
});

describe("deriveConnectionClusters", () => {
  it("collapses the owner's and the viewer's overlaps to one pill each", () => {
    expect(deriveConnectionClusters(new Set(["followed_by", "following", "mutual"]))).toEqual({
      owner: "mutual",
      you: null,
    });
    expect(deriveConnectionClusters(new Set(["following"]))).toEqual({ owner: "following", you: null });
    expect(deriveConnectionClusters(new Set(["shared_followers", "shared_following"]))).toEqual({
      owner: null,
      you: "mutual_with_you",
    });
    expect(deriveConnectionClusters(new Set(["shared_following", "muted_by"]))).toEqual({
      owner: null,
      you: "you_follow",
    });
  });
});

describe("getTrustForPkFromMaps", () => {
  it("prefers the viewer's cached score, then a section's influence, else -1", () => {
    expect(getTrustForPkFromMaps(A, maps([[A, 0.4]]), cacheOf(new Map([[A, 0.9]])))).toBe(0.9);
    expect(getTrustForPkFromMaps(A, maps([[A, 0.4]]), cacheOf(new Map([[A, null]])))).toBe(0.4);
    expect(getTrustForPkFromMaps(B, maps([[A, 0.4]]), noCache)).toBe(-1);
  });
});

describe("computeProcessedPubkeys", () => {
  beforeEach(() => {
    expandProfileCache.set(A, { name: "alice", nip05: "alice@example.com" });
    expandProfileCache.set(B, { display_name: "Bob" });
  });

  it("sorts by score, either way", () => {
    const m = maps([
      [A, 0.2],
      [B, 0.8],
      [C, 0.5],
    ]);
    const run = (sort: "trust-desc" | "trust-asc") =>
      computeProcessedPubkeys("followed_by", [A, B, C], "all", sort, "", "all", m, noReports, noCache);
    expect(run("trust-desc")).toEqual([B, C, A]);
    expect(run("trust-asc")).toEqual([A, C, B]);
  });

  it("sorts by name with the nameless last", () => {
    const run = (sort: "name-asc" | "name-desc") =>
      computeProcessedPubkeys("followed_by", [C, B, A], "all", sort, "", "all", maps(), noReports, noCache);
    expect(run("name-asc")).toEqual([A, B, C]);
    expect(run("name-desc")).toEqual([B, A, C]);
  });

  it("searches names, handles and npubs", () => {
    const run = (q: string) =>
      computeProcessedPubkeys("followed_by", [A, B, C], "all", "name-asc", q, "all", maps(), noReports, noCache);
    expect(run(" BOB ")).toEqual([B]);
    expect(run("example.com")).toEqual([A]);
    expect(run(nip19.npubEncode(C).slice(0, 20))).toEqual([C]);
  });

  it("narrows a report section by type, unavailable meaning no report found", () => {
    const report = (pk: string, reportType: string) =>
      ({ reporterPubkey: pk, reportType }) as unknown as ReportMetadata;
    const reports = new Map([
      [A, report(A, "spam")],
      [B, report(B, "nudity")],
    ]);
    const get = (_k: string, pk: string) => reports.get(pk);
    const run = (key: string, type: "spam" | "unavailable") =>
      computeProcessedPubkeys(key, [A, B, C], "all", "name-asc", "", type, maps(), get, noCache);
    expect(run("reported_by", "spam")).toEqual([A]);
    expect(run("reporting", "unavailable")).toEqual([C]);
    // Not a report section: the type filter doesn't apply.
    expect(run("followed_by", "spam")).toEqual([A, B, C]);
  });
});

describe("sectionCount", () => {
  it("takes the overview's count, else the loaded rows', else the number held", () => {
    expect(sectionCount(7, [A, B])).toBe(7);
    expect(sectionCount(undefined, [A, { pubkey: B, influence: 0.1 }])).toBe(2);
    expect(sectionCount(undefined, 12)).toBe(12);
    expect(sectionCount(undefined, undefined)).toBe(0);
  });
});
