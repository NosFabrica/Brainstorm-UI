import { nip19 } from "nostr-tools";
import { apiClient } from "@/services/api";
import { publishAssistantPointer } from "@/services/nostr";
import { followUser } from "@/services/socialActions";
import {
  getCurrentAssistantPubkey,
  readPublishedAssistant,
  writePublishedAssistant,
  type PublishedAssistantState,
} from "@/lib/assistantStorage";

export interface EnsureAssistantResult {
  state: PublishedAssistantState;
  name: string;
  alreadyPublished: boolean;
}

/**
 * Publish (or republish) the user's Brainstorm Assistant and its NIP-78 pointer —
 * the single source of truth for the publish side-effects. The backend mints and
 * holds the assistant key (POST /user/assistantProfile) and returns its pubkey +
 * kind-0 event id; we persist that and publish a kind-30078 pointer under the
 * user's OWN key so other devices can rediscover it.
 *
 * - `follow`: also follow the assistant bot (kind-3). TRUE only for explicit,
 *   user-initiated publishes — the silent new-user path passes FALSE so we never
 *   change their follow list / self-skew their trust graph without their choice.
 * - `skipIfPublished` (default true): no-op if an assistant pubkey is already
 *   stored (idempotent self-heal). The settings card passes FALSE so its button
 *   can republish / refresh on demand.
 *
 * Throws on a hard backend error so callers' UI can surface it; returns the
 * published identity on success.
 */
export async function ensureAssistantPublished(
  { follow, skipIfPublished = true, background = false }: {
    follow: boolean;
    skipIfPublished?: boolean;
    /** Nobody asked: the pointer publish defers rather than raising the unlock modal. */
    background?: boolean;
  },
): Promise<EnsureAssistantResult> {
  if (skipIfPublished) {
    const existing = getCurrentAssistantPubkey();
    if (existing) {
      const stored = readPublishedAssistant();
      const state: PublishedAssistantState = stored ?? {
        pubkey: existing,
        npub: (() => { try { return nip19.npubEncode(existing); } catch { return existing; } })(),
        eventId: "",
        publishedAt: Date.now(),
      };
      return { state, name: "Your Brainstorm Assistant", alreadyPublished: true };
    }
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

  const state: PublishedAssistantState = {
    pubkey,
    npub: (() => { try { return nip19.npubEncode(pubkey); } catch { return pubkey; } })(),
    eventId,
    publishedAt: Date.now(),
  };
  writePublishedAssistant(state);

  // Cross-device sync: NIP-78 kind-30078 pointer under the user's own key.
  publishAssistantPointer(
    { pubkey: state.pubkey, eventId: state.eventId, publishedAt: state.publishedAt },
    { background },
  ).catch(() => {});

  // Only follow on explicit user action — never silently mutate kind-3.
  if (follow) followUser(state.pubkey).catch(() => {});

  return { state, name, alreadyPublished: false };
}
