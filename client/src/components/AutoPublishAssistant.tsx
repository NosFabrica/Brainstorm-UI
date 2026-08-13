import { useEffect, useRef } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { getCurrentAssistantPubkey } from "@/lib/assistantStorage";
import { ensureAssistantPublished } from "@/lib/assistantPublish";
import { useSelfHistory } from "@/hooks/useSelf";
import { identityHas } from "@/accounts/display";
import { useHasSession } from "@/hooks/useHasSession";

/**
 * New (in-app-created) accounts get their Brainstorm Assistant published
 * automatically — the "magic finish" that makes their trust scores actually
 * speak to Nostr apps. The bot speaks *scores*, so we wait until the user has a
 * score (`ta_pubkey` exists, same trigger as the TA). Because these users never
 * see the "Publish your assistant" card, a failed/interrupted publish must
 * self-heal: on each app load, if no assistant pubkey is stored yet, try again.
 * Idempotent (`ensureAssistantPublished` no-ops once one exists) and silent —
 * crucially `follow: false`, so we never silently add the bot to their kind-3.
 *
 * Existing / login-with-key accounts are intentionally excluded — they publish
 * the assistant explicitly from the dashboard / Settings (which DOES follow it).
 *
 * Renders nothing; mount once at the app root.
 */
export function AutoPublishAssistant() {
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
    if (!createdInApp) return; // existing user — manual publish only
    if (getCurrentAssistantPubkey()) return; // already published

    const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;
    if (!taPubkey) return; // not scored yet — nothing for the bot to speak

    firedFor.current = pk;
    void ensureAssistantPublished({ follow: false, background: true }).catch(() => { /* retries next load */ });
  }, [pk, history.isSuccess, history.data]);

  return null;
}
