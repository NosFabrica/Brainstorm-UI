import { nip19 } from "nostr-tools";
import { RelayPool } from "applesauce-relay";
import { EventStore, firstValueFrom } from "applesauce-core";
import {
  getProfileContent,
  getDisplayName,
  getProfilePicture,
  isValidProfile,
} from "applesauce-core/helpers/profile";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { apiClient } from "./api";
import { queryClient } from "@/lib/queryClient";
import { NostrEvent } from "applesauce-core/helpers";

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

export const PROFILE_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://purplepag.es/",
  "wss://nostr.wine/",
];

const pool = new RelayPool();

export function fetchProfiles(
  pubkeys: string[],
  onProfile?: (pubkey: string, profile: ProfileContent) => void
): Promise<void> {
  return new Promise<void>((resolve) => {
    pool.request(PROFILE_RELAYS, { kinds: [0], authors: pubkeys }).subscribe({
      next: (event) => {
        try { 
          if (eventStore.add(event)) {
            if (onProfile && isValidProfile(event)) {
              const content = getProfileContent(event);
              if (content) onProfile(event.pubkey, content);
            }
          }; 
        } catch {}
      },
      error: () => resolve(),
      complete: () => resolve(),
    });
  });
}

export async function fetchOutboxRelayList(pubkey: string, timeoutMs = 10000, extraRelays?: string[]): Promise<NostrEvent | undefined> {
  const hasExtra = extraRelays && extraRelays.length > 0;
  const primaryTimeout = hasExtra ? Math.min(timeoutMs, 3000) : timeoutMs;

  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS)
    const event = await Promise.race([
      firstValueFrom(pool.request(writeRelays, { kinds: [10002], authors: [pubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), primaryTimeout)),
    ]);
    if (event) {
      try { eventStore.add(event as any); } catch {}
      return event as NostrEvent;
    }
  } catch {}

  if (hasExtra) {
    try {
      const event = await Promise.race([
        firstValueFrom(pool.request(extraRelays!, { kinds: [10002], authors: [pubkey] })),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
      ]);
      if (event) {
        try { eventStore.add(event as any); } catch {}
        return event as NostrEvent;
      }
    } catch {}
  }

  return undefined;
}

