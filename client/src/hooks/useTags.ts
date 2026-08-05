import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchProfileTags,
  applyTagToProfile,
  predictedTagKey,
  type ApplyTagArgs,
  type ProfileTag,
  type ProfileTagsResult,
} from "@/services/tags";
import { getCurrentUser } from "@/services/nostr";

/**
 * React Query bindings for decentralized tagging. Thin on purpose — the relay
 * work, trust resolution and classification all live in `services/tags.ts`.
 *
 * Query keys follow the existing profile convention (`["share-prefs", pubkey]`).
 */

export const profileTagsKey = (pubkey: string, viewerPubkey?: string) =>
  ["profile-tags", pubkey, viewerPubkey ?? "anon"] as const;

/**
 * Every tag applied to one pubkey.
 *
 * Anon-safe by construction: this reads relays directly and never touches the
 * API client, so a logged-out visitor on `/p/:id` gets the same chips. The
 * viewer is part of the key because their own stances ride along in the result
 * and must not leak between accounts via a shared cache entry.
 */
export function useProfileTags(pubkey: string | undefined) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<ProfileTagsResult>({
    queryKey: profileTagsKey(pubkey ?? "", viewerPubkey),
    queryFn: () => fetchProfileTags(pubkey!, viewerPubkey),
    enabled: !!pubkey,
    // Tags move slowly and every miss costs a relay round-trip on a page that
    // already opens ~25 queries.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/**
 * Apply a tag, showing it immediately.
 *
 * The optimistic chip is keyed exactly as the refetched one will be
 * (`<tagAuthor>|<slug>`), so when the real data lands it replaces the placeholder
 * instead of appearing beside it. On failure we roll back to the exact snapshot
 * rather than refetching — a relay that just rejected a write is unlikely to
 * answer a read any better, and the user should see their old state restored,
 * not a spinner.
 */
export function useApplyTag(targetPubkey: string | undefined) {
  const queryClient = useQueryClient();
  const viewerPubkey = getCurrentUser()?.pubkey;
  const key = profileTagsKey(targetPubkey ?? "", viewerPubkey);

  return useMutation({
    mutationFn: (args: Omit<ApplyTagArgs, "targetPubkey">) =>
      applyTagToProfile({ ...args, targetPubkey: targetPubkey! }),

    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProfileTagsResult>(key);
      if (!viewerPubkey) return { previous };

      // Narrow inline: which arm of the union we're on decides both the key and
      // the display name, and a boolean flag wouldn't carry the narrowing.
      const minted = "name" in args.tag ? args.tag : null;
      const existingRef = minted ? null : (args.tag as { authorPubkey: string; slug: string });
      const optimisticKey = minted
        ? predictedTagKey(minted.name, viewerPubkey)
        : `${existingRef!.authorPubkey}|${existingRef!.slug}`;
      const stance = (args.polarity ?? 1) === 1 ? "apply" : "dispute";

      queryClient.setQueryData<ProfileTagsResult>(key, (old) => {
        const base: ProfileTagsResult = old ?? { tags: [], mine: [] };
        const existing = base.tags.find((t) => t.key === optimisticKey);

        // Re-stating a tag that's already shown: mark our stance, don't
        // double-count — we may already be among its counted asserters.
        const tags: ProfileTag[] = existing
          ? base.tags.map((t) => (t.key === optimisticKey ? { ...t, myStance: stance } : t))
          : [
              ...base.tags,
              {
                key: optimisticKey,
                authorPubkey: minted ? viewerPubkey : existingRef!.authorPubkey,
                slug: optimisticKey.split("|")[1],
                name: minted ? minted.name : existingRef!.slug,
                applications: stance === "apply" ? 1 : 0,
                disputes: stance === "dispute" ? 1 : 0,
                myStance: stance,
              },
            ];

        return {
          tags,
          mine: [
            ...base.mine.filter((m) => m.key !== optimisticKey),
            { key: optimisticKey, stance },
          ],
        };
      });

      return { previous };
    },

    onError: (_err, _args, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
    },

    // Relays need a moment to serve back what we just published; refetching
    // instantly tends to return the pre-publish state and clobber the
    // optimistic chip. Settle first, then reconcile.
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: key });
      }, 2500);
    },
  });
}
