/**
 * When a GitHub account and a Nostr profile are one person. Only on proof,
 * never on a name alike — four of a search's people can be called "Sam":
 *
 * - the GitHub profile names the npub (a social link, the website, the bio):
 *   only the account's owner can edit it;
 * - the GitHub website is the domain the profile's verified NIP-05 handle
 *   stands on: the domain answers for both;
 * - the profile claims the account (NIP-39 `i` tag) and the gist it names is
 *   the account's own and carries the npub;
 * - the verified handle is the root of the domain named for the account
 *   (lib/ownedAccount).
 *
 * The facts come from GitHub through our origin (services/github) and from
 * the profiles' claims (services/itemEngagement); this decides.
 */
import { nip19 } from "nostr-tools";
import { accountOwnedBy } from "@/lib/ownedAccount";

/** What GitHub and the claims say about an account's owner. */
export interface GitHubEvidence {
  /** GitHub answered for the account: without it, nothing below is known, not absent. */
  checked: boolean;
  /** Pubkeys the GitHub profile names (npubs in its links, website or bio). */
  named: readonly string[];
  /** The GitHub profile's website, as a host ("riverdev.com"), or null. */
  blogHost: string | null;
  /** Profiles that claim the account with a gist that proves it. */
  provenClaimants: readonly string[];
}

const NPUB = /\b(npub1[02-9ac-hj-np-z]{58})\b/g;

/** The pubkeys the texts name as npubs, each once, in the order met. */
export function pubkeysNamedIn(texts: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const [, npub] of (text ?? "").matchAll(NPUB)) {
      try {
        const { type, data } = nip19.decode(npub);
        if (type === "npub" && !out.includes(data)) out.push(data);
      } catch {
        /* not a key */
      }
    }
  }
  return out;
}

/** A claim's gist proves it when it's the account's own and carries the claimer's npub. */
export function gistProves(gist: { owner: string | null; text: string }, handle: string, pubkey: string): boolean {
  return (
    gist.owner?.toLowerCase() === handle.toLowerCase() && pubkeysNamedIn([gist.text]).includes(pubkey.toLowerCase())
  );
}

/**
 * Whether the person owns the account, on the evidence. `verified`: their
 * NIP-05 handle is confirmed by its domain — the two proofs that rest on a
 * domain need it.
 */
export function ownsGitHub(
  evidence: GitHubEvidence,
  handle: string,
  person: { pubkey: string; nip05?: string },
  verified: boolean,
): boolean {
  if (evidence.named.includes(person.pubkey) || evidence.provenClaimants.includes(person.pubkey)) return true;
  if (!verified) return false;
  const domain = person.nip05?.trim().toLowerCase().split("@")[1];
  if (domain && evidence.blogHost && evidence.blogHost.toLowerCase() === domain) return true;
  return accountOwnedBy(person.nip05, [handle]) !== null;
}
