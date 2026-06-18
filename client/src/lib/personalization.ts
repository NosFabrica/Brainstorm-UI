import { EMPTY_PERSONALIZATION, type PersonalizationPrefs } from "@/config/personalization";

/**
 * Local (per-account) persistence for the Personalization preview. Pure
 * localStorage — no network. The shape mirrors a future
 * `apiClient.getPersonalization`/`setPersonalization` so the dev team can swap in
 * a backend endpoint without changing the UI.
 */

const personalizationKey = (pubkey: string) => `brainstorm_personalization:${pubkey}`;

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
