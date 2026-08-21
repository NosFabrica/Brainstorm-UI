/**
 * Brainstorm as the user's Web-of-Trust provider: kicking off a score run, and
 * publishing the NIP-85 kind-10040 that declares us once the backend has assigned
 * them a trust anchor.
 *
 * Split out of `services/nostr.ts`, which was three modules in one file. This is
 * neither a relay read nor login orchestration — it is the one flow that spans
 * both, and it is what the dashboard CTA, Settings and the self-healing app-load
 * effect all call.
 */
import { apiClient } from "./api";
import {
  getNip85RelayUrl,
  isUsingBrainstorm,
  publishToRelays,
  signNip85,
} from "./nostr";
import { activeAccount, canSignSilently } from "@/accounts/signing";
import { identityHas } from "@/accounts/display";
import { accountKey } from "@/lib/accountStorage";
import { isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";

/**
 * Kick off WoT scoring and, for in-app-created accounts only, the background
 * trust-anchor publish. Called once the user has actually followed ≥1 account
 * (the "calculate my scores" CTA) — NOT at account creation, since a follow-less
 * account can't be scored.
 *
 * Computing scores (`triggerGrapeRank`) publishes nothing under the user's key
 * and just populates their `ta_pubkey`, so it always runs. Publishing the NIP-85
 * provider declaration (kind 10040) is a public act under their key, so we only
 * auto-do it for accounts created here (signing up via Brainstorm = consent).
 * Existing users select Brainstorm explicitly via the dashboard card / Settings
 * (with a replace-warning) — we never overwrite a provider choice they didn't
 * make here.
 */
export async function triggerScoringAndAnchor(pubkey: string): Promise<void> {
  // Mark the start so the global status chip can show "Calculating…" immediately,
  // before the backend's graperankResult reflects an in-progress record.
  try { localStorage.setItem(accountKey("brainstorm_calc_triggered_at", pubkey), String(Date.now())); } catch {}
  try { await apiClient.triggerGrapeRank(); } catch {}
  if (identityHas(pubkey, "createdInApp")) void pollAndPublishTrustAnchor(pubkey);
}

/**
 * Publish the user's NIP-85 declaration (kind 10040) selecting Brainstorm as
 * their rank+followers provider, unless it's already in place. Idempotent and
 * best-effort: a no-op once this account is marked activated or a Brainstorm
 * 10040 already exists on relays; never throws. Shared by the post-score poll
 * and the self-healing app-load effect (AutoActivateBrainstorm).
 */
export async function ensureBrainstormTrustAnchor(pubkey: string, taPubkey: string): Promise<void> {
  if (!pubkey || !taPubkey) return;
  if (isNip85Activated(pubkey)) return;
  // Nobody asked for this publish, so it must never raise the unlock modal. A
  // Locked Account that can't open silently is left alone; the effect re-runs on
  // every app load, and `ensureBrainstormTrustAnchor` is idempotent.
  const account = activeAccount();
  if (!account || account.pubkey !== pubkey) return;
  if (!(await canSignSilently(account))) return;
  // Already declared Brainstorm on relays (e.g. published from another device)?
  // Record it locally and stop — nothing to publish.
  try {
    if (await isUsingBrainstorm(pubkey, taPubkey)) {
      markNip85Activated(pubkey);
      return;
    }
  } catch {}
  try {
    const signed = await signNip85(taPubkey, getNip85RelayUrl());
    const res = await publishToRelays(signed);
    if (res.success) {
      markNip85Activated(pubkey);
    }
  } catch {}
}

/**
 * Background-poll for the user's trust anchor (assigned by the backend after
 * GrapeRank runs) and publish their NIP-85 declaration once it exists.
 * Best-effort: never throws, gives up after the backoff schedule. Only the
 * immediate post-score path — cross-session reliability is the app-load effect.
 */
async function pollAndPublishTrustAnchor(pubkey: string): Promise<void> {
  if (isNip85Activated(pubkey)) return;
  const delaysMs = [15000, 20000, 30000, 45000, 60000, 60000, 60000, 60000, 60000, 60000];
  for (const delay of delaysMs) {
    await new Promise((r) => setTimeout(r, delay));
    let taPubkey: string | null = null;
    try {
      const history = await apiClient.getUserHistory();
      taPubkey = history?.data?.ta_pubkey ?? null;
    } catch {
      continue;
    }
    if (!taPubkey) continue;
    await ensureBrainstormTrustAnchor(pubkey, taPubkey);
    return; // TA resolved — stop polling regardless of publish outcome.
  }
}
