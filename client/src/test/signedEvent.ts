/**
 * Really signed events for tests: a check that verifies a signature (a
 * repost's note, a community approval's post) only believes these.
 */
import { finalizeEvent, getPublicKey, type NostrEvent } from "nostr-tools";

/** A fixed test key: its events are signed, never anyone's. */
export const TEST_SECRET = new Uint8Array(32).fill(7);
export const TEST_PUBKEY = getPublicKey(TEST_SECRET);

/** A signed event by the test key (or `secret`), `created_at` fixed unless given. */
export function signed(
  template: { kind: number; content?: string; tags?: string[][]; created_at?: number },
  secret: Uint8Array = TEST_SECRET,
): NostrEvent {
  return finalizeEvent(
    {
      kind: template.kind,
      content: template.content ?? "",
      tags: template.tags ?? [],
      created_at: template.created_at ?? 1_790_000_000,
    },
    secret,
  );
}
