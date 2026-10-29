/**
 * Save the reader's edited Treasure Map (Settings › Treasure Map): Tapestry's
 * save sequence (ui/src/pages/treasure-map/saveTreasureMap.js, its book
 * decisions 17 and 19), through this app's signer and publish path.
 *
 * 1. Only ever the signed-in reader's own Map.
 * 2. A newer Map than the one the edit was made on stops the save: nothing is
 *    signed, and the tab shows the newer one with the edit on top of it. A
 *    read that fails doesn't block.
 * 3. Signed as the reader (signAs), stamped now — or one second after the
 *    published Map, so the new one always replaces it.
 * 4. Published where the app publishes a 10040 (the reader's outbox and the
 *    NIP-85 relay: services/nostr publishRelaysFor), plus the general relays
 *    Tapestry reads Maps from, waiting on each so the outcome counts them all.
 *    The store holds it at once, so the tab shows it.
 */
import type { NostrEvent } from "nostr-tools";
import { activeAccount, signAs, signingProblem } from "@/accounts/signing";
import { PROFILE_RELAYS } from "@/lib/relays";
import { isNewerMap, stampTime, type MapDraft } from "@/lib/treasureMapEdit";
import { fetchTrustProviderList, publishToRelays } from "@/services/nostr";

/** How long each relay is given to answer before it counts as not taking the Map. */
const RELAY_MS = 8000;

export type SaveOutcome =
  /** Every relay took it. */
  | { outcome: "saved"; accepted: number; total: number }
  /** Some relays took it. */
  | { outcome: "partial"; accepted: number; total: number }
  /** None did. */
  | { outcome: "failed"; error: string; total: number }
  /** A newer Map was found: nothing was signed. */
  | { outcome: "changed" }
  /** Not signed: the reason, or null when the reader cancelled (they know). */
  | { outcome: "not-sent"; message: string | null };

export async function saveTreasureMap({
  viewer,
  base,
  draft,
}: {
  viewer: string;
  /** The Map the edit was made on; null when none was found. */
  base: NostrEvent | null;
  draft: MapDraft;
}): Promise<SaveOutcome> {
  const account = activeAccount();
  if (!account || account.pubkey !== viewer || draft.pubkey !== viewer || (base && base.pubkey !== viewer)) {
    return { outcome: "not-sent", message: "Sign in as this account to save its Treasure Map." };
  }

  const latest = await fetchTrustProviderList(viewer).catch(() => undefined);
  if (isNewerMap(latest, base)) return { outcome: "changed" };

  let signed: NostrEvent;
  try {
    signed = await signAs(account, {
      kind: 10040,
      content: draft.content,
      tags: draft.tags as string[][],
      created_at: stampTime(base, Math.floor(Date.now() / 1000)),
    });
  } catch (error) {
    return { outcome: "not-sent", message: signingProblem(error, "Couldn’t save: the signature was declined.") };
  }

  // Every relay: `need` past the count waits for each answer (or its timeout), so the outcome counts them all.
  const published = await publishToRelays(signed, PROFILE_RELAYS, {
    need: Number.POSITIVE_INFINITY,
    timeoutMs: RELAY_MS,
  });
  const accepted = published.accepted ?? 0;
  const total = published.total ?? 0;
  if (!published.success || !accepted) {
    return { outcome: "failed", error: published.error || "No relay took it.", total };
  }
  return { outcome: accepted === total ? "saved" : "partial", accepted, total };
}
