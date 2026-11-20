import { readTask, type ScheduledTask, type TaskTags } from "@/lib/scheduledTasks";

/**
 * The newest Observer schedule this session has opened for each account, its private tags
 * decrypted: what the print job reads the account's shared choices from (publishing, so far)
 * without asking a signer. Filled by `services/observerSchedule` whenever it reads or writes one.
 * Empty until then (no schedule yet, or still locked): the callers fall back to what this
 * browser remembers.
 */
const held = new Map<string, { createdAt: number; tags: TaskTags }>();

/** `tags` as `pubkey`'s schedule, signed at `createdAt` (seconds); an older one never replaces a newer one. */
export function holdSchedule(pubkey: string, createdAt: number, tags: TaskTags) {
  const known = held.get(pubkey);
  if (known && known.createdAt > createdAt) return;
  held.set(pubkey, { createdAt, tags });
}

/** The newest schedule opened for `pubkey`, or null when none has been. */
export function heldScheduleTask(pubkey: string): ScheduledTask | null {
  const known = held.get(pubkey);
  return known ? readTask(known.tags, pubkey) : null;
}

/** Forgets every account's schedule (tests, sign-out). */
export function forgetHeldSchedules() {
  held.clear();
}
