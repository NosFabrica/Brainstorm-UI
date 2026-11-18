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
  probeTrustProviderList,
  publishToRelays,
  signNip85,
  signNip85Deactivation,
} from "./nostr";
import { activeAccount, canSignSilently } from "@/accounts/signing";
import { keyAccessMessage } from "@/accounts/backup";
import { identityHas } from "@/accounts/display";
import { accountKey } from "@/lib/accountStorage";
import { clearNip85Activated, isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { hasDeclinedNip85, hasNip85Consent, recordNip85Consent } from "@/lib/nip85Consent";
import { declaresTrustProvider, trustProviderStatusOf, type ListDesignation } from "@/lib/nip85Declaration";
import type { MapCategory } from "@/lib/treasureMapCards";
import { checkUserLists, listsToName } from "./trustLists";

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
export async function triggerScoringAndAnchor(pubkey: string, opts?: { nip85Consent?: boolean }): Promise<void> {
  if (opts?.nip85Consent !== undefined) recordNip85Consent(pubkey, opts.nip85Consent);
  // Mark the start so the global status chip can show "Calculating…" immediately,
  // before the backend's graperankResult reflects an in-progress record.
  try {
    localStorage.setItem(accountKey("brainstorm_calc_triggered_at", pubkey), String(Date.now()));
  } catch {}
  try {
    await apiClient.triggerGrapeRank();
  } catch {}
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

/** The 10040 read every status surface shares: their outbox warmed first, then the relays, newest wins. */
export async function askTrustProviderList(pubkey: string) {
  try {
    await fetchOutboxRelayList(pubkey);
  } catch {
    /* best-effort warm */
  }
  return fetchTrustProviderList(pubkey);
}

export async function checkExistingTrustProvider(
  pubkey: string,
  taPubkey?: string | null,
): Promise<TrustProviderStatus> {
  try {
    return statusOfRead(pubkey, taPubkey, await askTrustProviderList(pubkey));
  } catch {
    return "unknown";
  }
}

/** What a 10040 that was read says, with the local "activated" flag brought in line with it. */
function statusOfRead(
  pubkey: string,
  taPubkey: string | null | undefined,
  event: Awaited<ReturnType<typeof fetchTrustProviderList>>,
): "none" | "brainstorm" | "other" {
  const relay = getNip85RelayUrl();
  const status = trustProviderStatusOf(event, taPubkey, relay);
  // Published from another device — record it so nothing re-asks. Only the
  // exact declaration is recorded as fact. A foreign declaration is definitive
  // contrary evidence (unlike a relay MISS): the local flag is now a lie.
  if (event && taPubkey && declaresTrustProvider(event, taPubkey, relay)) markNip85Activated(pubkey);
  else if (status === "other" && taPubkey) clearNip85Activated(pubkey);
  return status;
}

/** Said when a publish stops because the Map it would be merged into couldn't be read. */
const MAP_UNREADABLE = "Couldn't read your current Treasure Map. Nothing was changed.";

export type TrustAnchorPublishResult =
  | { status: "success" }
  /** `message` is why signing failed; null when the user declined. */
  | { status: "cancelled"; unlockDeclined: boolean; message: string | null }
  | {
      status: "error";
      message: string;
      /** Re-send the SAME signed update — no second signature. */
      retry?: () => Promise<TrustAnchorPublishResult>;
    };

const cancelled = (err: unknown): TrustAnchorPublishResult => {
  const message = keyAccessMessage(err);
  return { status: "cancelled", unlockDeclined: message === null, message };
};

/**
 * The 10040 goes out without waiting on the slowest relay: two confirmations,
 * eight seconds a relay (lib/publishQuorum). One silent relay used to hold the
 * button for the relay library's full 30 seconds.
 */
const ANCHOR_PUBLISH = { need: 2, timeoutMs: 8000 } as const;

async function publishSignedAnchor(
  signed: Awaited<ReturnType<typeof signNip85>>,
  onSuccess: () => void,
): Promise<TrustAnchorPublishResult> {
  const result = await publishToRelays(signed, undefined, ANCHOR_PUBLISH);
  if (result.success) {
    onSuccess();
    return { status: "success" };
  }
  return {
    status: "error",
    message: result.error || "Failed to publish to relays. Please try again.",
    retry: () => publishSignedAnchor(signed, onSuccess),
  };
}

/**
 * The user-initiated NIP-85 publish: sign the kind-10040 selecting Brainstorm
 * and broadcast it to the user's outbox relays. Unlike
 * `ensureBrainstormTrustAnchor` this MAY raise the unlock modal or the
 * extension/bunker prompt — the user just asked for it (consent card or the
 * dashboard modal). `onPhase` lets callers narrate signing vs publishing.
 *
 * Saying nothing about `lists` means "name whatever they have" (`listsToName`);
 * an explicit `null` means don't. The dashboard modal said nothing and so
 * published a declaration without list rows, which cost those users a second
 * signature minutes later — the default is what makes every surface equal.
 */
export async function publishBrainstormTrustAnchor(
  pubkey: string,
  taPubkey: string,
  onPhase?: (phase: "signing" | "publishing") => void,
  /**
   * `take`: the Duty groups this publish may move away from another
   * Assistant — the Activate page's "Switch" chooses Scores. Nothing by
   * default: fill empty, never take.
   */
  opts: { lists?: ListDesignation | null; take?: readonly MapCategory[] } = {},
): Promise<TrustAnchorPublishResult> {
  let nip85Relay: string;
  try {
    nip85Relay = getNip85RelayUrl();
  } catch (err) {
    return { status: "error", message: (err as Error | undefined)?.message || "NIP-85 relay URL is not configured." };
  }

  // Merge into what's there: naming Brainstorm (and the user's Trusted Lists)
  // must never cost them another provider's rows. The new 10040 replaces the
  // whole Map, so "what's there" has to be known: the Map as the relays hold it
  // (newest wins), or their word that there is none. A read that came back
  // empty because they didn't answer is neither — "not loaded" and "declared
  // nothing" look the same, and publishing on a guess would wipe rows declared
  // elsewhere. Deactivating refuses on the same ground.
  const map = await probeTrustProviderList(pubkey).catch(() => ({ event: undefined, provenAbsent: false }));
  if (!map.event && !map.provenAbsent) return { status: "error", message: MAP_UNREADABLE };
  const existing = map.event?.tags ?? [];

  const lists = opts.lists === undefined ? await listsToName(pubkey, taPubkey) : opts.lists;

  onPhase?.("signing");
  let signed;
  try {
    signed = await signNip85(taPubkey, nip85Relay, { lists, existing, take: opts.take ?? [] });
  } catch (err) {
    return cancelled(err);
  }

  onPhase?.("publishing");
  return publishSignedAnchor(signed, () => markNip85Activated(pubkey));
}

/**
 * Stop naming Brainstorm in the user's 10040: re-sign it without the rows naming
 * their assistant, keeping every other provider's. Refuses when the current
 * 10040 can't be read: "not loaded" and "declared nothing" look the same here,
 * and publishing on a guess would wipe rows declared elsewhere.
 */
export async function deactivateBrainstormTrustAnchor(
  pubkey: string,
  taPubkey: string,
  onPhase?: (phase: "signing" | "publishing") => void,
): Promise<TrustAnchorPublishResult> {
  const { event, provenAbsent } = await probeTrustProviderList(pubkey);
  if (!event) {
    // No 10040 anywhere: nothing names Brainstorm, so only the local flag is left.
    if (provenAbsent) {
      clearNip85Activated(pubkey);
      return { status: "success" };
    }
    return {
      status: "error",
      message: "Couldn't read your current declaration from your relays. Nothing was changed.",
    };
  }

  onPhase?.("signing");
  let signed;
  try {
    signed = await signNip85Deactivation(taPubkey, event.tags);
  } catch (err) {
    return cancelled(err);
  }

  onPhase?.("publishing");
  return publishSignedAnchor(signed, () => clearNip85Activated(pubkey));
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
  //
  // And it only ever adds to a Map it knows: one it read, or one the relays
  // prove absent. "Found nothing" is also what a missed read looks like, and
  // nobody is here to try again — started from nothing, our rows would replace
  // their whole Map. The effect re-runs on the next app load.
  let existing: string[][];
  try {
    await fetchOutboxRelayList(pubkey).catch(() => undefined);
    const map = await probeTrustProviderList(pubkey);
    if (statusOfRead(pubkey, taPubkey, map.event) !== "none") return;
    if (!map.event && !map.provenAbsent) return;
    existing = map.event?.tags ?? [];
  } catch {
    return;
  }
  // A first declaration names their Trusted Lists too, when they have some —
  // one signature rather than a second prompt later.
  let lists: ListDesignation | null = null;
  try {
    const found = await checkUserLists(pubkey, taPubkey);
    if (found.status === "missing") lists = found.designation;
  } catch {}
  try {
    const signed = await signNip85(taPubkey, getNip85RelayUrl(), { lists, existing, take: [] });
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