export async function fetchTrustProviderList(pubkey: string, timeoutMs = 10000, extraRelays: string[] = []): Promise<NostrEvent | undefined> {
  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS)
    const allRelays = extraRelays.length > 0
      ? [...new Set([...writeRelays, ...extraRelays])]
      : writeRelays;

    const event = await Promise.race([
      firstValueFrom(pool.request(allRelays, { kinds: [10040], authors: [pubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);

    if (!event) return undefined;

    try {
      eventStore.add(event as any);
    } catch {}

    return event as NostrEvent;
  } catch {}

  return undefined;
}


export async function isUsingBrainstorm(pubkey: string, innerPubkey: string, timeoutMs = 10000): Promise<boolean> {
  console.log("isUsingBrainstorm", pubkey, innerPubkey)
  const event = await fetchTrustProviderList(pubkey, timeoutMs)

  let isUsingRank = false
  let isUsingFollowers = false

  if (event) {
    for (const tag of event.tags) {
      if (tag[0] === "30382:rank" && tag[1] === innerPubkey && tag[2] == "wss://nip85.nosfabrica.com") {
        isUsingRank = true
      }
      if (tag[0] === "30382:followers" && tag[1] === innerPubkey && tag[2] == "wss://nip85.nosfabrica.com") {
        isUsingFollowers = true
      }
    }
  }

  return isUsingRank && isUsingFollowers
}

export function loadOutboxRelayListFromDb(pubkey: string, currentRelays: string[]): string[] {
  const outboxEvent = eventStore.getReplaceable(10002, pubkey)
  const writeRelays = new Set<string>(currentRelays);
  
  if (outboxEvent) {
    for (const tag of outboxEvent.tags) {
      if (tag[0] === "r" && tag[1] && (tag.length <= 2 || tag[2] === "write")) {
        writeRelays.add(tag[1]);
      }
    }
  }

  return Array.from(writeRelays)
}

function parseProfileEvent(event: any): ProfileContent | undefined {
  try { eventStore.add(event as any); } catch {}
  if (isValidProfile(event as any)) {
    return getProfileContent(event as any);
  }
  if (typeof event.content === "string") {
    try { return JSON.parse(event.content) as ProfileContent; } catch {}
  }
  return undefined;
}

export async function fetchProfile(pubkey: string, timeoutMs = 10000, extraRelays?: string[]): Promise<ProfileContent | undefined> {
  const hasExtra = extraRelays && extraRelays.length > 0;
  const primaryTimeout = hasExtra ? Math.min(timeoutMs, 3000) : timeoutMs;

  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS)
    const event = await Promise.race([
      firstValueFrom(pool.request(writeRelays, { kinds: [0], authors: [pubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), primaryTimeout)),
    ]);
    if (event) return parseProfileEvent(event);
  } catch {}

  if (hasExtra) {
    try {
      const event = await Promise.race([
        firstValueFrom(pool.request(extraRelays!, { kinds: [0], authors: [pubkey] })),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
      ]);
      if (event) return parseProfileEvent(event);
    } catch {}
  }

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
  queryClient.clear();
}

export async function publishToRelays(
  signedEvent: Record<string, unknown>,
  relays: string[] = PROFILE_RELAYS
): Promise<{ success: boolean; relay?: string; error?: string }> {
  const writeRelays = loadOutboxRelayListFromDb((signedEvent as any).pubkey, PROFILE_RELAYS)

  try {
    const responses = await pool.publish(writeRelays, signedEvent as any);
    const succeeded = responses.find(r => r.ok);
    if (succeeded) return { success: true, relay: succeeded.from };
    return { success: false, error: responses[0]?.message || "All relays failed" };
  } catch {
    return { success: false, error: "All relays failed" };
  }
}

export async function signNip85(
  serviceKey: string,
  relayHint: string
): Promise<Record<string, unknown>> {
  if (!window.nostr) {
    return { success: false, error: "No Nostr extension found" };
  }

  const user = getCurrentUser();
  if (!user?.pubkey) {
    return { success: false, error: "Not logged in" };
  }

  const event = {
    kind: 10040,
    tags: [
      ["30382:rank", serviceKey, relayHint],
      ["30382:followers", serviceKey, relayHint]
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  return await window.nostr.signEvent(event);
}

export async function signNip85Deactivation(): Promise<Record<string, unknown>> {
  if (!window.nostr) {
    return { success: false, error: "No Nostr extension found" };
  }

  const user = getCurrentUser();
  if (!user?.pubkey) {
    return { success: false, error: "Not logged in" };
  }

  const event = {
    kind: 10040,
    tags: [],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: user.pubkey,
  };

  return await window.nostr.signEvent(event);
}

export interface ReportMetadata {
  reporterPubkey: string;
  targetPubkey: string;
  reportType: string;
  timestamp: number;
  reason: string;
}

export interface MuteMetadata {
  muterPubkey: string;
  timestamp: number;
}

export async function fetchReportsForPubkey(
  targetPubkey: string,
  timeoutMs = 12000
): Promise<ReportMetadata[]> {
  const reports: ReportMetadata[] = [];
  const seen = new Set<string>();

  return new Promise<ReportMetadata[]>((resolve) => {
    const timer = setTimeout(() => resolve(reports), timeoutMs);

    pool.request(PROFILE_RELAYS, { kinds: [1984], "#p": [targetPubkey] }).subscribe({
      next: (event) => {
        try {
          const eventId = (event as any).id || `${event.pubkey}-${event.created_at}`;
          if (seen.has(eventId)) return;
          seen.add(eventId);

          let reportType = "other";
          for (const tag of event.tags) {
            if (tag[0] === "p" && tag[1] === targetPubkey && tag[2]) {
              reportType = tag[2];
              break;
            }
          }

          reports.push({
            reporterPubkey: event.pubkey,
            targetPubkey,
            reportType,
            timestamp: event.created_at,
            reason: event.content || "",
          });
        } catch {}
      },
      error: () => { clearTimeout(timer); resolve(reports); },
      complete: () => { clearTimeout(timer); resolve(reports); },
    });
  });
}

export async function fetchReportsByPubkey(
  reporterPubkey: string,
  timeoutMs = 12000
): Promise<ReportMetadata[]> {
  const reports: ReportMetadata[] = [];
  const seen = new Set<string>();

  return new Promise<ReportMetadata[]>((resolve) => {
    const timer = setTimeout(() => resolve(reports), timeoutMs);

    pool.request(PROFILE_RELAYS, { kinds: [1984], authors: [reporterPubkey] }).subscribe({
      next: (event) => {
        try {
          const eventId = (event as any).id || `${event.pubkey}-${event.created_at}`;
          if (seen.has(eventId)) return;
          seen.add(eventId);

          for (const tag of event.tags) {
            if (tag[0] === "p" && tag[1]) {
              reports.push({
                reporterPubkey: event.pubkey,
                targetPubkey: tag[1],
                reportType: tag[2] || "other",
                timestamp: event.created_at,
                reason: event.content || "",
              });
            }
          }
        } catch {}
      },
      error: () => { clearTimeout(timer); resolve(reports); },
      complete: () => { clearTimeout(timer); resolve(reports); },
    });
  });
}

export async function fetchMuteListTimestamp(
  muterPubkey: string,
  timeoutMs = 10000
): Promise<MuteMetadata | undefined> {
  try {
    const event = await Promise.race([
      firstValueFrom(pool.request(PROFILE_RELAYS, { kinds: [10000], authors: [muterPubkey] })),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);

    if (!event) return undefined;

    return {
      muterPubkey,
      timestamp: event.created_at,
    };
  } catch {}
  return undefined;
}

const DCOSL_RELAY_DEFAULT = "wss://dcosl.brainstorm.world";
const DCOSL_RELAY_KEY = "brainstorm_dcosl_relay";

export const TAPESTRY_RELAY = "wss://nous-clawds4.tapestry.ninja/relay";
const DWARVES_PUBKEY = "beba5587f5e570afaf6f80d5f5565b3d19c29e82f669634ab199bf050ca375f4";
export const DWARVES_ATAG_PREFIX = "39998:" + DWARVES_PUBKEY + ":dwarf";
export const NOUS_DEMO_PUBKEY = "15f7dafc4624b1e6b00ab7f863de1a53b71967528070ec7d1837c7a40c1c7270";

export function getDcoslRelay(): string {
  return localStorage.getItem(DCOSL_RELAY_KEY) || DCOSL_RELAY_DEFAULT;
}

export function setDcoslRelay(url: string) {
  if (!url || url === DCOSL_RELAY_DEFAULT) {
    localStorage.removeItem(DCOSL_RELAY_KEY);
  } else {
    localStorage.setItem(DCOSL_RELAY_KEY, url);
  }
  clearDcoslCache();
}

export function getDcoslRelayDefault(): string {
  return DCOSL_RELAY_DEFAULT;
}

export const DCOSL_RELAY = DCOSL_RELAY_DEFAULT;

export interface DListHeader {
  id: string;
  kind: number;
  pubkey: string;
  createdAt: number;
  dTag: string;
  aTag: string;
  name: string;
  namePlural: string;
  description: string;
  propertyTags: { requirement: string; value: string }[];
}

export interface DListItem {
  id: string;
  kind: number;
  pubkey: string;
  createdAt: number;
  dTag: string;
  aTag: string;
  parentRef: string;
  name: string;
  content: string;
  image: string;
  jsonData: Record<string, unknown> | null;
}

const dcoslListCache = new Map<string, DListHeader[]>();
const dcoslItemCache = new Map<string, DListItem[]>();

function getTag(event: any, name: string, index = 1): string | null {
  const tag = event.tags?.find((t: string[]) => t[0] === name);
  return tag ? tag[index] || null : null;
}

function parseDListHeader(event: any): DListHeader | null {
  const kind = event.kind;
  if (kind !== 9998 && kind !== 39998) return null;

  const dTag = kind === 39998 ? (getTag(event, "d") || "") : "";
  const aTag = kind === 39998
    ? `${kind}:${event.pubkey}:${dTag}`
    : event.id;

  const namesTag = event.tags?.find((t: string[]) => t[0] === "names");
  const name = namesTag ? (namesTag[1] || "") : (getTag(event, "name") || "Untitled List");
  const namePlural = namesTag ? (namesTag[2] || namesTag[1] || name) : name;
  const description = getTag(event, "description") || "";

  const propertyTags: { requirement: string; value: string }[] = [];
  for (const tag of event.tags || []) {
    if (tag[0] === "required" || tag[0] === "optional" || tag[0] === "recommended") {
      propertyTags.push({ requirement: tag[0], value: tag[1] || "" });
    }
  }

  return {
    id: event.id || `${event.pubkey}-${event.created_at}`,
    kind,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    dTag,
    aTag,
    name,
    namePlural,
    description,
    propertyTags,
  };
}

function parseDListItem(event: any): DListItem | null {
  const kind = event.kind;
  if (kind !== 9999 && kind !== 39999) return null;

  const dTag = kind === 39999 ? (getTag(event, "d") || "") : "";
  const aTag = kind === 39999
    ? `${kind}:${event.pubkey}:${dTag}`
    : event.id;

  const parentRef = getTag(event, "z") || "";
  const name = getTag(event, "name") || getTag(event, "title") || "";
  const image = getTag(event, "image") || getTag(event, "thumb") || "";

  let jsonData: Record<string, unknown> | null = null;
  const jsonTag = getTag(event, "json");
  if (jsonTag) {
    try { jsonData = JSON.parse(jsonTag); } catch {}
  }

  return {
    id: event.id || `${event.pubkey}-${event.created_at}`,
    kind,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    dTag,
    aTag,
    parentRef,
    name,
    content: event.content || "",
    image,
    jsonData,
  };
}

export async function fetchDListHeaders(timeoutMs = 15000, forceRefresh = false): Promise<DListHeader[]> {
  const cacheKey = "all";
  if (!forceRefresh && dcoslListCache.has(cacheKey)) return dcoslListCache.get(cacheKey)!;

  const headers: DListHeader[] = [];
  const seen = new Set<string>();

  const handleEvent = (event: any) => {
    try {
      const parsed = parseDListHeader(event);
      if (!parsed) return;
      const key = parsed.aTag;
      if (seen.has(key)) {
        const existing = headers.find(h => h.aTag === key);
        if (existing && parsed.createdAt > existing.createdAt) {
          const idx = headers.indexOf(existing);
          headers[idx] = parsed;
        }
        return;
      }
      seen.add(key);
      headers.push(parsed);
    } catch {}
  };

  return new Promise<DListHeader[]>((resolve) => {
    let pending = 2;
    const timer = setTimeout(() => {
      dcoslListCache.set(cacheKey, headers);
      resolve(headers);
    }, timeoutMs);

    const finish = () => {
      pending--;
      if (pending <= 0) {
        clearTimeout(timer);
        dcoslListCache.set(cacheKey, headers);
        resolve(headers);
      }
    };

    pool.request([getDcoslRelay()], { kinds: [9998, 39998] }).subscribe({
      next: handleEvent,
      error: finish,
      complete: finish,
    });

    pool.request([TAPESTRY_RELAY], { kinds: [39998], authors: [DWARVES_PUBKEY] }).subscribe({
      next: handleEvent,
      error: finish,
      complete: finish,
    });
  });
}

export async function fetchDListItems(parentATag: string, timeoutMs = 15000, forceRefresh = false): Promise<DListItem[]> {
  if (!forceRefresh && dcoslItemCache.has(parentATag)) return dcoslItemCache.get(parentATag)!;

  const items: DListItem[] = [];
  const seen = new Set<string>();
  const isDwarves = parentATag.startsWith(DWARVES_ATAG_PREFIX);
  const relays = isDwarves ? [getDcoslRelay(), TAPESTRY_RELAY] : [getDcoslRelay()];

  const handleEvent = (event: any) => {
    try {
      const parsed = parseDListItem(event);
      if (!parsed) return;
      const key = parsed.aTag;
      if (seen.has(key)) {
        const existing = items.find(i => i.aTag === key);
        if (existing && parsed.createdAt > existing.createdAt) {
          const idx = items.indexOf(existing);
          items[idx] = parsed;
        }
        return;
      }
      seen.add(key);
      items.push(parsed);
    } catch {}
  };

  return new Promise<DListItem[]>((resolve) => {
    const timer = setTimeout(() => {
      dcoslItemCache.set(parentATag, items);
      resolve(items);
    }, timeoutMs);

    let pending = relays.length;
    const finish = () => {
      pending--;
      if (pending <= 0) {
        clearTimeout(timer);
        dcoslItemCache.set(parentATag, items);
        resolve(items);
      }
    };

    for (const relay of relays) {
      pool.request([relay], { kinds: [9999, 39999], "#z": [parentATag] }).subscribe({
        next: handleEvent,
        error: finish,
        complete: finish,
      });
    }
  });
}

export function clearDcoslCache() {
  dcoslListCache.clear();
  dcoslItemCache.clear();
  dcoslReactionCache.clear();
}

export interface DListReaction {
  id: string;
  pubkey: string;
  createdAt: number;
  targetItemATag: string;
  isUpvote: boolean;
}

const dcoslReactionCache = new Map<string, DListReaction[]>();

export async function fetchDListReactions(
  itemATags: string[],
  timeoutMs = 15000,
  forceRefresh = false,
  parentListATag?: string
): Promise<DListReaction[]> {
  const cacheKey = (parentListATag ? parentListATag + "||" : "") + [...itemATags].sort().join("|");
  if (!forceRefresh && dcoslReactionCache.has(cacheKey)) return dcoslReactionCache.get(cacheKey)!;

  const reactions: DListReaction[] = [];
  const seen = new Set<string>();
  const validTargets = new Set(itemATags);
  const isDwarves = !!(parentListATag && parentListATag.startsWith(DWARVES_ATAG_PREFIX)) ||
    itemATags.some(a => a.includes(":" + DWARVES_PUBKEY + ":dwarf"));
  const relays = isDwarves ? [getDcoslRelay(), TAPESTRY_RELAY] : [getDcoslRelay()];

  const filters: Array<{ kinds: number[]; "#e"?: string[]; "#a"?: string[]; _tagType: string }> = [];
  const nonReplaceableIds = itemATags.filter(a => !a.includes(":"));
  const replaceableATags = itemATags.filter(a => a.includes(":"));
  if (nonReplaceableIds.length > 0) filters.push({ kinds: [7], "#e": nonReplaceableIds, _tagType: "e" });
  if (replaceableATags.length > 0) filters.push({ kinds: [7], "#a": replaceableATags, _tagType: "a" });
  if (filters.length === 0) {
    dcoslReactionCache.set(cacheKey, []);
    return [];
  }

  const handleEvent = (expectedTagType: string) => (event: any) => {
    try {
      const eventWithId = event as NostrEvent & { id?: string };
      const eventId = eventWithId.id || `${event.pubkey}-${event.created_at}`;
      if (seen.has(eventId)) return;
      seen.add(eventId);

      const content = (event.content || "").trim();
      const isUpvote = content === "+" || content === "";
      const isDownvote = content === "-";
      if (!isUpvote && !isDownvote) return;

      let targetItemATag = "";
      for (const tag of event.tags || []) {
        if (tag[0] === expectedTagType && tag[1] && validTargets.has(tag[1])) {
          targetItemATag = tag[1];
          break;
        }
      }
      if (!targetItemATag) return;

      reactions.push({
        id: eventId,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        targetItemATag,
        isUpvote,
      });
    } catch {}
  };

  return new Promise<DListReaction[]>((resolve) => {
    const timer = setTimeout(() => {
      dcoslReactionCache.set(cacheKey, reactions);
      resolve(reactions);
    }, timeoutMs);

    let pending = filters.length * relays.length;
    const finish = () => {
      pending--;
      if (pending <= 0) {
        clearTimeout(timer);
        dcoslReactionCache.set(cacheKey, reactions);
        resolve(reactions);
      }
    };

    for (const filter of filters) {
      const expectedTagType = filter._tagType as string;
      const { _tagType, ...relayFilter } = filter;
      for (const relay of relays) {
        pool.request([relay], relayFilter).subscribe({
          next: handleEvent(expectedTagType),
          error: finish,
          complete: finish,
        });
      }
    }
  });
}

export async function fetchDListReactionsByPubkey(
  pubkey: string,
  timeoutMs = 15000
): Promise<DListReaction[]> {
  const reactions: DListReaction[] = [];
  const seen = new Set<string>();

  return new Promise<DListReaction[]>((resolve) => {
    const timer = setTimeout(() => resolve(reactions), timeoutMs);

    pool.request([getDcoslRelay()], { kinds: [7], authors: [pubkey] }).subscribe({
      next: (event) => {
        try {
          const eventWithId = event as NostrEvent & { id?: string };
          const eventId = eventWithId.id || `${event.pubkey}-${event.created_at}`;
          if (seen.has(eventId)) return;
          seen.add(eventId);

          const content = (event.content || "").trim();
          const isUpvote = content === "+" || content === "";
          const isDownvote = content === "-";
          if (!isUpvote && !isDownvote) return;

          let targetItemATag = "";
          for (const tag of event.tags || []) {
            if ((tag[0] === "a" || tag[0] === "e") && tag[1]) {
              targetItemATag = tag[1];
              break;
            }
          }
          if (!targetItemATag) return;

          reactions.push({
            id: eventId,
            pubkey: event.pubkey,
            createdAt: event.created_at,
            targetItemATag,
            isUpvote,
          });
        } catch {}
      },
      error: () => { clearTimeout(timer); resolve(reactions); },
      complete: () => { clearTimeout(timer); resolve(reactions); },
    });
  });
}

export async function fetchFollowList(pubkey: string, timeoutMs = 10000): Promise<Set<string>> {
  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS);
    const events: NostrEvent[] = [];
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pool.request(writeRelays, { kinds: [3], authors: [pubkey] }).subscribe({
        next: (event) => { events.push(event); },
        error: () => { clearTimeout(timer); resolve(); },
        complete: () => { clearTimeout(timer); resolve(); },
      });
    });
    if (events.length === 0) return new Set();
    let latest = events[0];
    for (let i = 1; i < events.length; i++) {
      if (events[i].created_at > latest.created_at) latest = events[i];
    }
    const follows = new Set<string>();
    for (const tag of latest.tags || []) {
      if (tag[0] === "p" && tag[1]) follows.add(tag[1]);
    }
    return follows;
  } catch {
    return new Set();
  }
}

export interface TrustedListInfo {
  dTag: string;
  pubkeys: Set<string>;
  createdAt: number;
}

export async function fetchTrustedLists(pubkey: string, timeoutMs = 10000): Promise<TrustedListInfo[]> {
  try {
    const writeRelays = loadOutboxRelayListFromDb(pubkey, PROFILE_RELAYS);
    const events: NostrEvent[] = [];
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pool.request(writeRelays, { kinds: [30392], authors: [pubkey] }).subscribe({
        next: (event) => { events.push(event); },
        error: () => { clearTimeout(timer); resolve(); },
        complete: () => { clearTimeout(timer); resolve(); },
      });
    });
    const byDTag = new Map<string, NostrEvent>();
    for (const event of events) {
      const dTag = getTag(event, "d") || "";
      const existing = byDTag.get(dTag);
      if (!existing || event.created_at > existing.created_at) {
        byDTag.set(dTag, event);
      }
    }
    const lists: TrustedListInfo[] = [];
    for (const [dTag, event] of byDTag) {
      const pubkeys = new Set<string>();
      for (const tag of event.tags || []) {
        if (tag[0] === "p" && tag[1]) pubkeys.add(tag[1]);
      }
      lists.push({ dTag, pubkeys, createdAt: event.created_at });
    }
    return lists;
  } catch {
    return [];
  }
}

