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
  fetchOutboxRelayList,
  fetchTrustProviderList,
  getNip85RelayUrl,
  isUsingBrainstorm,
  publishToRelays,
  signNip85,
} from "./nostr";
import { activeAccount, canSignSilently } from "@/accounts/signing";
import { isUnlockCancelled } from "@/accounts/local-signer";
import { identityHas } from "@/accounts/display";
import { accountKey } from "@/lib/accountStorage";
import { queryClient } from "@/lib/queryClient";
import { clearNip85Activated, isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { hasDeclinedNip85, hasNip85Consent, recordNip85Consent } from "@/lib/nip85Consent";

/**
 * Whether the automatic (non-user-initiated) NIP-85 publish paths may run for
 * this account. An explicit yes on the consent card enables them for every
 * account type; an explicit no disables them even for in-app-created accounts,
 * whose signup used to be their only consent. Accounts that were never asked
 * (legacy sessions) keep the old createdInApp-implies-consent behavior.
 */
export function shouldAutoPublishNip85(pubkey: string): boolean {
  if (hasNip85Consent(pubkey)) return true;
  return identityHas(pubkey, "createdInApp") && !hasDeclinedNip85(pubkey);
}

/**
 * Kick off WoT scoring and, when the account consented, the background
 * trust-anchor publish. Called once the user has actually followed ≥1 account
 * (the "calculate my scores" CTA) — NOT at account creation, since a follow-less
 * account can't be scored.
 *
 * Computing scores (`triggerGrapeRank`) publishes nothing under the user's key,
 * so it always runs. Publishing the NIP-85 provider declaration (kind 10040) is
 * a public act under their key, so it's gated on consent — captured by the
 * consent card next to the calculate CTA (`opts.nip85Consent`), or implied by
 * having signed up in-app for accounts that were never shown the card.
 *
 * The poll here is only the fallback for when the caller couldn't publish
 * immediately (ta_pubkey not fetched yet); the calculate surfaces try
 * `publishBrainstormTrustAnchor` first, while the user is present to sign.
 */
export async function triggerScoringAndAnchor(
  pubkey: string,
  opts?: { nip85Consent?: boolean },
): Promise<void> {
  if (opts?.nip85Consent !== undefined) recordNip85Consent(pubkey, opts.nip85Consent);
  // Mark the start so the global status chip can show "Calculating…" immediately,
  // before the backend's graperankResult reflects an in-progress record.
  try { localStorage.setItem(accountKey("brainstorm_calc_triggered_at", pubkey), String(Date.now())); } catch {}
  try { await apiClient.triggerGrapeRank(); } catch {}
  if (shouldAutoPublishNip85(pubkey)) void pollAndPublishTrustAnchor(pubkey);
}

/**
 * What a kind-10040 on the user's outbox relays currently says, for the consent
 * card's pre-check. "brainstorm" means their declaration already names THEIR
 * assistant — nothing to ask; "other" means what's there would be replaced, so
 * the card must warn and default to off; "none"/"unknown" mean go ahead and
 * ask. Best-effort: relay silence reads as "none", a thrown setup problem as
 * "unknown" — neither ever blocks the calculate CTA.
 *
 * The bar for "brainstorm" is exact: the rank pubkey must equal the user's own
 * Brainstorm assistant (`ta_pubkey`). Any 10040 is NOT enough — assistants are
 * per-user keys, so a declaration naming a Brainstorm relay but someone else's
 * (or a stale) assistant would leave the rest of the flow reading scores that
 * aren't theirs. When `ta_pubkey` isn't known yet we therefore classify an
 * existing declaration as "other"; the card re-checks once /user/history
 * delivers the key, and the exact match settles it.
 */
export type TrustProviderStatus = "none" | "brainstorm" | "other" | "unknown";

export async function checkExistingTrustProvider(
  pubkey: string,
  taPubkey?: string | null,
): Promise<TrustProviderStatus> {
  try {
    // Warm the eventStore with their kind-10002 first, so the 10040 read (and
    // any publish after it) routes to their real outbox relays — on the
    // onboarding surfaces the dashboard's warm-up hasn't run yet.
    await fetchOutboxRelayList(pubkey);
    if (taPubkey && (await isUsingBrainstorm(pubkey, taPubkey))) {
      // Published from another device — record it so nothing re-asks.
      markNip85Activated(pubkey);
      return "brainstorm";
    }
    const event = await fetchTrustProviderList(pubkey);
    const rankTarget = event?.tags.find((t) => t[0] === "30382:rank")?.[1];
    if (!rankTarget) return "none";
    if (taPubkey && rankTarget !== taPubkey) {
      // Definitive contrary evidence: a 10040 exists and names a different
      // assistant. Unlike a relay MISS (absence, never a downgrade), presence
      // of a foreign declaration means the local "activated" flag is now a
      // lie — the on-relay 10040 takes precedence, so drop the flag and let
      // every surface reflect the truth.
      clearNip85Activated(pubkey);
      return "other";
    }
    return rankTarget === taPubkey ? "brainstorm" : "other";
  } catch {
    return "unknown";
  }
}

export type TrustAnchorPublishResult =
  | { status: "success" }
  | { status: "cancelled"; unlockDeclined: boolean }
  | { status: "error"; message: string };

/**
 * The user-initiated NIP-85 publish: sign the kind-10040 selecting Brainstorm
 * and broadcast it to the user's outbox relays. Unlike
 * `ensureBrainstormTrustAnchor` this MAY raise the unlock modal or the
 * extension/bunker prompt — the user just asked for it (consent card or the
 * dashboard modal). `onPhase` lets callers narrate signing vs publishing.
 */
export async function publishBrainstormTrustAnchor(
  pubkey: string,
  taPubkey: string,
  onPhase?: (phase: "signing" | "publishing") => void,
): Promise<TrustAnchorPublishResult> {
  let nip85Relay: string;
  try {
    nip85Relay = getNip85RelayUrl();
  } catch (err: any) {
    return { status: "error", message: err?.message || "NIP-85 relay URL is not configured." };
  }

  onPhase?.("signing");
  let signed;
  try {
    signed = await signNip85(taPubkey, nip85Relay);
  } catch (err) {
    return { status: "cancelled", unlockDeclined: isUnlockCancelled(err) };
  }

  onPhase?.("publishing");
  const result = await publishToRelays(signed);
  if (result.success) {
    markNip85Activated(pubkey);
    // The on-relay answer changed — every badge/status reading it must re-ask.
    void queryClient.invalidateQueries({ queryKey: ["trust-provider-status"] });
    return { status: "success" };
  }
  return { status: "error", message: result.error || "Failed to publish to relays. Please try again." };
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
  // What does their 10040 on relays say? "brainstorm" → recorded, done (e.g.
  // published from another device). "other" → THEIR DECLARATION WINS: this is
  // the automatic path, and it must never replace a provider the user chose —
  // `isUsingBrainstorm === false` alone can't tell "no declaration" from
  // "declared someone else", which is how a foreign 10040 could get silently
  // overwritten. Replacement happens only on the explicit surfaces (consent
  // card / modal), behind the replace warning.
  try {
    const existing = await checkExistingTrustProvider(pubkey, taPubkey);
    if (existing === "brainstorm" || existing === "other") return;
  } catch {}
  try {
    const signed = await signNip85(taPubkey, getNip85RelayUrl());
    const res = await publishToRelays(signed);
    if (res.success) {
      markNip85Activated(pubkey);
      void queryClient.invalidateQueries({ queryKey: ["trust-provider-status"] });
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
