import { useEffect, useRef } from "react";
import { ensureBrainstormTrustAnchor } from "@/services/nostr";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { isNip85Activated } from "@/lib/nip85Activation";
import { useSelfHistory } from "@/hooks/useSelf";
import { identityHas } from "@/accounts/display";
import { useHasSession } from "@/hooks/useHasSession";

/**
 * New (in-app-created) accounts select Brainstorm as their Web-of-Trust provider
 * automatically — signing up here IS the consent. The kind-10040 declaration can
 * only be published once the backend assigns a `ta_pubkey` (after their first
 * score), and because these users never see the dashboard "Select Brainstorm"
 * card, a failed/interrupted publish must self-heal: on each app load, once a
 * ta_pubkey exists and the declaration isn't confirmed yet, (re)publish it.
 * `ensureBrainstormTrustAnchor` is idempotent (flag + relay check), so this is a
 * no-op once done.
 *
 * Existing / login-with-key accounts are intentionally excluded — they select
 * Brainstorm explicitly (with a replace-warning), so we never overwrite a
 * provider choice they didn't make here.
 *
 * Renders nothing; mount once at the app root.
 */
export function AutoActivateBrainstorm() {
  const user = useActiveAccountDisplay();
  const pk = useHasSession() ? user?.pubkey : undefined;
  // Wait for /user/history to settle so we don't act before ta_pubkey is known.
  const history = useSelfHistory(pk);
  // The pubkey it fired for, not a boolean. These live at the App root and no
  // longer remount when the Account changes, so a boolean meant firing once per
  // *tab* — a second account added in the same session never got its turn.
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (firedFor.current === pk || !pk || !history.isSuccess) return;

    const createdInApp = identityHas(pk, "createdInApp");
    if (!createdInApp || isNip85Activated(pk)) return; // existing user, or already activated

    const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
    if (!taPubkey) return; // not scored yet — nothing to anchor

    firedFor.current = pk;
    void ensureBrainstormTrustAnchor(pk, taPubkey);
  }, [pk, history.isSuccess, history.data]);

  return null;
}
