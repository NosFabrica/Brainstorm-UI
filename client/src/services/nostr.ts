import { nip19 } from "nostr-tools";
import { EventStore } from "applesauce-core";
import {
  getProfileContent,
  getDisplayName,
  getProfilePicture,
  isValidProfile,
} from "applesauce-core/helpers/profile";
import type { ProfileContent } from "applesauce-core/helpers/profile";

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
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

const eventStore = new EventStore();

let currentUser: NostrUser | null = null;

export function getCurrentUser(): NostrUser | null {
  if (currentUser) return currentUser;

  const stored = sessionStorage.getItem("nostr_user");
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
    sessionStorage.setItem("nostr_user", JSON.stringify(user));
  } else {
    sessionStorage.removeItem("nostr_user");
  }
}

function fetchProfileEvent(relayUrl: string, pubkey: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve(null);
    }, 5000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timeout);
      resolve(null);
      return;
    }

    let resolved = false;

    ws.onopen = () => {
      const subId = "profile_" + Math.random().toString(36).slice(2, 8);
      ws.send(JSON.stringify(["REQ", subId, { kinds: [0], authors: [pubkey], limit: 1 }]));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === "EVENT" && data[2]) {
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          resolve(data[2]);
        } else if (data[0] === "EOSE") {
          if (!resolved) {
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      if (!resolved) resolve(null);
    };
  });
}

async function fetchAndStoreProfile(pubkey: string): Promise<ProfileContent | undefined> {
  for (const url of DEFAULT_RELAYS) {
    try {
      const event = await fetchProfileEvent(url, pubkey);
      if (event) {
        eventStore.add(event as any);
        if (isValidProfile(event as any)) {
          return getProfileContent(event as any);
        }
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function connectNostr(): Promise<NostrUser> {
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

  const npub = nip19.npubEncode(pubkey);

  const user: NostrUser = {
    pubkey,
    npub,
  };

  try {
    const content = await fetchAndStoreProfile(pubkey);
    if (content) {
      user.profile = content;
      user.displayName = getDisplayName(content);
      user.picture = getProfilePicture(content);
      user.about = content.about;
      user.nip05 = content.nip05;
    }
  } catch {
    // Profile fetch failed silently; user can still proceed with pubkey
  }

  setCurrentUser(user);
  return user;
}

export function logout() {
  setCurrentUser(null);
}

export { eventStore };
