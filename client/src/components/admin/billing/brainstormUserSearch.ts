/**
 * Find a Brainstorm user to attribute a signup to.
 *
 * Two facts shape this. The users table knows pubkeys, not names — the server's
 * `/admin/users?search=` matches hex or npub only — while names live on relays
 * and are what an admin actually has in hand when someone says "that payment
 * was me". And attribution grants a scheduling policy, which only an existing
 * account can hold: the server answers `unknown_user` for a stranger.
 *
 * So a key is checked against the users table directly, and a name goes
 * through Brainstorm's own profile search first and then every candidate is
 * checked against the users table, so only account holders are ever offered.
 * The candidates that fell out are counted, not hidden — "1 more on Nostr
 * without a Brainstorm account" tells the admin why the person they expected
 * is not in the list.
 */
import { apiClient } from "@/services/api";
import { searchByText } from "@/lib/profileSearch";
import { fetchProfileMap } from "@/services/nostr";
import { decodeShareId } from "@/lib/shareId";

export type BrainstormUser = { pubkey: string; name?: string; picture?: string };

export type UserSearchOutcome =
  | { kind: "idle" }
  /** Reads like a key but is not one: don't search names for it, say so. */
  | { kind: "invalid-key" }
  /** A real key that no Brainstorm account has. */
  | { kind: "no-account"; pubkey: string }
  /** `exact` when the query was a key, so the one result can select itself. */
  | { kind: "results"; users: BrainstormUser[]; withoutAccount: number; exact: boolean };

const HEX_KEY = /^[0-9a-f]{64}$/i;

/** npub/nprofile/hex-looking input is a key attempt, however malformed. */
export function looksLikeKey(q: string): boolean {
  const t = q.trim();
  return /^(npub1|nprofile1)/i.test(t) || /^[0-9a-f]{8,}$/i.test(t);
}

const MAX_CANDIDATES = 8;

async function hasAccount(pubkey: string): Promise<boolean> {
  const page = (await apiClient.getAdminUsers({ search: pubkey, size: 1 })) as
    | { items?: Array<{ pubkey?: string }> }
    | undefined;
  return (page?.items ?? []).some((i) => i.pubkey?.toLowerCase() === pubkey);
}

export async function searchBrainstormUsers(query: string): Promise<UserSearchOutcome> {
  const q = query.trim();
  if (!q) return { kind: "idle" };

  const key = decodeShareId(q)?.pubkey?.toLowerCase() ?? null;
  if (key && HEX_KEY.test(key)) {
    if (!(await hasAccount(key))) return { kind: "no-account", pubkey: key };
    // Best-effort name and picture, so the confirm line names a person.
    const profile = await fetchProfileMap([key])
      .then((m) => m.get(key))
      .catch(() => undefined);
    return {
      kind: "results",
      users: [{ pubkey: key, name: profile?.display_name || profile?.name, picture: profile?.picture }],
      withoutAccount: 0,
      exact: true,
    };
  }
  if (looksLikeKey(q)) return { kind: "invalid-key" };
  if (q.length < 2) return { kind: "idle" };

  const { results } = await searchByText(q, "nosfabrica", undefined, MAX_CANDIDATES);
  const seen = new Set<string>();
  const candidates: BrainstormUser[] = [];
  for (const r of results) {
    const pk = r.pubkey?.toLowerCase();
    if (!pk || !HEX_KEY.test(pk) || seen.has(pk)) continue;
    seen.add(pk);
    candidates.push({ pubkey: pk, name: r.displayName || r.name, picture: r.picture });
  }
  const accounts = await Promise.all(candidates.map((c) => hasAccount(c.pubkey)));
  const users = candidates.filter((_, i) => accounts[i]);
  return { kind: "results", users, withoutAccount: candidates.length - users.length, exact: false };
}
