import { useState, useCallback, useMemo } from "react";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { applyEdits, useListEdits, withListEdit } from "@/lib/listEdits";

import { signingFailure } from "@/accounts/signing";
import {
  fetchContactList,
  fetchMuteList,
  getFollowedPubkeys,
  getMutedPubkeys,
  followUser,
  unfollowUser,
  muteUser,
  unmuteUser,
  reportUser,
  unreportUser,
  type NostrEvent,
} from "@/services/socialActions";

type Outcome = Awaited<ReturnType<typeof followUser>>;

export function useSocialActions(myPubkey: string | undefined) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const contacts = useStoreReplaceable(3, myPubkey, () => fetchContactList(myPubkey!));
  const mutes = useStoreReplaceable(10000, myPubkey, () => fetchMuteList(myPubkey!));
  const contactList = (contacts.event as NostrEvent | undefined) ?? null;
  const muteList = (mutes.event as NostrEvent | undefined) ?? null;

  const listsLoading = !!myPubkey && (contacts.loading || mutes.loading);

  const contactEdits = useListEdits(3, myPubkey);
  const muteEdits = useListEdits(10000, myPubkey);
  const followedSet = useMemo(
    () => applyEdits(getFollowedPubkeys(contactList), contactEdits),
    [contactList, contactEdits],
  );
  const mutedSet = useMemo(() => applyEdits(getMutedPubkeys(muteList), muteEdits), [muteList, muteEdits]);

  const isFollowing = useCallback((targetPk: string) => followedSet.has(targetPk), [followedSet]);
  const isMuted = useCallback((targetPk: string) => mutedSet.has(targetPk), [mutedSet]);
  const isSelf = useCallback((targetPk: string) => myPubkey === targetPk, [myPubkey]);

  // All four toggles flip at once (lib/listEdits) and publish behind it. The
  // published list lands in the store, which keeps the newest version: a relay
  // still serving the old list can't revert the flip. A failed publish clears
  // the edit, and the old list shows again.
  const toggle = useCallback(
    async (
      kind: 3 | 10000,
      action: "add" | "remove",
      targetPk: string,
      label: string,
      publish: () => Promise<Outcome>,
    ): Promise<Outcome> => {
      setPendingAction(`${label}-${targetPk}`);
      try {
        return await withListEdit(kind, myPubkey!, targetPk, action, publish);
      } catch (e) {
        return signingFailure(e, `${label[0].toUpperCase()}${label.slice(1)} failed`);
      } finally {
        setPendingAction(null);
      }
    },
    [myPubkey],
  );

  const doFollow = useCallback(
    async (targetPk: string) => {
      if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
      return toggle(3, "add", targetPk, "follow", () => followUser(targetPk, contactList));
    },
    [myPubkey, contactList, toggle],
  );

  const doUnfollow = useCallback(
    async (targetPk: string) => {
      if (!myPubkey) return { success: false, error: "Not logged in" };
      return toggle(3, "remove", targetPk, "unfollow", () => unfollowUser(targetPk, contactList));
    },
    [myPubkey, contactList, toggle],
  );

  const doMute = useCallback(
    async (targetPk: string) => {
      if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
      return toggle(10000, "add", targetPk, "mute", () => muteUser(targetPk, muteList));
    },
    [myPubkey, muteList, toggle],
  );

  const doUnmute = useCallback(
    async (targetPk: string) => {
      if (!myPubkey) return { success: false, error: "Not logged in" };
      return toggle(10000, "remove", targetPk, "unmute", () => unmuteUser(targetPk, muteList));
    },
    [myPubkey, muteList, toggle],
  );

  const doReport = useCallback(
    async (targetPk: string, reason: string) => {
      if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
      setPendingAction(`report-${targetPk}`);
      try {
        const result = await reportUser(targetPk, reason);
        return result;
      } finally {
        setPendingAction(null);
      }
    },
    [myPubkey],
  );

  const doUnreport = useCallback(
    async (targetPk: string) => {
      if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
      setPendingAction(`unreport-${targetPk}`);
      try {
        return await unreportUser(targetPk);
      } finally {
        setPendingAction(null);
      }
    },
    [myPubkey],
  );

  const isPending = useCallback(
    (action: string, targetPk: string) => {
      return pendingAction === `${action}-${targetPk}`;
    },
    [pendingAction],
  );

  const isAnyPending = pendingAction !== null;

  return {
    isFollowing,
    isMuted,
    isSelf,
    follow: doFollow,
    unfollow: doUnfollow,
    mute: doMute,
    unmute: doUnmute,
    report: doReport,
    unreport: doUnreport,
    isPending,
    isAnyPending,
    listsLoading,
    contactList,
    muteList,
  };
}
