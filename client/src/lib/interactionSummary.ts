/**
 * What the reader has had to do with an account, from their own data on this
 * device: whether they follow or muted it, messages either way, and their own
 * replies, reactions and reposts that tag it. Shown beside a flag on /alerts,
 * so "reported by people you trust" sits next to "and you've talked to them
 * for months" — the reader judges, the app doesn't.
 *
 * Only the reader sees it, and it never leaves the device.
 */

export interface InteractionSummary {
  youFollow: boolean;
  youMuted: boolean;
  youMessaged: boolean;
  theyMessaged: boolean;
  replies: number;
  reactions: number;
  reposts: number;
  /** The newest of all of the above that carries a time, in seconds; null when none does. */
  lastAt: number | null;
}

export interface InteractionSources {
  me: string;
  follows: ReadonlySet<string>;
  muted: (pubkey: string) => boolean;
  /** The 1:1 conversation with them, when there is one on this device. */
  dmRoom?: { messages: { author: string; createdAt: number }[] };
  /** The reader's own notes (1), reposts (6) and reactions (7). */
  myEvents: { kind: number; created_at: number; tags: string[][] }[];
}

const tags = (ev: { tags: string[][] }, pubkey: string) => ev.tags.some((t) => t[0] === "p" && t[1] === pubkey);

export function interactionSummary(pubkey: string, src: InteractionSources): InteractionSummary {
  const out: InteractionSummary = {
    youFollow: src.follows.has(pubkey),
    youMuted: src.muted(pubkey),
    youMessaged: false,
    theyMessaged: false,
    replies: 0,
    reactions: 0,
    reposts: 0,
    lastAt: null,
  };
  const seen = (at: number) => {
    if (out.lastAt === null || at > out.lastAt) out.lastAt = at;
  };
  for (const m of src.dmRoom?.messages ?? []) {
    if (m.author === src.me) out.youMessaged = true;
    else if (m.author === pubkey) out.theyMessaged = true;
    else continue;
    seen(m.createdAt);
  }
  for (const ev of src.myEvents) {
    if (!tags(ev, pubkey)) continue;
    if (ev.kind === 1) out.replies += 1;
    else if (ev.kind === 7) out.reactions += 1;
    else if (ev.kind === 6) out.reposts += 1;
    else continue;
    seen(ev.created_at);
  }
  return out;
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** The summary as short phrases, strongest first; empty when there's nothing to say. */
export function interactionLine(s: InteractionSummary): string[] {
  const out: string[] = [];
  if (s.youFollow) out.push("You follow them");
  if (s.youMuted) out.push("You muted them");
  if (s.youMessaged && s.theyMessaged) out.push("You've messaged each other");
  else if (s.youMessaged) out.push("You've messaged them");
  else if (s.theyMessaged) out.push("They've messaged you");
  if (s.replies) out.push(count(s.replies, "reply", "replies"));
  if (s.reactions) out.push(count(s.reactions, "reaction", "reactions"));
  if (s.reposts) out.push(count(s.reposts, "repost", "reposts"));
  return out;
}
