import { nip19 } from "nostr-tools";
import { apiClient } from "@/services/api";
import { followUser } from "@/services/socialActions";
import {
  dropMismatchedAssistant,
  readAssistantFor,
  writePublishedAssistant,
  type PublishedAssistantState,
} from "@/lib/assistantStorage";

export interface EnsureAssistantResult {
  state: PublishedAssistantState;
  name: string;
  alreadyPublished: boolean;
}

/**
 * Publish (or republish) the user's Brainstorm Assistant — the single source of
 * truth for the publish side-effects. The backend holds the assistant key
 * (POST /user/assistantProfile) and returns its pubkey + kind-0 event id; we
 * cache that in this browser. Which Assistant is the user's is the server's
 * `ta_pubkey`, so other devices need nothing from here (#269).
 *
 * - `taPubkey`: the server's answer. A cached Assistant that isn't it is
 *   dropped, and a publish that comes back under any other key is neither
 *   cached nor followed.
 * - `follow`: also follow the assistant bot (kind-3). TRUE only for explicit,
 *   user-initiated publishes — the silent new-user path passes FALSE so we never
 *   change their follow list / self-skew their trust graph without their choice.
 * - `skipIfPublished` (default true): no-op if `taPubkey` is already cached
 *   (idempotent self-heal). The settings card passes FALSE so its button can
 *   republish / refresh on demand.
 *
 * Throws on a hard backend error so callers' UI can surface it; returns the
 * published identity on success.
 */
export async function ensureAssistantPublished({
  taPubkey,
  follow,
  skipIfPublished = true,
}: {
  taPubkey: string;
  follow: boolean;
  skipIfPublished?: boolean;
}): Promise<EnsureAssistantResult> {
  dropMismatchedAssistant(taPubkey);
  if (skipIfPublished) {
    const existing = readAssistantFor(taPubkey);
    if (existing) return { state: existing, name: "Your Brainstorm Assistant", alreadyPublished: true };
  }

  const resp = await apiClient.publishDefaultAssistantProfile();
  // The backend may return the payload at the top level or wrapped under `data`.
  const top = resp || {};
  const wrapped = resp?.data || {};
  const pubkey = top.assistant_pubkey || wrapped.assistant_pubkey;
  const eventId = top.event_id || wrapped.event_id;
  const name = (top.name || wrapped.name || "Your Brainstorm Assistant").toString();
  if (!pubkey || !eventId) {
    throw new Error("The assistant was published, but no identity was returned. Please try again.");
  }
  // The server signs both with one key; a mismatch means we can't say which is theirs.
  if (pubkey !== taPubkey) {
    throw new Error("The assistant was published, but under a different key than the server reports for you.");
  }

  const state: PublishedAssistantState = {
    pubkey,
    npub: (() => {
      try {
        return nip19.npubEncode(pubkey);
      } catch {
        return pubkey;
      }
    })(),
    eventId,
    publishedAt: Date.now(),
  };
  writePublishedAssistant(state);

  // Only follow on explicit user action — never silently mutate kind-3.
  if (follow) followUser(state.pubkey).catch(() => {});

  return { state, name, alreadyPublished: false };
}
