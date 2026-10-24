/**
 * The reader's Assistant tags, written (Settings › Assistants & Duties): tag a
 * profile as one of their Assistants, change which tag it carries, or say it
 * isn't theirs. Each is a person tagging the reader signs, published like any
 * other (services/tags applyTagToProfile: the tag hub and their outbox).
 *
 * There is no delete (docs/decentralized-tagging/DECISIONS.md): saying a
 * profile isn't their Assistant republishes the same tagging with polarity
 * -1. The earlier one stays on relays and stops counting — here, and on
 * Tapestry, whose reader also lets the newest per tag and profile decide and
 * counts only an apply.
 */
import { ASSISTANT_TAGS, type AssistantTagKey } from "@/config/assistants";
import { parseCoordinate } from "@/lib/dlistFields";
import { applyTagToProfile } from "@/services/tags";

/** Each tag's definition event, by key, once read: the `e` a new tagging points at. */
export type AssistantDefinitions = Partial<Record<AssistantTagKey, string>>;

function tagRef(key: AssistantTagKey, definitions: AssistantDefinitions) {
  const coordinate = parseCoordinate(ASSISTANT_TAGS.find((t) => t.key === key)?.coordinate);
  if (!coordinate) throw new Error(`No ${key} Assistant tag is configured.`);
  return { authorPubkey: coordinate.pubkey, slug: coordinate.d, eventId: definitions[key] ?? null };
}

async function publish(target: string, key: AssistantTagKey, polarity: 1 | -1, definitions: AssistantDefinitions) {
  const result = await applyTagToProfile({ tag: tagRef(key, definitions), targetPubkey: target, polarity });
  if (result.failedAt) throw new Error(result.failedAt.error || "The tagging couldn't be published.");
}

/** Tag `target` as one of the reader's Assistants. */
export function tagAsAssistant(target: string, key: AssistantTagKey, definitions: AssistantDefinitions) {
  return publish(target, key, 1, definitions);
}

/**
 * Move `target` from one tag to the other: the new tag first, and only once
 * it's out, the old one disputed. A failure part-way leaves both tags — true,
 * and fixable from the row — never neither. Throws if the new tag didn't go
 * out; `undisputed` is the old tag's error when only that step failed.
 */
export async function changeAssistantTag(
  target: string,
  from: AssistantTagKey,
  to: AssistantTagKey,
  definitions: AssistantDefinitions,
): Promise<{ undisputed?: unknown }> {
  await publish(target, to, 1, definitions);
  try {
    await publish(target, from, -1, definitions);
    return {};
  } catch (error) {
    return { undisputed: error };
  }
}

/**
 * Say `target` isn't the reader's Assistant: dispute each tag it carries, one
 * at a time. Returns the tags whose dispute didn't go out, and the first error.
 */
export async function disownAssistant(
  target: string,
  keys: readonly AssistantTagKey[],
  definitions: AssistantDefinitions,
): Promise<{ failed: AssistantTagKey[]; error?: unknown }> {
  const failed: AssistantTagKey[] = [];
  let error: unknown;
  for (const key of keys) {
    try {
      await publish(target, key, -1, definitions);
    } catch (e) {
      failed.push(key);
      error ??= e;
    }
  }
  return { failed, error };
}
