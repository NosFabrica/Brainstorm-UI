/**
 * How a person is named in a line of text: their display name, else their
 * name (NIP-01 `name`, NIP-24 `display_name`), trimmed, a blank one skipped;
 * else whatever stands in for them where the line is shown: a short npub by
 * default, never an empty string, and never a raw hex key unless asked for.
 *
 * Every `display_name || name || …` goes through here (lint keeps new copies out).
 */
import { npubFromPubkey } from "@/lib/shareId";

/**
 * The parts of a kind-0 a name is read from. A kind-0 is anyone's JSON, so a
 * field can hold anything; only a non-blank string counts.
 */
export interface NamedProfile {
  display_name?: unknown;
  name?: unknown;
  /** NIP-24 deprecated, for `display_name`: read only with `{ legacy: true }`. */
  displayName?: unknown;
  /** NIP-24 deprecated, for `name`: read only with `{ legacy: true }`. */
  username?: unknown;
}

export interface NameOptions {
  /**
   * Also read the deprecated `displayName` and `username` (NIP-24: "should be
   * ignored"), each after the field that replaced it. Only for a reader that
   * already showed them, so an old profile keeps its name there.
   */
  legacy?: boolean;
}

/**
 * What stands in for someone without a name:
 * - `npub`: `npub1abcdefgh…wxyz`, recognisable and short (the default);
 * - `npub12`: `npub1abcdefg…`, the first 12 characters of the npub;
 * - `hex8`: `abcdef01…`, the first 8 characters of the hex key.
 */
export type KeyFallback = "npub" | "npub12" | "hex8";

const HEX_KEY = /^[0-9a-f]{64}$/;

/** `npub1abcdefgh…wxyz`: recognisable, and short enough for a line. */
export function shortNpub(pubkey: string): string {
  // An unverified event can carry anything as its author, and the encoder takes much that isn't a key.
  const key = String(pubkey ?? "");
  if (!HEX_KEY.test(key)) return `${key.slice(0, 8)}…`;
  const npub = npubFromPubkey(key);
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

/** A pubkey shortened to one of the `KeyFallback` forms; a value that isn't a key is never encoded. */
export function shortKey(pubkey: string, form: KeyFallback = "npub"): string {
  const key = String(pubkey ?? "");
  if (form === "npub") return shortNpub(key);
  if (form === "npub12" && HEX_KEY.test(key)) return `${npubFromPubkey(key).slice(0, 12)}…`;
  return `${key.slice(0, 8)}…`;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Their name from one profile, or undefined when it gives none. */
export function nameIn(profile: NamedProfile | null | undefined, options?: NameOptions): string | undefined {
  if (!profile) return undefined;
  const legacy = options?.legacy === true;
  return (
    text(profile.display_name) ||
    (legacy ? text(profile.displayName) : "") ||
    text(profile.name) ||
    (legacy ? text(profile.username) : "") ||
    undefined
  );
}

/**
 * The same rules for a person already read out of a kind-0, a search hit
 * (lib/profileSearch's SearchResult) and its like: `displayName` there holds
 * the kind-0's `display_name`.
 */
export function resultName(person: { displayName?: unknown; name?: unknown } | null | undefined): string | undefined {
  return person ? nameIn({ display_name: person.displayName, name: person.name }) : undefined;
}

/** Their name from one profile, or their key in the form the caller shows. */
export function displayNameOf(
  profile: NamedProfile | null | undefined,
  pubkey: string,
  fallback: KeyFallback = "npub",
  options?: NameOptions,
): string {
  return nameIn(profile, options) ?? shortKey(pubkey, fallback);
}

/** Their name from one profile, or their short npub. */
export function profileName(profile: NamedProfile | null | undefined, pubkey: string): string {
  return displayNameOf(profile, pubkey);
}

/** Their name from a map of profiles, or their short npub. */
export function nameOf(pubkey: string, profiles: ReadonlyMap<string, NamedProfile>): string {
  return profileName(profiles.get(pubkey), pubkey);
}
