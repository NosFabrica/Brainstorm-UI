/**
 * The tags that make a profile one of the reader's Assistants — the one place
 * the app reads `assistants.config.json` (identifiers are JSON config read
 * through one module, never literals in code: config/dictionary says why).
 */
import raw from "./assistants.config.json";
import { parseCoordinate } from "@/lib/dlistFields";
import { conceptNostrUserTag } from "@/lib/tagging-sdk/profile-tagging.js";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";

export type AssistantTagKey = "brainstorm" | "tapestry";

export interface AssistantTag {
  key: AssistantTagKey;
  name: string;
  /** Its definition, `39999:<author>:<slug>`: what a new tagging points at. */
  coordinate: string;
  slug: string;
}

const config = raw as { tags: Record<AssistantTagKey, { name: string; coordinate: string }> };

/** Both tags, in the order a row shows them. */
export const ASSISTANT_TAGS: AssistantTag[] = (Object.keys(config.tags) as AssistantTagKey[]).map((key) => ({
  key,
  name: config.tags[key].name,
  coordinate: config.tags[key].coordinate,
  slug: parseCoordinate(config.tags[key].coordinate)?.d ?? "",
}));

/** Which tag a slug names, if either. */
export function assistantTagKeyOf(slug: string | null | undefined): AssistantTagKey | null {
  return ASSISTANT_TAGS.find((t) => t.slug === slug)?.key ?? null;
}

/** The canonical namespace every person tagging carries: how a reader asks for them. */
export const NOSTR_USER_TAG_Z: string = conceptNostrUserTag(Z_HANDLE_PUBKEYS[0]);
