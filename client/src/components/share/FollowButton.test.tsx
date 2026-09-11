/**
 * Follow / Following on the public profile. One click followed; one click
 * also unfollowed — the one people regret (Benjamin, 2026-09-08). X's shape:
 * the button shows the state, "Following" turns into a red "Unfollow" under
 * the pointer, and a click asks first.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FollowButton } from "./FollowButton";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const followUser = vi.fn(async (_pk: string) => ({ success: true }));
const unfollowUser = vi.fn(async (_pk: string) => ({ success: true }));
vi.mock("@/services/socialActions", () => ({
  followUser: (pk: string) => followUser(pk),
  unfollowUser: (pk: string) => unfollowUser(pk),
}));

const PK = "a".repeat(64);

beforeEach(() => {
  followUser.mockClear();
  unfollowUser.mockClear();
  toast.mockClear();
});

describe("FollowButton", () => {
  it("not following: one click follows, no questions asked", async () => {
    render(<FollowButton targetPubkey={PK} initialFollowing={false} displayName="A.A.Ron" />);
    const button = screen.getByTestId("share-follow");
    expect(button).toHaveTextContent("Follow");
    fireEvent.click(button);
    await waitFor(() => expect(followUser).toHaveBeenCalledWith(PK));
    await waitFor(() => expect(button).toHaveTextContent("Following"));
    expect(screen.queryByTestId("follow-confirm")).toBeNull();
  });

  it("following: the pointer turns the button into a red Unfollow", () => {
    render(<FollowButton targetPubkey={PK} initialFollowing displayName="A.A.Ron" />);
    const button = screen.getByTestId("share-follow");
    expect(button).toHaveTextContent("Following");
    fireEvent.mouseEnter(button);
    expect(button).toHaveTextContent("Unfollow");
    expect(button.className).toMatch(/text-red-600/);
    fireEvent.mouseLeave(button);
    expect(button).toHaveTextContent("Following");
  });

  it("following: a click asks first, and Cancel changes nothing", () => {
    render(<FollowButton targetPubkey={PK} initialFollowing displayName="A.A.Ron" />);
    fireEvent.click(screen.getByTestId("share-follow"));
    const confirm = screen.getByTestId("follow-confirm");
    expect(confirm).toHaveTextContent("Unfollow A.A.Ron?");
    expect(unfollowUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("follow-confirm-cancel"));
    expect(unfollowUser).not.toHaveBeenCalled();
    expect(screen.getByTestId("share-follow")).toHaveTextContent("Following");
  });

  it("following: confirming unfollows and the button reads Follow again", async () => {
    render(<FollowButton targetPubkey={PK} initialFollowing displayName="A.A.Ron" />);
    fireEvent.click(screen.getByTestId("share-follow"));
    fireEvent.click(screen.getByTestId("follow-confirm-unfollow"));
    await waitFor(() => expect(unfollowUser).toHaveBeenCalledWith(PK));
    await waitFor(() => expect(screen.getByTestId("share-follow")).toHaveTextContent("Follow"));
    expect(screen.getByTestId("share-follow")).not.toHaveTextContent("Following");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Unfollowed" }));
  });
});
