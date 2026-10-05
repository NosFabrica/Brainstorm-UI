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
import { eventStore } from "@/lib/eventStore";
import { lastAnswer } from "@/lib/askOnce";

/** "missing": lists exist and the 10040 doesn't name them — ask the user to publish again. */
export type UserListsStatus = "none" | "declared" | "missing";

export interface UserLists {
  status: UserListsStatus;
  /** Who publishes the lists, and where — what the 10040 should name. */
  designation: ListDesignation | null;
}

/** /setup's "30392" row, else the user's own assistant on the NIP-85 relay (the server's own fallback). */
export async function designationFor(pubkey: string, taPubkey: string): Promise<ListDesignation | null> {
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

/** The HTTP half, cached where `useTrustListsStatus` and `listsToName` both read it. */
export const designationKey = (pubkey: string, taPubkey: string) =>
  ["trust-lists-designation", pubkey, taPubkey] as const;

const LIST_FILTER = (designation: ListDesignation) => ({
  kinds: LIST_KINDS.map(Number),
  authors: [designation.key],
  limit: 20,
});

/** One ask per designation for the lists on its relay; they land in the store. */
export const listsAskKey = (designation: ListDesignation) => `trust-lists:${designation.key}:${designation.relay}`;
export const listsFilter = LIST_FILTER;
export const askLists = (designation: ListDesignation) =>
  requestAll([designation.relay], LIST_FILTER(designation), 8000);

/** Given the 10040 and the lists found: are there live lists it doesn't name? */
export function listsStatusOf(
  declaration: { tags: string[][] } | null | undefined,
  designation: ListDesignation,
  lists: { tags: string[][] }[],
): UserListsStatus {
  if (declaresLists(declaration, designation)) return "declared";
  // A retraction is an empty list; only a live one is worth a signature.
  const live = lists.some((e) => !e.tags.some((t) => t[0] === "status" && t[1] === "retracted"));
  return live ? "missing" : "none";
}

export async function checkUserLists(pubkey: string, taPubkey: string): Promise<UserLists> {
  const designation = await designationFor(pubkey, taPubkey);
  if (!designation) return { status: "none", designation: null };
  const declaration = await fetchTrustProviderList(pubkey);
  if (declaresLists(declaration, designation)) return { status: "declared", designation };
  return { status: listsStatusOf(declaration, designation, await askLists(designation)), designation };
}

/**
 * What a 10040 about to be signed should say about Trusted Lists: the
 * designation when the user has lists their declaration doesn't name yet,
 * else nothing. Every activation surface needs this answer, so it lives here
 * rather than being re-derived at each one — the dashboard's Activate modal
 * skipped it and cost those users a second signature later.
 *
 * Prefers what the app already holds — the designation `useTrustListsStatus`
 * cached, and the 10040 and lists in the store once their asks have answered —
 * so the signer prompt isn't held up by a relay read the surface already did.
 * Never throws: a publish must not fail because we couldn't work out whether to
 * mention lists.
 */
export async function listsToName(pubkey: string, taPubkey: string): Promise<ListDesignation | null> {
  const designation = queryClient.getQueryData<ListDesignation | null>(designationKey(pubkey, taPubkey));
  if (designation && lastAnswer(listsAskKey(designation)) !== undefined) {
    const declaration = eventStore.getReplaceable(10040, pubkey);
    const lists = eventStore.getByFilters(LIST_FILTER(designation) as never);
    return listsStatusOf(declaration, designation, lists) === "missing" ? designation : null;
  }
  const lists = await checkUserLists(pubkey, taPubkey).catch(() => null);
  return lists?.status === "missing" ? lists.designation : null;
}
