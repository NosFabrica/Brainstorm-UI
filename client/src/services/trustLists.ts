/**
 * Trusted Lists in the user's 10040. Their Brainstorm assistant publishes the
 * lists (kinds 30392/30393/30394); other apps find them only when the user's
 * kind-10040 names the assistant for those kinds. This answers "does the user
 * have lists their 10040 doesn't point to?" — looking on the relay the
 * server's /setup "30392" row names, the key and relay the publish then uses.
 *
 * /setup is the right source here even though trustSource.ts avoids it for
 * READING scores: this is about what to PUBLISH, which is what /setup describes.
 */
import { apiClient } from "./api";
import { fetchTrustProviderList, getNip85RelayUrl } from "./nostr";
import { requestAll } from "@/lib/relayRequest";
import { declaresLists, LIST_KINDS, type ListDesignation } from "@/lib/nip85Declaration";
import { queryClient } from "@/lib/queryClient";

/** "missing": lists exist and the 10040 doesn't name them — ask the user to publish again. */
export type UserListsStatus = "none" | "declared" | "missing";

export interface UserLists {
  status: UserListsStatus;
  /** Who publishes the lists, and where — what the 10040 should name. */
  designation: ListDesignation | null;
}

/** /setup's "30392" row, else the user's own assistant on the NIP-85 relay (the server's own fallback). */
async function designationFor(pubkey: string, taPubkey: string): Promise<ListDesignation | null> {
  try {
    const row = (await apiClient.getSetupRows(pubkey)).find((r) => r[0] === "30392");
    if (row?.[1] && row?.[2]) return { key: row[1], relay: row[2] };
  } catch {
    // An older server, or a blip: fall back below.
  }
  try {
    return { key: taPubkey, relay: getNip85RelayUrl() };
  } catch {
    return null;
  }
}

export async function checkUserLists(pubkey: string, taPubkey: string): Promise<UserLists> {
  const designation = await designationFor(pubkey, taPubkey);
  if (!designation) return { status: "none", designation: null };
  if (declaresLists(await fetchTrustProviderList(pubkey), designation)) return { status: "declared", designation };
  const events = await requestAll(
    [designation.relay],
    { kinds: LIST_KINDS.map(Number), authors: [designation.key], limit: 20 },
    8000,
  );
  // A retraction is an empty list; only a live one is worth a signature.
  const live = events.some((e) => !e.tags.some((t) => t[0] === "status" && t[1] === "retracted"));
  return { status: live ? "missing" : "none", designation };
}

/**
 * What a 10040 about to be signed should say about Trusted Lists: the
 * designation when the user has lists their declaration doesn't name yet,
 * else nothing. Every activation surface needs this answer, so it lives here
 * rather than being re-derived at each one — the dashboard's Activate modal
 * skipped it and cost those users a second signature later.
 *
 * Prefers the answer the app already has (the same react-query key
 * `useTrustListsStatus` fills), so the signer prompt isn't held up by a
 * relay read the surface already did. Never throws: a publish must not fail
 * because we couldn't work out whether to mention lists.
 */
export async function listsToName(
  pubkey: string,
  taPubkey: string,
): Promise<ListDesignation | null> {
  const known = queryClient.getQueryData<UserLists>(["trust-lists-status", pubkey, taPubkey]);
  const lists = known ?? (await checkUserLists(pubkey, taPubkey).catch(() => null));
  return lists?.status === "missing" ? lists.designation : null;
}

/**
 * After our own publish, say what we KNOW instead of refetching — a lagging
 * relay answering "missing" would re-raise the prompt the publish satisfied.
 */
export function recordTrustListsDeclared(pubkey: string, designation: ListDesignation): void {
  queryClient.setQueriesData({ queryKey: ["trust-lists-status", pubkey] }, { status: "declared", designation });
}
