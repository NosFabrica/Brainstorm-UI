import { EMPTY_PERSONALIZATION, EMPTY_PROFILE_PREFS, type PersonalizationPrefs, type ProfilePrefs } from "@/config/personalization";
import { accountKey } from "@/lib/accountStorage";

/**
 * Local (per-account) persistence for the Personalization preview. Pure
 * localStorage — no network. The shape mirrors a future
 * `apiClient.getPersonalization`/`setPersonalization` so the dev team can swap in
 * a backend endpoint without changing the UI.
 */

const personalizationKey = (pubkey: string) => accountKey("brainstorm_personalization", pubkey);

export function loadPersonalization(pubkey: string): PersonalizationPrefs {
  if (!pubkey) return { ...EMPTY_PERSONALIZATION };
  try {
    const raw = localStorage.getItem(personalizationKey(pubkey));
    if (!raw) return { ...EMPTY_PERSONALIZATION };
    const parsed = JSON.parse(raw) as Partial<PersonalizationPrefs>;
    return {
      contentTypes: Array.isArray(parsed.contentTypes) ? parsed.contentTypes : [],
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
    };
  } catch {
    return { ...EMPTY_PERSONALIZATION };
  }
}

export function savePersonalization(pubkey: string, prefs: PersonalizationPrefs): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(personalizationKey(pubkey), JSON.stringify(prefs));
  } catch {
    // storage unavailable; ignore (preview-only)
  }
}

// --- Public-profile prefs (user-owned, published to Nostr) -----------------

const arrOfStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Coerce arbitrary JSON (from a kind-30078 event or a draft) into ProfilePrefs. */
export function parseProfilePrefs(raw: unknown): ProfilePrefs {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PROFILE_PREFS };
  const p = raw as Partial<ProfilePrefs>;
  return {
    v: 1,
    hidden: arrOfStrings(p.hidden),
    order: arrOfStrings(p.order),
    pinnedFollowers: arrOfStrings(p.pinnedFollowers),
    roles: arrOfStrings(p.roles),
  };
}

// A local DRAFT cache so the inline editor stays snappy and survives a refresh
// before the user hits Save (which is what actually publishes to Nostr).
const prefsDraftKey = (pubkey: string) => accountKey("brainstorm_profile_prefs_draft", pubkey);

export function loadProfilePrefsDraft(pubkey: string): ProfilePrefs | null {
  if (!pubkey) return null;
  try {
    const raw = localStorage.getItem(prefsDraftKey(pubkey));
    return raw ? parseProfilePrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveProfilePrefsDraft(pubkey: string, prefs: ProfilePrefs): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(prefsDraftKey(pubkey), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function clearProfilePrefsDraft(pubkey: string): void {
  try {
    localStorage.removeItem(prefsDraftKey(pubkey));
  } catch {
    // ignore
  }
}
