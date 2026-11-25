/**
 * How a person is named in a line of text: their display name, else their
 * name, else a short npub — never an empty string, and never a raw hex key.
 */
import { npubFromPubkey } from "@/lib/shareId";

/** The parts of a kind-0 a name is read from. */
export interface NamedProfile {
  display_name?: string;
  name?: string;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

/** `npub1abcdefgh…wxyz`: recognisable, and short enough for a line. */
export function shortNpub(pubkey: string): string {
  // An unverified event can carry anything as its author, and the encoder takes much that isn't a key.
  const key = String(pubkey ?? "");
  if (!HEX_KEY.test(key)) return `${key.slice(0, 8)}…`;
  const npub = npubFromPubkey(key);
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

// A kind-0 is anyone's JSON: a "name" can be a number, or blank.
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Their name from one profile, or their short npub. */
export function profileName(profile: NamedProfile | null | undefined, pubkey: string): string {
  return text(profile?.display_name) || text(profile?.name) || shortNpub(pubkey);
}

/** Their name from a map of profiles, or their short npub. */
export function nameOf(pubkey: string, profiles: ReadonlyMap<string, NamedProfile>): string {
  return profileName(profiles.get(pubkey), pubkey);
}
