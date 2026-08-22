import {useEffect} from "react";
import { useOncePerPubkey } from "@/hooks/useOncePerPubkey";
import { ensureBrainstormTrustAnchor, shouldAutoPublishNip85 } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { isNip85Activated } from "@/lib/nip85Activation";
import { useSelfHistory } from "@/hooks/useSelf";
import { useHasSession } from "@/hooks/useHasSession";

/**
 * The cross-session self-heal for the NIP-85 declaration of any account that
 * consented (the calculate-step consent card, or in-app signup for accounts
 * never shown it — see `shouldAutoPublishNip85`). The calculate surfaces
 * publish the kind-10040 immediately; when that publish was interrupted — a
 * locked local key that couldn't sign silently, a closed tab — this effect
 * finishes it: on each app load, once a `ta_pubkey` exists and the declaration
 * isn't confirmed yet, (re)publish it. `ensureBrainstormTrustAnchor` is
 * idempotent (flag + relay check), so this is a no-op once done.
 *
 * Accounts that declined (or were never asked and didn't sign up here) are
 * excluded — they select Brainstorm explicitly via the dashboard card (with a
 * replace-warning), so we never overwrite a provider choice they didn't make.
 *
 * Renders nothing; mount once at the app root.
 */
export function AutoActivateBrainstorm() {
  const user = useActiveAccountDisplay();
  const pk = useHasSession() ? user?.pubkey : undefined;
  // Wait for /user/history to settle so we don't act before ta_pubkey is known.
  const history = useSelfHistory(pk);
  const once = useOncePerPubkey();

  useEffect(() => {
    if (!pk || once.done(pk) || !history.isSuccess) return;

    if (!shouldAutoPublishNip85(pk) || isNip85Activated(pk)) return; // no consent, or already activated

    const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
    if (!taPubkey) return; // not scored yet — nothing to anchor

    once.mark(pk);
    void ensureBrainstormTrustAnchor(pk, taPubkey);
  }, [pk, history.isSuccess, history.data]);

  return null;
}