export async function fetchTrustedList(pubkey: string, listDTag?: string, timeoutMs = 10000): Promise<Set<string>> {
  const lists = await fetchTrustedLists(pubkey, timeoutMs);
  if (lists.length === 0) return new Set();
  if (listDTag) {
    const match = lists.find(l => l.dTag === listDTag);
    return match ? match.pubkeys : new Set();
  }
  const allPubkeys = new Set<string>();
  for (const list of lists) {
    for (const pk of list.pubkeys) allPubkeys.add(pk);
  }
  return allPubkeys;
}

export async function fetchGrapeRankScores(
  povPubkey: string,
  targetPubkeys: string[],
  timeoutMs = 15000,
  extraRelays: string[] = []
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (targetPubkeys.length === 0) return scores;

  try {
    const treasureMap = await fetchTrustProviderList(povPubkey, timeoutMs, extraRelays);
    if (!treasureMap) return scores;

    let grapeRankRelay = "";
    let grapeRankAuthor = "";
    for (const tag of treasureMap.tags || []) {
      if (tag[0] === "30382:rank" && tag[1] && tag[2]) {
        grapeRankAuthor = tag[1];
        grapeRankRelay = tag[2];
        break;
      }
    }
    if (!grapeRankRelay || !grapeRankAuthor) return scores;

    const batches: string[][] = [];
    for (let i = 0; i < targetPubkeys.length; i += 50) {
      batches.push(targetPubkeys.slice(i, i + 50));
    }

    for (const batch of batches) {
      const dTags = batch.map(pk => `${povPubkey}:${pk}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        pool.request([grapeRankRelay], {
          kinds: [30382],
          authors: [grapeRankAuthor],
          "#d": dTags,
        }).subscribe({
          next: (event) => {
            try {
              const dTag = getTag(event, "d");
              if (!dTag) return;
              const parts = dTag.split(":");
              if (parts.length < 2) return;
              const targetPk = parts[1];
              const scoreStr = event.content || getTag(event, "score") || "";
              const score = parseFloat(scoreStr);
              if (!isNaN(score)) scores.set(targetPk, score);
            } catch {}
          },
          error: () => { clearTimeout(timer); resolve(); },
          complete: () => { clearTimeout(timer); resolve(); },
        });
      });
    }
  } catch {}

  return scores;
}

export { eventStore, pool };
