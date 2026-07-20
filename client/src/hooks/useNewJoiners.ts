import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hasSessionToken } from "@/services/api";
import { getCurrentUser, triggerScoringAndAnchor } from "@/services/nostr";
import { followPubkeys } from "@/services/socialActions";
import { useSelfHistory } from "@/hooks/useSelf";
import { fetchNewJoiners, acknowledgeJoiners, type NewJoiner } from "@/services/inviteAcceptance";

const QUERY_KEY = "invite/new-joiners";

/**
 * Powers the home "welcome them back" card. Gated like AutoScoreReturning: only
 * for an established/scored sender (has a trust anchor), never for brand-new
 * in-app accounts still finishing their own onboarding. `welcomeBack` follows the
 * newcomer(s) in a single kind-3 and then refreshes the SENDER's scores — the same
 * follow→recalc path the onboarding flows use.
 */
/** Stable placeholder pubkey so the QA demo renders even without a live session. */
const DEMO_PUBKEY = "d0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff";

export function useNewJoiners() {
  const user = getCurrentUser();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const demo = (() => {
    try {
      return localStorage.getItem("brainstorm_invite_demo") === "true";
    } catch {
      return false;
    }
  })();
  // Demo mode (QA-only, guarded by a localStorage key never set in prod) falls back
  // to a placeholder pubkey so the card renders in the auth-gated preview.
  const pk = hasSessionToken() ? user?.pubkey : demo ? DEMO_PUBKEY : undefined;
  const history = useSelfHistory(hasSessionToken() ? pk : undefined);

  const scored = !!(history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
  let createdInApp = false;
  try {
    if (pk) createdInApp = localStorage.getItem(`brainstorm_created_inapp:${pk}`) === "true";
  } catch {
    /* ignore */
  }
  const enabled = !!pk && (demo || (history.isSuccess && scored && !createdInApp));

  const query = useQuery({
    queryKey: [QUERY_KEY, pk],
    queryFn: () => fetchNewJoiners(pk!),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const joiners: NewJoiner[] = query.data ?? [];

  const settle = useCallback(
    (pks: string[]) => {
      if (pk) acknowledgeJoiners(pk, pks);
      qc.setQueryData<NewJoiner[]>([QUERY_KEY, pk], (prev) => (prev ?? []).filter((j) => !pks.includes(j.pubkey)));
    },
    [pk, qc],
  );

  const welcomeBack = useCallback(
    async (pks: string[]) => {
      if (!pk || !pks.length) return;
      setBusy(true);
      try {
        await followPubkeys(pks);
        settle(pks);
        if (!demo) void triggerScoringAndAnchor(pk); // refresh the sender's Web of Trust
      } finally {
        setBusy(false);
      }
    },
    [pk, settle, demo],
  );

  const dismiss = useCallback((pks: string[]) => settle(pks), [settle]);

  // `established` gates invite-related surfaces (e.g. the empty-state "invite
  // friends" CTA) to senders past their own onboarding — same signal as `enabled`.
  return { joiners, welcomeBack, dismiss, busy, established: enabled };
}
