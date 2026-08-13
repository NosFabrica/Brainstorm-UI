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

/**
 * key → label, for reading back roles people saved before tags replaced them.
 * The vocabulary itself lives on as the tag picker's suggestions.
 */
export const ROLE_LABELS: ReadonlyMap<string, string> = new Map(
  ROLES.map((r) => [r.key, r.label]),
);

export interface PersonalizationPrefs {
  contentTypes: string[];
  roles: string[];
}

export const EMPTY_PERSONALIZATION: PersonalizationPrefs = { contentTypes: [], roles: [] };

// ---------------------------------------------------------------------------
// Public-profile personalization (user-owned, published to Nostr as NIP-78).
// Opt-OUT model: everything shows by default; `hidden` lists what to hide.
// ---------------------------------------------------------------------------

/** Toggleable content sections, in their default display order. */
export const SECTION_KEYS = [
  "featured", "live", "events", "articles", "audio", "videos", "photos", "notes",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Toggleable optional hero elements (core identity — name/avatar/npub/WoT/stats
 *  — is always shown and intentionally not listed here). */
export const HERO_KEYS = ["bio", "topics", "followedBy", "tenure", "identities", "status"] as const;
export type HeroKey = (typeof HERO_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  featured: "Featured",
  live: "Live streams",
  events: "Events",
  articles: "Articles",
  audio: "Audio",
  videos: "Videos",
  photos: "Photos",
  notes: "Notes",
};

export const HERO_LABELS: Record<HeroKey, string> = {
  bio: "Bio",
  topics: "Posts about",
  followedBy: "Followed by",
  tenure: "Since · relays",
  identities: "Linked accounts",
  status: "Status",
};

/**
 * A user's public-profile preferences — what to hide, the section order, the
 * hand-picked "Followed by" people, and the roles they play. Published to Nostr
 * (kind 30078) so the user owns it and it's portable.
 */
export interface ProfilePrefs {
  v: 1;
  /** Keys (SectionKey | HeroKey) the owner has hidden. */
  hidden: string[];
  /** Section keys in display order; keys missing here fall back to default order. */
  order: string[];
  /** Hand-picked follower pubkeys for the "Followed by" row; empty → auto top-trusted. */
  pinnedFollowers: string[];
  /** "What you do" role keys (see ROLES). */
  roles: string[];
}

export const EMPTY_PROFILE_PREFS: ProfilePrefs = { v: 1, hidden: [], order: [], pinnedFollowers: [], roles: [] };
