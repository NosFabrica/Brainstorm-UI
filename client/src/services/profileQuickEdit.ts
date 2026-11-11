import type { PublishOutcome } from "@/accounts/signing";
import { fetchProfileEvent, publishProfile } from "@/services/nostr";

/**
 * Change one field of the user's own profile (kind 0) — a photo, banner or
 * bio added in place on /setup — keeping every other field and tag as
 * published. The current profile is read first; if it can't be, nothing is
 * published: a guess would wipe their name and links.
 */
export async function updateProfileField(
  pubkey: string,
  field: "picture" | "banner" | "about",
  value: string,
): Promise<PublishOutcome> {
  const current = await fetchProfileEvent(pubkey).catch(() => undefined);
  if (!current) return { success: false, error: "Couldn't read your profile. Nothing was changed." };
  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse(current.content || "{}");
  } catch {
    return { success: false, error: "Couldn't read your profile. Nothing was changed." };
  }
  const v = value.trim();
  if (v) content[field] = v;
  else delete content[field];
  return publishProfile(content, current.tags ?? []);
}
