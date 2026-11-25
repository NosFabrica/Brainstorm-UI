/**
 * The relay reads behind a list item's engagement (lib/itemEngagement has
 * the rules). Reactions live where the item does — the hub, and our index
 * beside it (services/listReads, both at once). Claimants are kind-0
 * profiles by `#i`, which only our index can be asked for. Endorsing signs
 * the reaction as the active account (signAs) and publishes it where list
 * events go: the author's write relays and the hub (publishTagEvent).
 */
import type { NostrEvent } from "nostr-tools";
import type { Filter } from "applesauce-core/helpers/filter";
import { requireActiveAccount, signAs } from "@/accounts/signing";
import { dictionaryRelays } from "@/config/dictionary";
import { readListEvents } from "@/services/listReads";
import { publishTagEvent } from "@/services/tags";
import { fetchFromSearchRelayByFilters } from "@/services/nostr";
import { coordinateOf } from "@/lib/dlistFields";
import {
  endorsementTemplate,
  endorsersByItem,
  endorsersOf,
  githubClaimantsOf,
  type Endorser,
  type GitHubClaimant,
} from "@/lib/itemEngagement";

const TIMEOUT_MS = 6000;

/** Where an item's endorsements are asked for: reactions naming its id, or its address. */
export function itemReactionFilters(item: { id: string; kind: number; pubkey: string; tags: string[][] }): Filter[] {
  const address = coordinateOf(item);
  const filters: Filter[] = [{ kinds: [7], "#e": [item.id], limit: 200 }];
  if (address) filters.push({ kinds: [7], "#a": [address], limit: 200 });
  return filters;
}

/** The reactions behind an item's endorsements, each landing in the store as it arrives. */
export function readItemReactions(item: {
  id: string;
  kind: number;
  pubkey: string;
  tags: string[][];
}): Promise<NostrEvent[]> {
  return readListEvents(itemReactionFilters(item) as Record<string, unknown>[], TIMEOUT_MS);
}

export async function fetchItemReactions(item: {
  id: string;
  kind: number;
  pubkey: string;
  tags: string[][];
}): Promise<Endorser[]> {
  return endorsersOf(await readItemReactions(item));
}

/**
 * Claimants are asked for in batches: a list of GitHub accounts asks for every
 * row's at once, and one REQ per handle (a profile's list ran to 209 in 50 ms)
 * sailed past the search relay's 50 concurrent subscriptions, so most were
 * refused and the rows showed no claimants. Handles asked within one short
 * window share a filter (`#i` takes many values), up to `CLAIMANT_BATCH` per
 * REQ, and each caller gets the claims for its own handle out of the answer
 * (githubClaimantsOf keeps only profiles naming it).
 */
const CLAIMANT_WINDOW_MS = 25;
const CLAIMANT_BATCH = 50;
/** Up to this many claimants a handle, as one handle's ask always allowed. */
const CLAIMANTS_PER_HANDLE = 100;

interface ClaimantAsk {
  handle: string;
  resolve: (profiles: NostrEvent[]) => void;
}

let waiting = new Map<string, ClaimantAsk[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether a kind 0 claims this GitHub handle (an `i` tag naming it, any case). */
const claims = (profile: NostrEvent, handle: string) => githubClaimantsOf([profile], handle).length > 0;

function askClaimants(batch: Map<string, ClaimantAsk[]>): void {
  const tags = [...batch.keys()];
  void fetchFromSearchRelayByFilters(
    [{ kinds: [0], "#i": tags, limit: CLAIMANTS_PER_HANDLE * tags.length }],
    TIMEOUT_MS,
  )
    .catch(() => [] as NostrEvent[])
    .then((profiles) => {
      for (const asks of batch.values())
        for (const ask of asks) ask.resolve(profiles.filter((p) => claims(p, ask.handle)));
    });
}

function flushClaimants(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const all = [...waiting];
  waiting = new Map();
  for (let i = 0; i < all.length; i += CLAIMANT_BATCH) askClaimants(new Map(all.slice(i, i + CLAIMANT_BATCH)));
}

/** The kind-0 profiles that claim a GitHub handle, as the store kept them; batched (see above). */
export function fetchGitHubClaimantProfiles(handle: string): Promise<NostrEvent[]> {
  const tag = `github:${handle.trim()}`;
  return new Promise((resolve) => {
    const asks = waiting.get(tag);
    if (asks) asks.push({ handle, resolve });
    else waiting.set(tag, [{ handle, resolve }]);
    if (waiting.size >= CLAIMANT_BATCH) flushClaimants();
    else flushTimer ??= setTimeout(flushClaimants, CLAIMANT_WINDOW_MS);
  });
}

export async function fetchGitHubClaimants(handle: string): Promise<GitHubClaimant[]> {
  return githubClaimantsOf(await fetchGitHubClaimantProfiles(handle), handle);
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

/**
 * Who endorsed each of many items, in one batch: what search shows at once
 * (lib/itemEngagement endorsersByItem gives each reaction to the item it names).
 */
/** Where many items' endorsements are asked for, in one batch. */
export function itemsReactionFilters(items: { id: string; address: string | null }[]): Filter[] {
  const addresses = items.map((i) => i.address).filter((a): a is string => !!a);
  const filters: Filter[] = [{ kinds: [7], "#e": items.map((i) => i.id), limit: 2000 }];
  if (addresses.length) filters.push({ kinds: [7], "#a": addresses, limit: 2000 });
  return filters;
}

/** The reactions behind many items' endorsements, each landing in the store as it arrives. */
export function readItemsReactions(items: { id: string; address: string | null }[]): Promise<NostrEvent[]> {
  if (items.length === 0) return Promise.resolve([]);
  return readListEvents(itemsReactionFilters(items) as Record<string, unknown>[], TIMEOUT_MS);
}

export async function fetchItemsReactions(
  items: { id: string; address: string | null }[],
): Promise<Map<string, Endorser[]>> {
  if (items.length === 0) return new Map();
  return endorsersByItem(await readItemsReactions(items), items);
}
