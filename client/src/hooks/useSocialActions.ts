import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

  // Optimistic cache writers. Seed a minimal list when the user has none yet
  // (brand-new account) so the very first follow/mute still flips instantly, and
  // dedupe the "add" so a double-tap can't push two p-tags.
  const optimisticUpdateContacts = useCallback((targetPk: string, action: "add" | "remove") => {
    queryClient.setQueryData(["nostr-contacts", myPubkey], (old: NostrEvent | null | undefined) => {
      const base: NostrEvent = old ?? { pubkey: myPubkey ?? "", created_at: 0, kind: 3, tags: [], content: "" };
      const has = base.tags.some(t => t[0] === "p" && t[1] === targetPk);
      const newTags = action === "add"
        ? (has ? base.tags : [...base.tags, ["p", targetPk]])
        : base.tags.filter(t => !(t[0] === "p" && t[1] === targetPk));
      return { ...base, tags: newTags, created_at: Math.floor(Date.now() / 1000) };
    });
  }, [queryClient, myPubkey]);

  const optimisticUpdateMutes = useCallback((targetPk: string, action: "add" | "remove") => {
    queryClient.setQueryData(["nostr-mutes", myPubkey], (old: NostrEvent | null | undefined) => {
      const base: NostrEvent = old ?? { pubkey: myPubkey ?? "", created_at: 0, kind: 10000, tags: [], content: "" };
      const has = base.tags.some(t => t[0] === "p" && t[1] === targetPk);
      const newTags = action === "add"
        ? (has ? base.tags : [...base.tags, ["p", targetPk]])
        : base.tags.filter(t => !(t[0] === "p" && t[1] === targetPk));
      return { ...base, tags: newTags, created_at: Math.floor(Date.now() / 1000) };
    });
  }, [queryClient, myPubkey]);

  // All four toggles are OPTIMISTIC-FIRST: flip the cache the instant the user
  // clicks (so the button reflects it with no spinner wait), then publish in the
  // background. We deliberately do NOT re-fetch the list from relays afterward —
  // relays are eventually consistent, so reading our own just-published event
  // back usually returns the OLD list and would revert the flip. Our signed event
  // is the source of truth; relays re-sync naturally on the next mount. Roll the
  // optimistic write back only if the publish actually fails.
  const doFollow = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    const snapshot = queryClient.getQueryData<NostrEvent | null>(["nostr-contacts", myPubkey]);
    optimisticUpdateContacts(targetPk, "add");
    setPendingAction(`follow-${targetPk}`);
    try {
      const result = await followUser(targetPk, contactList);
      if (!result.success) queryClient.setQueryData(["nostr-contacts", myPubkey], snapshot);
      return result;
    } catch (e) {
      queryClient.setQueryData(["nostr-contacts", myPubkey], snapshot);
      return signingFailure(e, "Follow failed");
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, contactList, optimisticUpdateContacts, queryClient]);

  const doUnfollow = useCallback(async (targetPk: string) => {
    if (!myPubkey) return { success: false, error: "Not logged in" };
    const snapshot = queryClient.getQueryData<NostrEvent | null>(["nostr-contacts", myPubkey]);
    optimisticUpdateContacts(targetPk, "remove");
    setPendingAction(`unfollow-${targetPk}`);
    try {
      const result = await unfollowUser(targetPk, contactList);
      if (!result.success) queryClient.setQueryData(["nostr-contacts", myPubkey], snapshot);
      return result;
    } catch (e) {
      queryClient.setQueryData(["nostr-contacts", myPubkey], snapshot);
      return signingFailure(e, "Unfollow failed");
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, contactList, optimisticUpdateContacts, queryClient]);

  const doMute = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    const snapshot = queryClient.getQueryData<NostrEvent | null>(["nostr-mutes", myPubkey]);
    optimisticUpdateMutes(targetPk, "add");
    setPendingAction(`mute-${targetPk}`);
    try {
      const result = await muteUser(targetPk, muteList);
      if (!result.success) queryClient.setQueryData(["nostr-mutes", myPubkey], snapshot);
      return result;
    } catch (e) {
      queryClient.setQueryData(["nostr-mutes", myPubkey], snapshot);
      return signingFailure(e, "Mute failed");
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, muteList, optimisticUpdateMutes, queryClient]);

  const doUnmute = useCallback(async (targetPk: string) => {
    if (!myPubkey) return { success: false, error: "Not logged in" };
    const snapshot = queryClient.getQueryData<NostrEvent | null>(["nostr-mutes", myPubkey]);
    optimisticUpdateMutes(targetPk, "remove");
    setPendingAction(`unmute-${targetPk}`);
    try {
      const result = await unmuteUser(targetPk, muteList);
      if (!result.success) queryClient.setQueryData(["nostr-mutes", myPubkey], snapshot);
      return result;
    } catch (e) {
      queryClient.setQueryData(["nostr-mutes", myPubkey], snapshot);
      return signingFailure(e, "Unmute failed");
    } finally {
      setPendingAction(null);
    }
  }, [myPubkey, muteList, optimisticUpdateMutes, queryClient]);

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

  const doUnreport = useCallback(async (targetPk: string) => {
    if (!myPubkey || myPubkey === targetPk) return { success: false, error: "Invalid action" };
    setPendingAction(`unreport-${targetPk}`);
    try {
      return await unreportUser(targetPk);
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
    unreport: doUnreport,
    isPending,
    isAnyPending,
    listsLoading,
    contactList,
    muteList,
  };
}
