import { nip19 } from "nostr-tools";
import { EventStore } from "applesauce-core";
import {
  getProfileContent,
  getDisplayName,
  getProfilePicture,
  isValidProfile,
} from "applesauce-core/helpers/profile";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { apiClient } from "./api";

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  }
}

export interface NostrUser {
  pubkey: string;
  npub: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  profile?: ProfileContent;
  userData?: any;
}

const eventStore = new EventStore();

let currentUser: NostrUser | null = null;

export function getCurrentUser(): NostrUser | null {
  if (currentUser) return currentUser;

  const stored = localStorage.getItem("nostr_user");
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      return currentUser;
    } catch {
      return null;
    }
  }
  return null;
}

function setCurrentUser(user: NostrUser | null) {
  currentUser = user;
  if (user) {
    localStorage.setItem("nostr_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("nostr_user");
  }
}

export function updateCurrentUser(updates: Partial<NostrUser>) {
  const existing = getCurrentUser();
  if (!existing) return;
  const updated = { ...existing, ...updates };
  setCurrentUser(updated);
}

export async function fetchProfileFromServer(pubkey: string): Promise<ProfileContent | undefined> {
  try {
    const resp = await fetch(`/api/profile/${pubkey}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return undefined;

    const data = await resp.json();
    if (!data?.event) return undefined;

    const event = data.event;

    try {
      eventStore.add(event as any);
    } catch {}

    if (isValidProfile(event as any)) {
      return getProfileContent(event as any);
    }

    if (typeof event.content === "string") {
      try {
        return JSON.parse(event.content) as ProfileContent;
      } catch {}
    }
  } catch {}

  return undefined;
}

export function applyProfileToUser(content: ProfileContent): Partial<NostrUser> {
  return {
    profile: content,
    displayName: getDisplayName(content) || content.name || content.display_name,
    picture: getProfilePicture(content) || content.picture || content.image,
    about: content.about,
    nip05: content.nip05,
  };
}

export async function handleLogin(): Promise<NostrUser> {
  if (!window.nostr) {
    throw new Error("No Nostr extension found. Please install a NIP-07 compatible extension like nos2x or Alby.");
  }

  let pubkey: string;
  try {
    pubkey = await window.nostr.getPublicKey();
  } catch {
    throw new Error("Permission denied. Please allow the Nostr extension to share your public key.");
  }

  if (!pubkey || typeof pubkey !== "string") {
    throw new Error("Invalid public key received from extension.");
  }

  const challenge = await apiClient.getAuthChallenge(pubkey);

  const event = {
    kind: 22242,
    tags: [
      ["t", "brainstorm_login"],
      ["challenge", challenge]
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey
  };

  const signedEvent = await window.nostr.signEvent(event);

  const result = await apiClient.verifyAuthChallenge(pubkey, signedEvent);
  const token = result.data?.token || (result as any).token;
  if (!token) {
    throw new Error("No token received from server");
  }
  localStorage.setItem("brainstorm_session_token", token);

  const npub = nip19.npubEncode(pubkey);

  const user: NostrUser = {
    pubkey,
    npub,
  };

  setCurrentUser(user);
  return user;
}

export function logout() {
  setCurrentUser(null);
  localStorage.removeItem("brainstorm_session_token");
}

export { eventStore };
