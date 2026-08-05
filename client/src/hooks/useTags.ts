import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchProfileTags,
  fetchTagDetail,
  fetchTagIndex,
  applyTagToProfile,
  predictedTagKey,
  type ApplyTagArgs,
  type ProfileTag,
  type ProfileTagsResult,
  type TagDetail,
  type TagSummary,
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

export const tagIndexKey = ["tag-index"] as const;

/**
 * The whole tag catalogue, most-used first. Backs the `/tags` browse page and
 * the tag matches in search.
 *
 * Cached hard on purpose: it pages through the entire assertion history, so it
 * is the most expensive read here by far — and the answer barely moves. Search
 * filters this in memory rather than hitting relays per keystroke.
 */
export function useTagIndex(enabled = true) {
  return useQuery<TagSummary[]>({
    queryKey: tagIndexKey,
    queryFn: () => fetchTagIndex(),
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

export const tagDetailKey = (authorPubkey: string, slug: string) =>
  ["tag-detail", authorPubkey, slug] as const;

/**
 * Everyone carrying one tag — the read behind `/tags/:author/:slug`.
 *
 * Anon-safe for the same reason as `useProfileTags`: relays only. The viewer
 * isn't in the key because this view has no per-viewer component; what it shows
 * is the same for everyone under the configured POV.
 */
export function useTagDetail(authorPubkey: string | undefined, slug: string | undefined) {
  return useQuery<TagDetail>({
    queryKey: tagDetailKey(authorPubkey ?? "", slug ?? ""),
    queryFn: () => fetchTagDetail(authorPubkey!, slug!),
    enabled: !!authorPubkey && !!slug,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

export interface ApplyTagVariables extends Omit<ApplyTagArgs, "targetPubkey"> {
  /**
   * The label the user actually clicked, for the optimistic chip only.
   *
   * Without it, reusing an existing tag renders its slug ("author") for the
   * couple of seconds before the refetch resolves the real display name
   * ("Author") — a visible case-flip on the chip the user just added.
   */
  displayName?: string;
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
    mutationFn: ({ displayName: _ignored, ...args }: ApplyTagVariables) =>
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

        // Move OUR one vote between the buckets. The counts are distinct
        // asserters and we are exactly one of them, so a stance flip is -1 here
        // and +1 there — not a fresh +1, which would double-count us.
        //
        // (If the POV doesn't actually count this viewer, the refetch will
        // correct the number a couple of seconds later. With the trust filter
        // as permissive as it currently is, that's rare.)
        const tags: ProfileTag[] = existing
          ? base.tags.map((t) => {
              if (t.key !== optimisticKey) return t;
              if (t.myStance === stance) return t; // re-stating the same thing
              const wasApply = t.myStance === "apply";
              const wasDispute = t.myStance === "dispute";
              return {
                ...t,
                applications: Math.max(
                  0,
                  t.applications + (stance === "apply" ? 1 : wasApply ? -1 : 0),
                ),
                disputes: Math.max(
                  0,
                  t.disputes + (stance === "dispute" ? 1 : wasDispute ? -1 : 0),
                ),
                myStance: stance,
              };
            })
          : [
              ...base.tags,
              {
                key: optimisticKey,
                authorPubkey: minted ? viewerPubkey : existingRef!.authorPubkey,
                slug: optimisticKey.split("|")[1],
                name: args.displayName || (minted ? minted.name : existingRef!.slug),
                applications: stance === "apply" ? 1 : 0,
                disputes: stance === "dispute" ? 1 : 0,
                // One identity until the refetch says otherwise; a merge can
                // only be discovered by reading what's actually on the relays.
                variants: 1,
                myStance: stance,
              },
            ];

        return {
          // Mirror the read's own rule (`fetchProfileTags` drops tags with no
          // applications). Disagreeing with a tag only you had vouched for makes
          // the chip go away now and stay away, instead of lingering at zero
          // until the refetch removes it.
          tags: tags.filter((t) => t.applications > 0),
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
