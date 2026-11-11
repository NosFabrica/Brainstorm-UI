/**
 * The Observer's morning paper as a scheduled task (NIP-FB, `lib/scheduledTasks`; quartz
 * `plans/2026-11-11-observer-site.md`, "The morning schedule, synced"): the one task with
 * the fixed id `observer`, printed by whichever of the reader's Amethyst devices claims
 * the morning first. Brainstorm shows it and edits `paused` and `cron`; it never
 * claims a morning and never prints on a schedule.
 *
 * What is the Observer's own lives here: where the event is, a blank schedule, and how a
 * print knows today's paper already exists.
 */
import { SCHEDULED_TASK_KIND, emptyTask, type TaskTags } from "@/lib/scheduledTasks";

/** The event's address: NIP-FB's kind, and the `d` the Observer fixes (one per person). */
export const SCHEDULE_KIND = SCHEDULED_TASK_KIND;
export const OBSERVER_TASK = "observer";
export const SCHEDULE_D = OBSERVER_TASK;

/** The morning paper before anyone set it up: paused, no schedule. */
export function emptyObserverSchedule(): TaskTags {
  return emptyTask(OBSERVER_TASK);
}

// --- before a print: already printed today? -------------------------------------

/** The spec's window: an edition printed this recently counts as today's. */
export const PRINTED_TODAY_WINDOW_MS = 20 * 3_600_000;
/** A `printedAt` this far ahead of our clock is another device's skew; further is nonsense. */
const FUTURE_SKEW_MS = 3_600_000;

/** What the check needs of an edition: an Observer site entry, or the session's own paper. */
export interface PrintedEdition {
  /** UTC `YYYY-MM-DD`. */
  day: string;
  /** Unix seconds; absent on a site entry that didn't record it. */
  printedAt?: number;
}

/**
 * The newest edition that makes today's print already done (the spec's "Before any
 * scheduled print"): one printed in the last 20 hours, or, for an entry with no
 * `printedAt`, one whose UTC day is today's UTC date. Brainstorm only uses it as a hint;
 * a manual print is never skipped.
 */
export function printedToday<T extends PrintedEdition>(editions: readonly T[], now: number): T | null {
  const today = new Date(now).toISOString().slice(0, 10);
  const at = (e: T) => (e.printedAt !== undefined ? e.printedAt * 1000 : Date.parse(`${e.day}T00:00:00Z`));
  let best: T | null = null;
  for (const e of editions) {
    const recent =
      typeof e.printedAt === "number"
        ? now - e.printedAt * 1000 < PRINTED_TODAY_WINDOW_MS && e.printedAt * 1000 <= now + FUTURE_SKEW_MS
        : e.day === today;
    if (recent && (!best || at(e) > at(best))) best = e;
  }
  return best;
}
