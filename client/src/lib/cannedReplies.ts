/**
 * Canned replies for the support admin — the answers that repeat, saved per
 * device (the same localStorage idiom as everything else in support; shared
 * team snippets can move server-side if the team ever wants them). Insert
 * into the reply box, edit before sending — a starting point, not a bot.
 */

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

const KEY = "brainstorm_support_canned";
const TITLE_MAX = 32;

function read(): CannedReply[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(replies: CannedReply[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(replies));
  } catch {
    /* storage failures cost a snippet, never a crash */
  }
}

export function listCanned(): CannedReply[] {
  // Insertion order reversed — deterministic newest-first even when two
  // saves land in the same millisecond.
  return read().slice().reverse();
}

export function saveCanned(title: string, body: string): CannedReply {
  const trimmedTitle = title.trim();
  const reply: CannedReply = {
    id: `cnd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: trimmedTitle || `${body.trim().slice(0, TITLE_MAX - 1)}…`,
    body,
    createdAt: new Date().toISOString(),
  };
  write([...read(), reply]);
  return reply;
}

export function removeCanned(id: string): void {
  write(read().filter((c) => c.id !== id));
}
