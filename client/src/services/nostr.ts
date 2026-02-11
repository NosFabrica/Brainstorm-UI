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
    }, 8000);

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
          try { ws.close(); } catch {}
          resolve(data[2]);
        } else if (data[0] === "EOSE") {
          if (!resolved) {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            resolve(null);
          }
        }
      } catch {}
    };

    ws.onerror = () => {
      if (!resolved) {
        clearTimeout(timeout);
        resolve(null);
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        clearTimeout(timeout);
        resolve(null);
      }
    };
  });
}

async function fetchProfileViaHttp(pubkey: string): Promise<Record<string, unknown> | null> {
  try {
    const npub = nip19.npubEncode(pubkey);
    const resp = await fetch(`https://relay.nostr.band/nostr?method=req&params=[{"kinds":[0],"authors":["${pubkey}"],"limit":1}]`, {
      signal: AbortSignal.timeout(6000),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
    }
  } catch {}

  try {
    const resp = await fetch(`https://api.nostr.band/v0/profiles/${pubkey}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.profiles?.[0]?.event) {
        return data.profiles[0].event;
      }
    }
  } catch {}

  return null;
}

async function fetchAndStoreProfile(pubkey: string): Promise<ProfileContent | undefined> {
  const relayPromises = DEFAULT_RELAYS.map((url) => fetchProfileEvent(url, pubkey));
  const httpPromise = fetchProfileViaHttp(pubkey);

  const results = await Promise.allSettled([...relayPromises, httpPromise]);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const event = result.value;
      try {
        eventStore.add(event as any);
      } catch {}

      if (isValidProfile(event as any)) {
        return getProfileContent(event as any);
      }

      if (typeof (event as any).content === "string") {
        try {
          const parsed = JSON.parse((event as any).content);
          return parsed as ProfileContent;
        } catch {}
      }
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
      user.displayName = getDisplayName(content) || content.name || content.display_name;
      user.picture = getProfilePicture(content) || content.picture || content.image;
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
