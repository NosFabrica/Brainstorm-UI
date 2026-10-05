// @vitest-environment jsdom
/**
 * Follow and mute flip the moment they are tapped, before the list is signed
 * and published, and undo if the publish fails.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const followMock = vi.fn();
vi.mock("@/services/socialActions", () => ({
  fetchContactList: async () => null,
  fetchMuteList: async () => null,
  getFollowedPubkeys: (list: { tags: string[][] } | null) =>
    new Set(list?.tags.filter((t) => t[0] === "p").map((t) => t[1]) ?? []),
  getMutedPubkeys: () => new Set(),
  followUser: (...a: unknown[]) => followMock(...a),
  unfollowUser: vi.fn(),
  muteUser: vi.fn(),
  unmuteUser: vi.fn(),
  reportUser: vi.fn(),
  unreportUser: vi.fn(),
}));

import { useSocialActions } from "./useSocialActions";

const ME = "e".repeat(64);
const THEM = "a".repeat(64);

describe("useSocialActions", () => {
  it("shows a follow at once, and undoes it when the publish fails", async () => {
    let finish!: (r: { success: boolean; error?: string }) => void;
    followMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useSocialActions(ME));
    await waitFor(() => expect(result.current.listsLoading).toBe(false));

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.follow(THEM);
    });
    await waitFor(() => expect(result.current.isFollowing(THEM)).toBe(true));
    expect(result.current.isPending("follow", THEM)).toBe(true);

    await act(async () => {
      finish({ success: false, error: "nope" });
      await pending;
    });
    expect(result.current.isFollowing(THEM)).toBe(false);
    expect(result.current.isPending("follow", THEM)).toBe(false);
  });
});
