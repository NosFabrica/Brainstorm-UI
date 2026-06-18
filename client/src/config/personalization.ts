/**
 * Personalization options for the Trust & search settings card. Users pick the
 * content types they want to surface and the roles they play. Stored locally for
 * now (see `@/lib/personalization`); structured so the dev team can later wire it
 * to a backend endpoint, a NIP-51 list, and category-filtered search.
 *
 * NOTE: the `kind` values are indicative — the dev team finalizes the exact Nostr
 * kind mapping when the public pages / search filtering land.
 */

export interface ContentType {
  key: string;
  label: string;
  kind: number;
}

export const CONTENT_TYPES: ContentType[] = [
  { key: "notes", label: "Notes", kind: 1 },
  { key: "articles", label: "Articles", kind: 30023 },
  { key: "photos", label: "Photos", kind: 20 },
  { key: "videos", label: "Videos", kind: 21 },
  { key: "music", label: "Music", kind: 31337 },
  { key: "live", label: "Live streams", kind: 30311 },
];

export interface Role {
  key: string;
  label: string;
}

export const ROLES: Role[] = [
  { key: "vendor", label: "Vendor" },
  { key: "musician", label: "Musician" },
  { key: "developer", label: "Developer" },
  { key: "author", label: "Author" },
  { key: "journalist", label: "Journalist" },
  { key: "podcaster", label: "Podcaster" },
  { key: "doctor", label: "Doctor" },
  { key: "artist", label: "Artist" },
  { key: "educator", label: "Educator" },
  { key: "founder", label: "Founder" },
  { key: "creator", label: "Creator" },
  { key: "photographer", label: "Photographer" },
];

export interface PersonalizationPrefs {
  contentTypes: string[];
  roles: string[];
}

export const EMPTY_PERSONALIZATION: PersonalizationPrefs = { contentTypes: [], roles: [] };
