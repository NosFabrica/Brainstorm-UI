/**
 * When a private message deserves a nudge, and what the nudge says. Pure, so
 * the rules are tested apart from the browser's Notification and audio APIs
 * (components/messages/DmNotifications).
 *
 * Only messages written while the tab is open count — history coming in from
 * the cache or a relay's back pages is not news. Nothing for the reader's own
 * messages, reactions, muted or archived chats, low-trust or flagged senders,
 * or the chat they are looking at.
 */
import type { DmMessage } from "./store";
import type { RoomShelf } from "./inbox";
import { CHAT_KIND, FILE_KIND } from "./giftWrap";
import { fileLabel } from "./rooms";

export interface NotifyContext {
  me: string;
  /** Messages written before this (seconds) are history. */
  since: number;
  /** Where the room sits now; undefined when it isn't shown (blocked, deleted, archived). */
  shelfOf(room: string): RoomShelf | undefined;
  mutedRooms: ReadonlySet<string>;
  /** The room on screen, if the tab is visible. */
  viewing: string | null;
}

/** A sender's clock may run a little behind ours. */
export const CLOCK_SLACK_SECONDS = 120;

export function notifiable(m: DmMessage, ctx: NotifyContext): boolean {
  if (m.author === ctx.me || m.outgoing) return false;
  if (m.kind !== CHAT_KIND && m.kind !== FILE_KIND) return false;
  if (m.createdAt < ctx.since - CLOCK_SLACK_SECONDS) return false;
  if (ctx.viewing === m.room || ctx.mutedRooms.has(m.room)) return false;
  const shelf = ctx.shelfOf(m.room);
  return shelf === "chat" || shelf === "request";
}

export function notificationText(
  m: DmMessage,
  opts: { sender: string; group?: string; request: boolean; preview: boolean },
): { title: string; body: string } {
  const title = opts.request
    ? `Message request from ${opts.sender}`
    : opts.group
      ? `${opts.sender} in ${opts.group}`
      : opts.sender;
  if (!opts.preview || opts.request) return { title, body: "New private message" };
  const body = m.kind === FILE_KIND ? fileLabel(m.rumor) : m.rumor.content.replace(/\s+/g, " ").trim();
  return { title, body: body.length > 140 ? `${body.slice(0, 139)}…` : body };
}
