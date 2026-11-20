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

/** When the newest schedule opened for `pubkey` was signed (seconds), or null when none has been. */
export function heldScheduleAt(pubkey: string): number | null {
  return held.get(pubkey)?.createdAt ?? null;
}

/** The newest schedule opened for `pubkey`, or null when none has been. */
export function heldScheduleTask(pubkey: string): ScheduledTask | null {
  const known = held.get(pubkey);
  return known ? readTask(known.tags, pubkey) : null;
}

/** What else holds a decrypted schedule, or a choice read from one, and must forget it with these. */
const forgetters = new Set<() => void>();

/** `forget` runs whenever the held schedules are forgotten (sign-out). */
export function onForgetSchedules(forget: () => void) {
  forgetters.add(forget);
}

/**
 * Forgets every account's schedule, and every read of one that registered with
 * `onForgetSchedules` (the decrypted reads in `services/observerSchedule`, the print job's
 * publishing choice): sign-out, so a shared device keeps none of them in memory.
 */
export function forgetHeldSchedules() {
  held.clear();
  for (const forget of forgetters) forget();
}
