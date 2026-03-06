import { pool, PROFILE_RELAYS, DEFAULT_PUBLISH_RELAYS, publishToRelays, getCurrentUser } from "./nostr";

export interface NostrEvent {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

const FETCH_RELAYS = [
  ...PROFILE_RELAYS,
  "wss://relay.nostr.band",
];

function fetchReplaceableEvent(pubkey: string, kind: number, timeoutMs = 10000): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    let latest: NostrEvent | null = null;
    const timer = setTimeout(() => resolve(latest), timeoutMs);

    pool.request(FETCH_RELAYS, { kinds: [kind], authors: [pubkey], limit: 5 }).subscribe({
      next: (event: any) => {
        if (!latest || event.created_at > latest.created_at) {
          latest = {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            kind: event.kind,
            tags: event.tags,
            content: event.content,
            sig: event.sig,
          };
        }
      },
      error: () => {
        clearTimeout(timer);
        resolve(latest);
      },
      complete: () => {
        clearTimeout(timer);
        resolve(latest);
      },
    });
  });
}

export async function fetchContactList(pubkey: string): Promise<NostrEvent | null> {
  return fetchReplaceableEvent(pubkey, 3);
}

export async function fetchMuteList(pubkey: string): Promise<NostrEvent | null> {
  return fetchReplaceableEvent(pubkey, 10000);
}

export function getFollowedPubkeys(contactList: NostrEvent | null): Set<string> {
  const set = new Set<string>();
  if (!contactList) return set;
  for (const tag of contactList.tags) {
    if (tag[0] === "p" && tag[1]) set.add(tag[1]);
  }
  return set;
}

export function getMutedPubkeys(muteList: NostrEvent | null): Set<string> {
  const set = new Set<string>();
  if (!muteList) return set;
  for (const tag of muteList.tags) {
    if (tag[0] === "p" && tag[1]) set.add(tag[1]);
  }
  return set;
}

export async function followUser(targetPubkey: string, cachedContactList?: NostrEvent | null): Promise<{ success: boolean; error?: string }> {
  if (!window.nostr) return { success: false, error: "No Nostr extension found" };
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };
  if (user.pubkey === targetPubkey) return { success: false, error: "Cannot follow yourself" };

  const current = cachedContactList ?? await fetchContactList(user.pubkey);
  if (!current) return { success: false, error: "Could not fetch your contact list from relays. Please try again." };

  const alreadyFollowing = current.tags.some(t => t[0] === "p" && t[1] === targetPubkey);
  if (alreadyFollowing) return { success: true };

  const newTags = [...current.tags, ["p", targetPubkey]];
  const event = {
    kind: 3,
    tags: newTags,
    content: current.content || "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  try {
    const signed = await window.nostr.signEvent(event);
    return await publishToRelays(signed);
  } catch (e: any) {
    return { success: false, error: e?.message || "Signing failed" };
  }
}

export async function unfollowUser(targetPubkey: string, cachedContactList?: NostrEvent | null): Promise<{ success: boolean; error?: string }> {
  if (!window.nostr) return { success: false, error: "No Nostr extension found" };
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };

  const current = cachedContactList ?? await fetchContactList(user.pubkey);
  if (!current) return { success: false, error: "Could not fetch your contact list" };

  const wasFollowing = current.tags.some(t => t[0] === "p" && t[1] === targetPubkey);
  if (!wasFollowing) return { success: true };

  const newTags = current.tags.filter(t => !(t[0] === "p" && t[1] === targetPubkey));
  const event = {
    kind: 3,
    tags: newTags,
    content: current.content || "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  try {
    const signed = await window.nostr.signEvent(event);
    return await publishToRelays(signed);
  } catch (e: any) {
    return { success: false, error: e?.message || "Signing failed" };
  }
}

export async function muteUser(targetPubkey: string, cachedMuteList?: NostrEvent | null): Promise<{ success: boolean; error?: string }> {
  if (!window.nostr) return { success: false, error: "No Nostr extension found" };
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };
  if (user.pubkey === targetPubkey) return { success: false, error: "Cannot mute yourself" };

  const current = cachedMuteList ?? await fetchMuteList(user.pubkey);
  if (!current) return { success: false, error: "Could not fetch your mute list from relays. Please try again." };

  const alreadyMuted = current.tags.some(t => t[0] === "p" && t[1] === targetPubkey);
  if (alreadyMuted) return { success: true };

  const newTags = [...current.tags, ["p", targetPubkey]];
  const event = {
    kind: 10000,
    tags: newTags,
    content: current.content || "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  try {
    const signed = await window.nostr.signEvent(event);
    return await publishToRelays(signed);
  } catch (e: any) {
    return { success: false, error: e?.message || "Signing failed" };
  }
}

export async function unmuteUser(targetPubkey: string, cachedMuteList?: NostrEvent | null): Promise<{ success: boolean; error?: string }> {
  if (!window.nostr) return { success: false, error: "No Nostr extension found" };
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };

  const current = cachedMuteList ?? await fetchMuteList(user.pubkey);
  if (!current) return { success: false, error: "Could not fetch your mute list" };

  const wasMuted = current.tags.some(t => t[0] === "p" && t[1] === targetPubkey);
  if (!wasMuted) return { success: true };

  const newTags = current.tags.filter(t => !(t[0] === "p" && t[1] === targetPubkey));
  const event = {
    kind: 10000,
    tags: newTags,
    content: current.content || "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  try {
    const signed = await window.nostr.signEvent(event);
    return await publishToRelays(signed);
  } catch (e: any) {
    return { success: false, error: e?.message || "Signing failed" };
  }
}

export async function reportUser(targetPubkey: string, reason: string): Promise<{ success: boolean; error?: string }> {
  if (!window.nostr) return { success: false, error: "No Nostr extension found" };
  const user = getCurrentUser();
  if (!user?.pubkey) return { success: false, error: "Not logged in" };
  if (user.pubkey === targetPubkey) return { success: false, error: "Cannot report yourself" };

  const event = {
    kind: 1984,
    tags: [
      ["p", targetPubkey, reason],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  try {
    const signed = await window.nostr.signEvent(event);
    return await publishToRelays(signed);
  } catch (e: any) {
    return { success: false, error: e?.message || "Signing failed" };
  }
}
