import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@/services/socialActions";

export function useSocialActions(myPubkey: string | undefined) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: contactList } = useQuery({
    queryKey: ["nostr-contacts", myPubkey],
    queryFn: () => fetchContactList(myPubkey!),
    enabled: !!myPubkey,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: muteList } = useQuery({
    queryKey: ["nostr-mutes", myPubkey],
    queryFn: () => fetchMuteList(myPubkey!),
    enabled: !!myPubkey,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const followedSet = useMemo(() => getFollowedPubkeys(contactList ?? null), [contactList]);
  const mutedSet = useMemo(() => getMutedPubkeys(muteList ?? null), [muteList]);

  const isFollowing = useCallback((targetPk: string) => followedSet.has(targetPk), [followedSet]);
  const isMuted = useCallback((targetPk: string) => mutedSet.has(targetPk), [mutedSet]);
  const isSelf = useCallback((targetPk: string) => myPubkey === targetPk, [myPubkey]);

  const invalidateLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["nostr-contacts", myPubkey] });
    queryClient.invalidateQueries({ queryKey: ["nostr-mutes", myPubkey] });
  }, [queryClient, myPubkey]);

  const doFollow = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    setPendingAction(`follow-${targetPk}`);
    try {
      const result = await followUser(targetPk);
      if (result.success) invalidateLists();
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, invalidateLists]);

  const doUnfollow = useCallback(async (targetPk: string) => {
    if (!myPubkey) return { success: false, error: "Not logged in" };
    setPendingAction(`unfollow-${targetPk}`);
    try {
      const result = await unfollowUser(targetPk);
      if (result.success) invalidateLists();
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, invalidateLists]);

  const doMute = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    setPendingAction(`mute-${targetPk}`);
    try {
      const result = await muteUser(targetPk);
      if (result.success) invalidateLists();
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, invalidateLists]);

  const doUnmute = useCallback(async (targetPk: string) => {
    if (!myPubkey) return { success: false, error: "Not logged in" };
    setPendingAction(`unmute-${targetPk}`);
    try {
      const result = await unmuteUser(targetPk);
      if (result.success) invalidateLists();
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, invalidateLists]);

  const doReport = useCallback(async (targetPk: string, reason: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    setPendingAction(`report-${targetPk}`);
    try {
      const result = await reportUser(targetPk, reason);
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey]);

  const isPending = useCallback((action: string, targetPk: string) => {
    return pendingAction === `${action}-${targetPk}`;
  }, [pendingAction]);

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
    isPending,
    isAnyPending,
    contactList,
    muteList,
  };
}
