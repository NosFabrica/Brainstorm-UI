import { nip19 } from "nostr-tools";
import { getCurrentUser } from "@/services/nostr";

export interface PublishedAssistantState {
  pubkey: string;
  npub: string;
  eventId: string;
  publishedAt: number;
}

export interface AssistantProfile {
  name?: string;
  display_name?: string;
  about?: string;
  website?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
}

const KEY_PREFIX = "brainstorm_assistant";
const SUFFIX_PUBKEY = "pubkey";
const SUFFIX_EVENT_ID = "event_id";
const SUFFIX_PUBLISHED_AT = "published_at";
const SUFFIX_FIRST_DONE = "first_publish_done";
const SUFFIX_PROFILE = "profile";
const SUFFIX_DISMISSED = "dismissed";
const SUFFIX_PICTURE_SET = "picture_set";

const LEGACY_KEYS = [
  "brainstorm_assistant_pubkey",
  "brainstorm_assistant_event_id",
  "brainstorm_assistant_published_at",
  "brainstorm_assistant_first_publish_done",
  "brainstorm_assistant_profile",
  "brainstorm_assistant_dismissed",
];
const LEGACY_PICTURE_SET_PREFIX = "brainstorm_assistant_picture_set:";

export const ASSISTANT_UPDATED_EVENT = "brainstorm-assistant-updated";
export const USER_CHANGED_EVENT = "brainstorm-user-changed";

function ownerHex(): string | null {
  try {
    const u = getCurrentUser();
    return u?.pubkey ? u.pubkey.toLowerCase() : null;
  } catch {
    return null;
  }
}

function key(suffix: string, owner?: string | null): string | null {
  const o = owner ?? ownerHex();
  if (!o) return null;
  return `${KEY_PREFIX}:${o}:${suffix}`;
}

function safeGet(k: string | null): string | null {
  if (!k) return null;
  try { return localStorage.getItem(k); } catch { return null; }
}

function safeSet(k: string | null, v: string): void {
  if (!k) return;
  try { localStorage.setItem(k, v); } catch {}
}

function safeRemove(k: string | null): void {
  if (!k) return;
  try { localStorage.removeItem(k); } catch {}
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(ASSISTANT_UPDATED_EVENT));
  } catch {}
}

export function readPublishedAssistant(): PublishedAssistantState | null {
  const pubkey = safeGet(key(SUFFIX_PUBKEY));
  const eventId = safeGet(key(SUFFIX_EVENT_ID));
  const publishedAtStr = safeGet(key(SUFFIX_PUBLISHED_AT));
  if (!pubkey || !eventId || !publishedAtStr) return null;
  let npub = pubkey;
  try { npub = nip19.npubEncode(pubkey); } catch {}
  return {
    pubkey,
    npub,
    eventId,
    publishedAt: Number(publishedAtStr) || Date.now(),
  };
}

export function writePublishedAssistant(s: PublishedAssistantState): void {
  safeSet(key(SUFFIX_PUBKEY), s.pubkey);
  safeSet(key(SUFFIX_EVENT_ID), s.eventId);
  safeSet(key(SUFFIX_PUBLISHED_AT), String(s.publishedAt));
  notify();
}

export function readAssistantProfile(): AssistantProfile | null {
  const raw = safeGet(key(SUFFIX_PROFILE));
  if (!raw) return null;
  try { return JSON.parse(raw) as AssistantProfile; } catch { return null; }
}

export function writeAssistantProfile(p: AssistantProfile): void {
  const k = key(SUFFIX_PROFILE);
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(p));
    notify();
  } catch {}
}

export function readAssistantDismissed(): boolean {
  return safeGet(key(SUFFIX_DISMISSED)) === "true";
}

export function setAssistantDismissed(v: boolean): void {
  const k = key(SUFFIX_DISMISSED);
  if (!k) return;
  if (v) safeSet(k, "true");
  else safeRemove(k);
  notify();
}

export function readFirstPublishDone(): boolean {
  return !!safeGet(key(SUFFIX_FIRST_DONE));
}

export function setFirstPublishDone(): void {
  safeSet(key(SUFFIX_FIRST_DONE), String(Date.now()));
}

export function readPictureSet(assistantPubkey: string): boolean {
  if (!assistantPubkey) return false;
  return safeGet(key(`${SUFFIX_PICTURE_SET}:${assistantPubkey}`)) === "1";
}

export function setPictureSet(assistantPubkey: string): void {
  if (!assistantPubkey) return;
  safeSet(key(`${SUFFIX_PICTURE_SET}:${assistantPubkey}`), "1");
}

export function getCurrentAssistantPubkey(): string | null {
  return safeGet(key(SUFFIX_PUBKEY));
}

export function clearAssistantDataForOwner(ownerHexPubkey: string): void {
  if (!ownerHexPubkey) return;
  const owner = ownerHexPubkey.toLowerCase();
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${KEY_PREFIX}:${owner}:`)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {}
}

let legacyCleanupDone = false;
export function cleanupLegacyAssistantKeys(): void {
  if (legacyCleanupDone) return;
  legacyCleanupDone = true;
  try {
    for (const k of LEGACY_KEYS) {
      try { localStorage.removeItem(k); } catch {}
    }
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PICTURE_SET_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch {}
    }
  } catch {}
}
