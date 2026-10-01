import { fetchAlertPrefs, publishAlertPrefs, SCORE_JOURNAL_D_TAG } from "@/services/nostr";
import { accountKey } from "@/lib/accountStorage";

/**
 * The user's own trust-score history.
 *
 * The backend records calculation RUNS (/admin/users/:pubkey/history — admin
 * only today) but not the score each run produced, so score movement — the one
 * thing a member actually wants from "my history" — exists nowhere. This
 * journals it client-side: one entry per completed calculation, captured the
 * moment we observe a new `last_calculated` timestamp.
 *
 * Consequences worth knowing:
 *  - It is FORWARD-ONLY. Past runs can't be backfilled; nobody recorded them.
 *  - It's a record of what this account was *observed* to score, not an
 *    authoritative run log. When /user/history starts returning run records,
 *    those merge in on top (matched by timestamp) to add trigger/duration/
 *    published — this stays the source for the score column.
 *
 * Stored per-account in localStorage and mirrored to the user's own NIP-78 app
 * data so the timeline follows them across devices.
 */

const MAX_ENTRIES = 60;
const storageKey = (pubkey: string) => accountKey("brainstorm_score_journal", pubkey);

export interface ScoreEntry {
  /** Epoch ms of the calculation this score was observed for. */
  t: number;
  /** Influence 0–1 at that point. */
  score: number;
  /** Backend preset the run used ("PERMISSIVE" | "DEFAULT" | "RESTRICTIVE"), if known. */
  preset?: string;
}

function load(pubkey: string): ScoreEntry[] {
  if (!pubkey) return [];
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is ScoreEntry => !!e && typeof e.t === "number" && typeof e.score === "number")
      .map((e) => ({ t: e.t, score: e.score, preset: typeof e.preset === "string" ? e.preset : undefined }))
      .sort((a, b) => b.t - a.t);
  } catch {
    return [];
  }
}

function persist(pubkey: string, entries: ScoreEntry[]): ScoreEntry[] {
  // De-dupe by calculation timestamp — the same run observed on two devices (or
  // twice in one session) must not become two rows.
  const byTime = new Map<number, ScoreEntry>();
  for (const e of entries) {
    const existing = byTime.get(e.t);
    if (!existing) byTime.set(e.t, e);
  }
  const next = Array.from(byTime.values())
    .sort((a, b) => b.t - a.t)
    .slice(0, MAX_ENTRIES);
  if (pubkey) {
    try {
      localStorage.setItem(storageKey(pubkey), JSON.stringify(next));
    } catch {}
  }
  return next;
}

export function getScoreJournal(pubkey: string): ScoreEntry[] {
  return load(pubkey);
}

/**
 * Record the score observed for a completed calculation. No-ops when this run's
 * timestamp is already journalled, so it's safe to call on every render.
 * Returns the updated journal.
 */
export function recordScore(pubkey: string, calculatedAtMs: number, score: number, preset?: string): ScoreEntry[] {
  const existing = load(pubkey);
  if (!pubkey || !Number.isFinite(calculatedAtMs) || !Number.isFinite(score)) return existing;
  if (existing.some((e) => e.t === calculatedAtMs)) return existing;
  const next = persist(pubkey, [{ t: calculatedAtMs, score, preset }, ...existing]);
  // Called from an effect as score history loads, so it must never prompt.
  void publishAlertPrefs({ entries: next }, SCORE_JOURNAL_D_TAG, { background: true }).catch(() => {});
  return next;
}

/** Merge the account's published journal into the local one (union by timestamp). */
export async function hydrateScoreJournal(pubkey: string): Promise<ScoreEntry[]> {
  const local = load(pubkey);
  if (!pubkey) return local;
  const remote = await fetchAlertPrefs(6000, SCORE_JOURNAL_D_TAG);
  const list = Array.isArray(remote?.entries) ? (remote.entries as unknown[]) : [];
  const parsed = list.filter(
    (e): e is ScoreEntry =>
      !!e && typeof (e as ScoreEntry).t === "number" && typeof (e as ScoreEntry).score === "number",
  );
  if (parsed.length === 0) return local;
  const merged = persist(pubkey, [...local, ...parsed]);
  return merged;
}

/** A journal row paired with the delta against the previous (older) entry. */
export interface ScoreChange extends ScoreEntry {
  /** Score before this run, or null when it's the first entry we ever saw. */
  previous: number | null;
  /** score - previous, or null when there's nothing to compare against. */
  delta: number | null;
}

/** Newest-first entries annotated with their movement. */
export function withDeltas(entries: ScoreEntry[]): ScoreChange[] {
  const sorted = [...entries].sort((a, b) => b.t - a.t);
  return sorted.map((e, i) => {
    const older = sorted[i + 1];
    return {
      ...e,
      previous: older ? older.score : null,
      delta: older ? e.score - older.score : null,
    };
  });
}

/** A row of the history as shown: one run, or a stretch of runs that changed nothing. */
export type HistoryRow =
  { kind: "run"; entry: ScoreChange } | { kind: "fold"; count: number; fromMs: number; toMs: number };

/** Below half a point on the 0–100 scale the number on screen does not move. */
const NO_VISIBLE_CHANGE = 0.005;

/**
 * The history worth reading: the newest run (the one behind the current
 * score), every run that moved the score, the first run on record — and each
 * stretch of runs between them that changed nothing folded into one line.
 * A lone quiet run is not worth a fold; it stays a row.
 */
export function foldUnchanged(
  changes: readonly ScoreChange[],
  /** What the surface shows as a change; default: the 0–100 number moved. In tier words, only a new tier does. */
  changed: (e: ScoreChange) => boolean = (e) => e.delta !== null && Math.abs(e.delta) >= NO_VISIBLE_CHANGE,
): HistoryRow[] {
  const quiet = (e: ScoreChange, i: number) => i !== 0 && e.previous !== null && !changed(e);
  const rows: HistoryRow[] = [];
  let run: ScoreChange[] = [];
  const flush = () => {
    if (run.length >= 2) rows.push({ kind: "fold", count: run.length, fromMs: run[run.length - 1].t, toMs: run[0].t });
    else for (const entry of run) rows.push({ kind: "run", entry });
    run = [];
  };
  changes.forEach((e, i) => {
    if (quiet(e, i)) run.push(e);
    else {
      flush();
      rows.push({ kind: "run", entry: e });
    }
  });
  flush();
  return rows;
}
