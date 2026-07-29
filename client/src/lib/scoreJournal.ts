import { fetchAlertPrefs, publishAlertPrefs, SCORE_JOURNAL_D_TAG } from "@/services/nostr";

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
const storageKey = (pubkey: string) => `brainstorm_score_journal:${pubkey}`;

export interface ScoreEntry {
  /** Epoch ms of the calculation this score was observed for. */
  t: number;
  /** Influence 0–1 at that point. */
  score: number;
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
  const next = Array.from(byTime.values()).sort((a, b) => b.t - a.t).slice(0, MAX_ENTRIES);
  if (pubkey) {
    try { localStorage.setItem(storageKey(pubkey), JSON.stringify(next)); } catch {}
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
export function recordScore(pubkey: string, calculatedAtMs: number, score: number): ScoreEntry[] {
  const existing = load(pubkey);
  if (!pubkey || !Number.isFinite(calculatedAtMs) || !Number.isFinite(score)) return existing;
  if (existing.some((e) => e.t === calculatedAtMs)) return existing;
  const next = persist(pubkey, [{ t: calculatedAtMs, score }, ...existing]);
  void publishAlertPrefs({ entries: next }, SCORE_JOURNAL_D_TAG).catch(() => {});
  return next;
}

/** Merge the account's published journal into the local one (union by timestamp). */
export async function hydrateScoreJournal(pubkey: string): Promise<ScoreEntry[]> {
  const local = load(pubkey);
  if (!pubkey) return local;
  const remote = await fetchAlertPrefs(6000, SCORE_JOURNAL_D_TAG);
  const list = Array.isArray((remote as any)?.entries) ? ((remote as any).entries as unknown[]) : [];
  const parsed = list.filter((e): e is ScoreEntry => !!e && typeof (e as any).t === "number" && typeof (e as any).score === "number");
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
