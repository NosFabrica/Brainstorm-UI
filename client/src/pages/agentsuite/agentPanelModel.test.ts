import { describe, expect, it, vi } from "vitest";
import { nip19 } from "nostr-tools";
import { TIER_LABELS } from "@/services/trustThreshold";
import { emptyAgentState } from "../userPanelState";
import {
  filterAndSortFollowed,
  formatRelativeTime,
  getTier,
  nextAgentStatus,
  promoteOnPublish,
  resolveNpubInput,
  taHistoryFrom,
  type FollowedUser,
} from "./agentPanelModel";

const HEX = "ab".repeat(32);

describe("getTier", () => {
  it("steps at 0.8, 0.5, 0.2 and 0.05", () => {
    expect(getTier(0.8).name).toBe(TIER_LABELS.high);
    expect(getTier(0.5).name).toBe(TIER_LABELS.trusted);
    expect(getTier(0.2).name).toBe("Neutral");
    expect(getTier(0.05).name).toBe(TIER_LABELS.low);
    expect(getTier(0.049).name).toBe("Unverified");
  });
});

describe("promoteOnPublish", () => {
  it("makes a dormant assistant active with the publish time", () => {
    const next = promoteOnPublish(emptyAgentState(), 1000);
    expect(next).toMatchObject({ status: "active", publishedAt: 1000, activatedAt: 1000 });
  });

  it("keeps a higher rung and an earlier activation", () => {
    const prev = { ...emptyAgentState(), status: "networked" as const, publishedAt: 500, activatedAt: 400 };
    expect(promoteOnPublish(prev, 1000)).toMatchObject({ status: "networked", publishedAt: 1000, activatedAt: 400 });
  });

  it("is the same state when it already knows a publish this recent", () => {
    const prev = { ...emptyAgentState(), status: "active" as const, publishedAt: 2000 };
    expect(promoteOnPublish(prev, 1000)).toBe(prev);
  });
});

describe("nextAgentStatus", () => {
  it("climbs with network size, NIP-85 and a calculation", () => {
    expect(nextAgentStatus(null, 500, true, true)).toBe("active");
    expect(nextAgentStatus(1, 9, true, true)).toBe("active");
    expect(nextAgentStatus(1, 10, false, true)).toBe("established");
    expect(nextAgentStatus(1, 50, true, false)).toBe("networked");
    expect(nextAgentStatus(1, 100, true, true)).toBe("trusted");
  });
});

describe("resolveNpubInput", () => {
  it("takes an npub or 64 hex, nothing else", () => {
    expect(resolveNpubInput(` ${nip19.npubEncode(HEX)} `)).toBe(HEX);
    expect(resolveNpubInput(HEX.toUpperCase())).toBe(HEX.toUpperCase());
    expect(resolveNpubInput("npub1garbage")).toBeNull();
    expect(resolveNpubInput(nip19.noteEncode(HEX))).toBeNull();
    expect(resolveNpubInput("   ")).toBeNull();
  });
});

describe("filterAndSortFollowed", () => {
  const u = (pubkey: string, influence: number, displayName?: string): FollowedUser => ({
    pubkey,
    npub: `npub-${pubkey}`,
    influence,
    displayName,
    tier: "",
    tierColor: "",
  });
  const users = [u("a1", 0.2, "zed"), u("b2", 0.9), u("c3", 0.5, "Amy")];

  it("sorts by score or tier alike, and by name falling back to the npub", () => {
    expect(filterAndSortFollowed(users, "", "score", "desc").map((x) => x.pubkey)).toEqual(["b2", "c3", "a1"]);
    expect(filterAndSortFollowed(users, "", "tier", "asc").map((x) => x.pubkey)).toEqual(["a1", "c3", "b2"]);
    expect(filterAndSortFollowed(users, "", "name", "asc").map((x) => x.pubkey)).toEqual(["c3", "b2", "a1"]);
  });

  it("searches names, npubs and pubkeys", () => {
    expect(filterAndSortFollowed(users, "AMY", "score", "desc").map((x) => x.pubkey)).toEqual(["c3"]);
    expect(filterAndSortFollowed(users, "npub-b", "score", "desc").map((x) => x.pubkey)).toEqual(["b2"]);
  });
});

describe("taHistoryFrom", () => {
  it("lists the run's publish and creation on the relay, then this device's entries, newest first", () => {
    const local = JSON.stringify([
      { timestamp: Date.UTC(2026, 0, 1, 12, 0, 30), eventKind: 30382, relays: [], status: "success" },
      { timestamp: Date.UTC(2025, 11, 1), eventKind: 30382, relays: ["wss://old"], status: "failure" },
    ]);
    const history = taHistoryFrom(
      { created_at: "2026-01-01T10:00:00", updated_at: "2026-01-01T12:00:00", ta_status: "FAILURE" },
      "wss://nip85",
      local,
    );
    expect(history.map((e) => [e.timestamp, e.status, e.relays])).toEqual([
      [Date.UTC(2026, 0, 1, 12), "failure", ["wss://nip85"]],
      [Date.UTC(2026, 0, 1, 10), "success", ["wss://nip85"]],
      // The local one within a minute of the publish is the same attestation.
      [Date.UTC(2025, 11, 1), "failure", ["wss://old"]],
    ]);
  });

  it("is empty without a run, and ignores unreadable local history", () => {
    expect(taHistoryFrom(null, null, "{not json")).toEqual([]);
    expect(taHistoryFrom({ ta_status: "success" }, null, null)).toEqual([]);
  });
});

describe("formatRelativeTime", () => {
  it("counts up from just now and reads a zoneless time as UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 20, 12, 0, 0));
    expect(formatRelativeTime(null)).toBe("Never");
    expect(formatRelativeTime("nonsense")).toBe("Unknown");
    expect(formatRelativeTime("2026-11-20T11:59:30")).toBe("just now");
    expect(formatRelativeTime("2026-11-20T11:55:00Z")).toBe("5m ago");
    expect(formatRelativeTime("2026-11-20T09:00:00")).toBe("3h ago");
    expect(formatRelativeTime("2026-11-17T12:00:00")).toBe("3d ago");
    expect(formatRelativeTime("2026-11-01T12:00:00")).toBe("Nov 1");
    vi.useRealTimers();
  });
});
