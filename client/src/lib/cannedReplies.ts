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

/**
 * The common support moves, pre-written so a new device never starts from a
 * blank dropdown: acknowledge, ask for detail, status update, fix shipped,
 * feedback thanks. Seeded ONCE (key absent) as ordinary replies — edit before
 * sending, delete in Manage; deleted starters never come back. Stored
 * oldest-first so the newest-first listing leads with Acknowledge.
 */
const STARTERS: ReadonlyArray<[title: string, body: string]> = [
  [
    "Feedback — thank you",
    "Thank you for the feedback — we've shared it with the team, and it genuinely shapes what we build next. Keep it coming.",
  ],
  [
    "Fix shipped — please confirm",
    "Good news — this should be fixed now. Could you give it another try and reply here if anything still looks off?",
  ],
  [
    "Status update",
    "Quick update — we've reproduced what you reported and a fix is in progress. We'll message you here the moment it lands.",
  ],
  [
    "Need more info",
    "Thanks for flagging this. Could you share a little more detail — which page you were on, what you did, and what you expected to happen? That helps us reproduce it quickly.",
  ],
  [
    "Acknowledge — on it",
    "Thanks for reaching out — your ticket is with the team now. We'll follow up right here as soon as we know more.",
  ],
];

function seed(): CannedReply[] {
  const now = new Date().toISOString();
  return STARTERS.map(([title, body], i) => ({
    id: `cnd_starter_${i}`,
    title,
    body,
    createdAt: now,
  }));
}

function read(): CannedReply[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      const starters = seed();
      write(starters);
      return starters;
    }
    const parsed = JSON.parse(raw);
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
