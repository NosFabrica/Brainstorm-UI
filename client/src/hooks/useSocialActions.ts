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
  type NostrEvent,
} from "@/services/socialActions";

export function useSocialActions(myPubkey: string | undefined) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: contactList, isPending: contactsLoading } = useQuery({
    queryKey: ["nostr-contacts", myPubkey],
    queryFn: () => fetchContactList(myPubkey!),
    enabled: !!myPubkey,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: muteList, isPending: mutesLoading } = useQuery({
    queryKey: ["nostr-mutes", myPubkey],
    queryFn: () => fetchMuteList(myPubkey!),
    enabled: !!myPubkey,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const listsLoading = !!myPubkey && (contactsLoading || mutesLoading);

  const followedSet = useMemo(() => getFollowedPubkeys(contactList ?? null), [contactList]);
  const mutedSet = useMemo(() => getMutedPubkeys(muteList ?? null), [muteList]);

  const isFollowing = useCallback((targetPk: string) => followedSet.has(targetPk), [followedSet]);
  const isMuted = useCallback((targetPk: string) => mutedSet.has(targetPk), [mutedSet]);
  const isSelf = useCallback((targetPk: string) => myPubkey === targetPk, [myPubkey]);

  const invalidateLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["nostr-contacts", myPubkey] });
    queryClient.invalidateQueries({ queryKey: ["nostr-mutes", myPubkey] });
  }, [queryClient, myPubkey]);

  const optimisticUpdateContacts = useCallback((targetPk: string, action: "add" | "remove") => {
    queryClient.setQueryData(["nostr-contacts", myPubkey], (old: NostrEvent | null | undefined) => {
      if (!old) return old;
      const newTags = action === "add"
        ? [...old.tags, ["p", targetPk]]
        : old.tags.filter(t => !(t[0] === "p" && t[1] === targetPk));
      return { ...old, tags: newTags, created_at: Math.floor(Date.now() / 1000) };
    });
  }, [queryClient, myPubkey]);

  const optimisticUpdateMutes = useCallback((targetPk: string, action: "add" | "remove") => {
    queryClient.setQueryData(["nostr-mutes", myPubkey], (old: NostrEvent | null | undefined) => {
      if (!old) return old;
      const newTags = action === "add"
        ? [...old.tags, ["p", targetPk]]
        : old.tags.filter(t => !(t[0] === "p" && t[1] === targetPk));
      return { ...old, tags: newTags, created_at: Math.floor(Date.now() / 1000) };
    });
  }, [queryClient, myPubkey]);

  const doFollow = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    setPendingAction(`follow-${targetPk}`);
    try {
      const result = await followUser(targetPk, contactList);
      if (result.success) {
        optimisticUpdateContacts(targetPk, "add");
        invalidateLists();
      }
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, contactList, optimisticUpdateContacts, invalidateLists]);

  const doUnfollow = useCallback(async (targetPk: string) => {
    if (!myPubkey) return { success: false, error: "Not logged in" };
    setPendingAction(`unfollow-${targetPk}`);
    try {
      const result = await unfollowUser(targetPk, contactList);
      if (result.success) {
        optimisticUpdateContacts(targetPk, "remove");
        invalidateLists();
      }
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, contactList, optimisticUpdateContacts, invalidateLists]);

  const doMute = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    setPendingAction(`mute-${targetPk}`);
    try {
      const result = await muteUser(targetPk, muteList);
      if (result.success) {
        optimisticUpdateMutes(targetPk, "add");
        invalidateLists();
      }
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, muteList, optimisticUpdateMutes, invalidateLists]);

  const doUnmute = useCallback(async (targetPk: string) => {
    if (!myPubkey) return { success: false, error: "Not logged in" };
    setPendingAction(`unmute-${targetPk}`);
    try {
      const result = await unmuteUser(targetPk, muteList);
      if (result.success) {
        optimisticUpdateMutes(targetPk, "remove");
        invalidateLists();
      }
      return result;
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, muteList, optimisticUpdateMutes, invalidateLists]);

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
    listsLoading,
    contactList,
    muteList,
  };
}
