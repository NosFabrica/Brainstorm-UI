import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchProfileTags,
  fetchTagDetail,
  fetchTagIndex,
  fetchPickerTags,
  fetchTagComments,
  fetchEventTags,
  fetchEventTagsBatch,
  fetchTagNotes,
  fetchMyAssertions,
  fetchPinnedTags,
  pinTag,
  unpinTag,
  publishTagComment,
  matchTags,
  applyTagToProfile,
  applyTagToEvent,
  predictedTagKey,
  type ApplyTagArgs,
  type ProfileTag,
  type ProfileTagsResult,
  type TagDetail,
  type TagSummary,
  type PickerTag,
  type TagComment,
  type NoteTagsResult,
  type TaggedNote,
  type MyAssertion,
  type PinnedTag,
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
  // The viewer is in the key because their OWN tags are never hidden from the
  // discovery gate — so two accounts can legitimately see different catalogues.
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<TagSummary[]>({
    queryKey: [...tagIndexKey, viewerPubkey ?? "anon"],
    queryFn: () => fetchTagIndex(viewerPubkey),
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

/**
 * Everything the "tag a person" picker can offer, banded by applicability:
 * tags that describe people lead, tags the split says are for notes follow.
 */
export function usePickerTags(enabled = true) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<PickerTag[]>({
    queryKey: ["tag-picker-options", viewerPubkey ?? "anon"],
    queryFn: () => fetchPickerTags(viewerPubkey),
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

/**
 * Tags matching what someone is typing, for the search dropdowns.
 *
 * The catalogue only starts loading once there are 2 characters to match, so
 * merely opening a page with a search box doesn't pay for a full relay walk.
 * After that first fetch it's cached for half an hour and every later keystroke
 * filters in memory — no relay traffic per character.
 */
export function useTagMatches(query: string, max = 3): TagSummary[] {
  const enabled = query.trim().length >= 2;
  const { data } = useTagIndex(enabled);
  return useMemo(() => (enabled ? matchTags(data ?? [], query, max) : []), [enabled, data, query, max]);
}

export const tagCommentsKey = (authorPubkey: string, slug: string) =>
  ["tag-comments", authorPubkey, slug] as const;

/** Comments on a tag. Anon-readable like everything else here. */
export function useTagComments(authorPubkey: string | undefined, slug: string | undefined) {
  return useQuery<TagComment[]>({
    queryKey: tagCommentsKey(authorPubkey ?? "", slug ?? ""),
    queryFn: () => fetchTagComments(authorPubkey!, slug!),
    enabled: !!authorPubkey && !!slug,
    staleTime: 2 * 60_000,
    retry: 1,
  });
}

/**
 * Post a comment. Optimistic, because a comment you typed vanishing for two
 * seconds while relays settle reads as a failure.
 */
export function usePostTagComment(authorPubkey: string | undefined, slug: string | undefined) {
  const queryClient = useQueryClient();
  const viewerPubkey = getCurrentUser()?.pubkey;
  const key = tagCommentsKey(authorPubkey ?? "", slug ?? "");

  return useMutation({
    mutationFn: (content: string) => publishTagComment(authorPubkey!, slug!, content),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TagComment[]>(key);
      if (viewerPubkey) {
        queryClient.setQueryData<TagComment[]>(key, [
          {
            id: `pending-${Date.now()}`,
            author: viewerPubkey,
            content: content.trim(),
            createdAt: Math.floor(Date.now() / 1000),
          },
          ...(previous ?? []),
        ]);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(key, ctx.previous);
    },
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: key }), 2500);
    },
  });
}

export const tagDetailKey = (authorPubkey: string, slug: string, viewerPubkey?: string) =>
  ["tag-detail", authorPubkey, slug, viewerPubkey ?? "anon"] as const;

/**
 * Everyone carrying one tag — the read behind `/tags/:author/:slug`.
 *
 * Anon-safe for the same reason as `useProfileTags`: relays only. The viewer
 * isn't in the key because this view has no per-viewer component; what it shows
 * is the same for everyone under the configured POV.
 */
