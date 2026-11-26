// @vitest-environment jsdom
/**
 * Who GitHub says owns an account, in two halves (docs/adr/0005): the
 * profiles that claim it, a relay read held in the EventStore, and GitHub's
 * own answers — the profile and each claim's gist — over HTTP, in react-query.
 * A claimant who publishes a newer profile without the claim drops out.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { queryWrapper } from "@/test/utils";

const OWNER = "a".repeat(64);
const CLAIMER = "c".repeat(64);
const io = vi.hoisted(() => ({
  claimants: vi.fn(async (_handle: string): Promise<unknown[]> => []),
  profile: vi.fn(async (_handle: string) => ({
    checked: true,
    named: [] as string[],
    blogHost: null as string | null,
  })),
  gist: vi.fn(async (_gist: string, _handle: string, _pubkey: string) => true),
}));
vi.mock("@/services/itemEngagement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/itemEngagement")>()),
  fetchGitHubClaimantProfiles: (handle: string) => io.claimants(handle),
}));
vi.mock("@/services/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/github")>()),
  fetchGitHubProfileEvidence: (handle: string) => io.profile(handle),
  gistProvesClaim: (gist: string, handle: string, pubkey: string) => io.gist(gist, handle, pubkey),
}));

import { useGitHubEvidence } from "./useGitHubEvidence";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => __resetAsks());

let n = 0;
const profile = (pubkey: string, tags: string[][], created_at: number) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 0,
    pubkey,
    created_at,
    content: "{}",
    sig: "s",
    tags,
  }) as NostrEvent;

describe("useGitHubEvidence", () => {
  it("joins GitHub's answers to the claims the store holds, and drops a claim its author withdraws", async () => {
    io.profile.mockResolvedValue({ checked: true, named: [OWNER], blogHost: "riverdev.com" });
    io.claimants.mockImplementation(async () => [
      eventStore.add(profile(CLAIMER, [["i", "github:RiverDev", "gist1"]], 10)),
    ]);
    const handles = ["RiverDev"];
    const { result } = renderHook(() => useGitHubEvidence(handles), { wrapper: queryWrapper() });
    expect(result.current.size).toBe(0);
    await waitFor(() =>
      expect(result.current.get("riverdev")).toEqual({
        checked: true,
        named: [OWNER],
        blogHost: "riverdev.com",
        claimants: [CLAIMER],
        provenClaimants: [CLAIMER],
      }),
    );
    expect(io.gist).toHaveBeenCalledWith("gist1", "RiverDev", CLAIMER);

    // Their newer profile, with no claim, replaces the one in the store.
    act(() => {
      eventStore.add(profile(CLAIMER, [], 20));
    });
    await waitFor(() => expect(result.current.get("riverdev")?.claimants).toEqual([]));
  });
});
