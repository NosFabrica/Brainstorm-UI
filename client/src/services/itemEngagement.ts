/**
 * The relay reads behind a list item's engagement (lib/itemEngagement has
 * the rules). Reactions live where the item does — the hub, and our index
 * beside it (services/listReads, both at once). Claimants are kind-0
 * profiles by `#i`, which only our index can be asked for. Endorsing signs
 * the reaction as the active account (signAs) and publishes it where list
 * events go: the author's write relays and the hub (publishTagEvent).
 */
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { dictionaryRelays } from "@/config/dictionary";
import { readListEvents } from "@/services/listReads";
import { publishTagEvent } from "@/services/tags";
import { fetchFromSearchRelayByFilters } from "@/services/nostr";
import { coordinateOf } from "@/lib/dlistFields";
import {
  endorsementTemplate,
  endorsersOf,
  githubClaimantsOf,
  type Endorser,
  type GitHubClaimant,
} from "@/lib/itemEngagement";

const TIMEOUT_MS = 6000;

export async function fetchItemReactions(item: {
  id: string;
  kind: number;
  pubkey: string;
  tags: string[][];
}): Promise<Endorser[]> {
  const address = coordinateOf(item);
  const filters: Record<string, unknown>[] = [{ kinds: [7], "#e": [item.id], limit: 200 }];
  if (address) filters.push({ kinds: [7], "#a": [address], limit: 200 });
  const events = await readListEvents(filters, TIMEOUT_MS);
  return endorsersOf(events);
}

export async function fetchGitHubClaimants(handle: string): Promise<GitHubClaimant[]> {
  const profiles = await fetchFromSearchRelayByFilters(
    [{ kinds: [0], "#i": [`github:${handle.trim()}`], limit: 100 }],
    TIMEOUT_MS,
  ).catch(() => []);
  return githubClaimantsOf(profiles, handle);
}

export async function publishEndorsement(item: {
  id: string;
  kind: number;
  pubkey: string;
  tags: string[][];
}): Promise<Endorser> {
  const hint = dictionaryRelays()[0] ?? "";
  const signed = await signAs(requireActiveAccount(), endorsementTemplate(item, hint));
  await publishTagEvent(signed as never);
  return { pubkey: signed.pubkey, at: signed.created_at };
}
