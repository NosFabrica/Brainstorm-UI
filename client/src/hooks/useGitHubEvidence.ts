import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import type { GitHubEvidence } from "@/lib/githubLink";
import { githubClaimantsOf } from "@/lib/itemEngagement";
import { fetchGitHubProfileEvidence, gistProvesClaim } from "@/services/github";
import { fetchGitHubClaimantProfiles } from "@/services/itemEngagement";

/** Asked once per handle a visit, as the evidence always was. */
const ONCE = { staleTime: Infinity, retry: false } as const;

/**
 * What GitHub says about who owns each account (services/github, lib/githubLink), by lowercased
 * handle; an account not yet answered is absent. Two halves (ADR 0005): who claims the account —
 * kind-0 profiles naming it (NIP-39), a relay read through the EventStore — and what GitHub
 * answers — the profile's npubs and website, and the gist behind each claim — HTTP, so
 * react-query, asked once per handle (and per gist) a visit.
 */
export function useGitHubEvidence(handles: readonly string[]): Map<string, GitHubEvidence> {
  const handlesKey = handles.join("\n");
  const claims = useStoreEvents(
    handles.length ? `github-evidence-claimants:${handlesKey}` : null,
    // A claim is an `i` tag on someone's kind 0, matched in any case: no store filter can say
    // that, so the claimants are the ask's own profiles, held as the store keeps them.
    null,
    () => Promise.all(handles.map((handle) => fetchGitHubClaimantProfiles(handle))).then((all) => all.flat()),
    { minMs: 5 * 60_000 },
  );
  const claimants = useMemo(
    () => (claims.settled ? handles.map((handle) => githubClaimantsOf(claims.events, handle)) : undefined),
    // `handlesKey` is `handles`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claims.settled, claims.events, handlesKey],
  );
  const profiles = useQueries({
    queries: handles.map((handle) => ({
      queryKey: ["github-profile-evidence", handle.toLowerCase()],
      queryFn: () => fetchGitHubProfileEvidence(handle),
      ...ONCE,
    })),
  });
  const gists = (claimants ?? []).flatMap((list, i) =>
    list.filter((c) => c.proof).map((c) => ({ handle: handles[i], pubkey: c.pubkey, gist: c.proof! })),
  );
  const proofs = useQueries({
    queries: gists.map(({ handle, pubkey, gist }) => ({
      queryKey: ["github-gist-proof", gist, handle.toLowerCase(), pubkey],
      queryFn: () => gistProvesClaim(gist, handle, pubkey),
      ...ONCE,
    })),
  });
  const out = new Map<string, GitHubEvidence>();
  handles.forEach((handle, i) => {
    const profile = profiles[i]?.data;
    const claimed = claimants?.[i];
    if (!profile || !claimed) return;
    const mine = gists.flatMap((g, j) => (g.handle === handle ? [{ ...g, proved: proofs[j]?.data }] : []));
    if (mine.some((g) => g.proved === undefined)) return;
    out.set(handle.toLowerCase(), {
      ...profile,
      claimants: claimed.map((c) => c.pubkey),
      provenClaimants: mine.filter((g) => g.proved).map((g) => g.pubkey),
    });
  });
  return out;
}