export function useTagDetail(authorPubkey: string | undefined, slug: string | undefined) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<TagDetail>({
    queryKey: tagDetailKey(authorPubkey ?? "", slug ?? "", viewerPubkey),
    queryFn: () => fetchTagDetail(authorPubkey!, slug!, viewerPubkey),
    enabled: !!authorPubkey && !!slug,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

export const eventTagsKey = (eventId: string, viewerPubkey?: string) =>
  ["event-tags", eventId, viewerPubkey ?? "anon"] as const;

/**
 * Every tag applied to one note (rung C2).
 *
 * Anon-safe like the profile read. The viewer is part of the key because their
 * own stances ride along and must not leak between accounts via a shared entry.
 */
export function useEventTags(eventId: string | undefined) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<NoteTagsResult>({
    queryKey: eventTagsKey(eventId ?? "", viewerPubkey),
    queryFn: () => fetchEventTags(eventId!, viewerPubkey),
    enabled: !!eventId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/**
 * Tags for a whole page of notes in one relay round-trip.
 *
 * The batched form is what ACCEPTANCE C2 actually requires — "reads over a list
 * of N events issue batched queries … no per-event REQ storm" — so any surface
 * rendering more than one note must use this rather than `useEventTags` per
 * card. Returns a map keyed by event id; ids with no tags are absent.
 *
 * The key joins the ids so a page whose note list grows (load-more) refetches
 * once for the new set rather than per note.
 */
export function useEventTagsBatch(eventIds: string[]) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  const ids = useMemo(
    () => Array.from(new Set(eventIds.filter(Boolean))).sort(),
    [eventIds],
  );
  return useQuery<Map<string, NoteTagsResult>>({
    queryKey: ["event-tags-batch", ids.join(","), viewerPubkey ?? "anon"],
    queryFn: () => fetchEventTagsBatch(ids, viewerPubkey),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/**
 * Everything the viewer has claimed, about people and notes alike.
 *
 * Signed-in only — there is no "mine" without a viewer. Cached loosely: this
 * pages the viewer's whole assertion history, and the answer barely moves.
 */
export function useMyAssertions() {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<MyAssertion[]>({
    queryKey: ["my-assertions", viewerPubkey ?? "anon"],
    queryFn: () => fetchMyAssertions(viewerPubkey!),
    enabled: !!viewerPubkey,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** The viewer's pinned tags. Off unless `TAG_PINS_ENABLED` — see the config. */
export function usePinnedTags(enabled = true) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<PinnedTag[]>({
    queryKey: ["pinned-tags", viewerPubkey ?? "anon"],
    queryFn: () => fetchPinnedTags(viewerPubkey!),
    enabled: enabled && !!viewerPubkey,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Pin or unpin. Not optimistic: pinning is a publish and unpinning is a
 * deletion, and showing either as done before the relay accepted it would be
 * claiming something we don't know.
 */
export function useTogglePin() {
  const queryClient = useQueryClient();
  const viewerPubkey = getCurrentUser()?.pubkey;

  return useMutation({
    mutationFn: (args: { authorPubkey: string; slug: string; tagEventId: string } | { pinEventId: string }) =>
      "pinEventId" in args ? unpinTag(args.pinEventId) : pinTag(args),
    onSuccess: () => {
      const key = ["pinned-tags", viewerPubkey ?? "anon"];
      void queryClient.invalidateQueries({ queryKey: key });
      // Relays settle a beat after the publish resolves — and a deletion needs
      // longer to propagate than a write does.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: key }), 2500);
    },
  });
}

export const tagNotesKey = (authorPubkey: string, slug: string, viewerPubkey?: string) =>
  ["tag-notes", authorPubkey, slug, viewerPubkey ?? "anon"] as const;

/**
 * Every note carrying one tag — the other half of what Floor D wants on a tag
 * page. Most tags have none, and that's the normal case rather than an error:
 * a tag only becomes note-taggable once somebody mints its tagging header.
 */
export function useTagNotes(authorPubkey: string | undefined, slug: string | undefined) {
  const viewerPubkey = getCurrentUser()?.pubkey;
  return useQuery<TaggedNote[]>({
    queryKey: tagNotesKey(authorPubkey ?? "", slug ?? "", viewerPubkey),
    queryFn: () => fetchTagNotes(authorPubkey!, slug!, viewerPubkey),
    enabled: !!authorPubkey && !!slug,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/**
 * Apply, dispute or mint a tag on a note.
 *
 * Deliberately NOT optimistic, unlike the profile equivalent. Applying a tag to
 * a note can be three publishes (tag-element → tagging header → assertion) and
 * the SDK reports partial failure in `failedAt`; painting a chip before we know
 * the assertion landed would be claiming something we don't know. The refetch
 * below is the honest version, and the caller shows pending state meanwhile.
 */
export function useApplyEventTag(eventId: string | undefined, relayHint?: string) {
  const queryClient = useQueryClient();
  const viewerPubkey = getCurrentUser()?.pubkey;

  return useMutation({
    mutationFn: (args: {
      tag: { authorPubkey: string; slug: string } | { name: string; description?: string };
      polarity?: 1 | -1;
    }) =>
      applyTagToEvent({
        tag: args.tag,
        eventId: eventId!,
        relayHint,
        polarity: args.polarity ?? 1,
      }),
    onSuccess: () => {
      const key = eventTagsKey(eventId ?? "", viewerPubkey);
      void queryClient.invalidateQueries({ queryKey: key });
      // Relays settle a beat after the publish resolves; one delayed re-read
      // stops a just-applied tag from appearing to not have worked.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: key }), 2500);
      // The tag's own page now lists this note.
      void queryClient.invalidateQueries({ queryKey: ["tag-notes"] });
    },
  });
}

/**
 * Vote on someone carrying a tag, or add yourself to it, from the tag page.
 *
 * The tag page is where people arrive — from search, from a chip, from a shared
 * link — so making them navigate to a profile to act was the main thing
 * standing between "I see this list" and "I'm on this list". Web-of-trust only
 * does its job if people actually assert; this removes the detour.
 *
 * Optimistic on the tag-detail query rather than the profile one, since that's
 * what's on screen. The profile chips get invalidated too, because the same
 * assertion changes both views.
 */
export function useTagVote(authorPubkey: string | undefined, slug: string | undefined) {
  const queryClient = useQueryClient();
  const viewerPubkey = getCurrentUser()?.pubkey;
  const key = tagDetailKey(authorPubkey ?? "", slug ?? "", viewerPubkey);

  return useMutation({
    mutationFn: ({ targetPubkey, polarity }: { targetPubkey: string; polarity: 1 | -1 }) =>
      applyTagToProfile({
        tag: { authorPubkey: authorPubkey!, slug: slug! },
        targetPubkey,
        polarity,
      }),

    onMutate: async ({ targetPubkey, polarity }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TagDetail>(key);
      if (!viewerPubkey || !previous) return { previous };

      const stance = polarity === 1 ? ("apply" as const) : ("dispute" as const);
      const isSelf = targetPubkey === viewerPubkey;
      const existing = previous.carriers.find((c) => c.pubkey === targetPubkey);

      const carriers = existing
        ? previous.carriers.map((c) => {
            if (c.pubkey !== targetPubkey) return c;
            if (c.myStance === stance) return c;
            // Move our single vote between the buckets rather than adding a
            // fresh one — we may already be among this person's vouchers.
            const wasApply = c.myStance === "apply";
            const wasDispute = c.myStance === "dispute";
            const selfShift = isSelf
              ? { selfDeclared: stance === "apply", subjectDisagreed: stance === "dispute" }
              : {};
            return {
              ...c,
              ...selfShift,
              applications: isSelf
                ? c.applications
                : Math.max(0, c.applications + (stance === "apply" ? 1 : wasApply ? -1 : 0)),
              disputes: isSelf
                ? c.disputes
                : Math.max(0, c.disputes + (stance === "dispute" ? 1 : wasDispute ? -1 : 0)),
              asserters: isSelf
                ? c.asserters
                : stance === "apply"
                  ? Array.from(new Set([...c.asserters, viewerPubkey]))
                  : c.asserters.filter((a) => a !== viewerPubkey),
              myStance: stance,
            };
          })
        : [
            ...previous.carriers,
            {
              pubkey: targetPubkey,
              applications: isSelf || stance === "dispute" ? 0 : 1,
              disputes: 0,
              asserters: isSelf || stance === "dispute" ? [] : [viewerPubkey],
              selfDeclared: isSelf && stance === "apply",
              subjectDisagreed: isSelf && stance === "dispute",
              myStance: stance,
              // Just now, by definition — this is the newest assertion there is.
              addedAt: Math.floor(Date.now() / 1000),
            },
          ];

      queryClient.setQueryData<TagDetail>(key, {
        ...previous,
        // Mirror the read's rule so a withdrawn vote doesn't leave a ghost row.
        carriers: carriers.filter(
          (c) => c.applications - c.disputes > 0 || c.selfDeclared || !!c.myStance,
        ),
      });
      return { previous };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(key, ctx.previous);
    },

    onSuccess: (_r, { targetPubkey }) => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: key });
        queryClient.invalidateQueries({ queryKey: ["profile-tags", targetPubkey] });
        queryClient.invalidateQueries({ queryKey: tagIndexKey });
      }, 2500);
    },
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
        const base: ProfileTagsResult = old ?? { tags: [], mine: [], trustUnverified: false };
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
                // No name collision until the refetch says otherwise; another
                // author's same-named tag can only be found on the relays.
                sharesName: 1,
                // Optimistically we know only our own act. Who else vouched
                // comes back with the refetch — guessing would flash a wrong
                // label. Our own assertion counts like anyone else's, including
                // when we're tagging ourselves.
                asserters: stance === "apply" ? [viewerPubkey] : [],
                selfDeclared: viewerPubkey === targetPubkey && stance === "apply",
                subjectDisagreed: viewerPubkey === targetPubkey && stance === "dispute",
                counted: stance === "apply",
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
          trustUnverified: base.trustUnverified,
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
