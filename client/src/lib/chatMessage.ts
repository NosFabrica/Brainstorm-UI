/**
 * Where a chat message was said, read only as each spec says it:
 *
 * - **42, NIP-28 channel message**: the `e` marked `root` is the kind-40
 *   channel it was sent to, the `e` marked `reply` the message it answers
 *   (NIP-10 markers). A message whose `e` tags carry no markers uses NIP-10's
 *   deprecated positional scheme — the first `e` is the root, so the channel;
 *   the production relay's kind 42s mostly do (probed 2026-11-25).
 * - **1311, NIP-53 live chat message**: the `a` tag is the activity — a
 *   30311 stream ("Clients MUST include the `a` tag"); an `e` is the direct
 *   parent message.
 * - **9, NIP-C7 chat message**: a reply quotes its parent with a `q` tag. In a
 *   NIP-29 relay group it carries the group's id in an `h` tag; the group's
 *   name is in a 39000 the hosting relay signs, which no tag here names.
 */
import { chatParentOf, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";

export const CHANNEL_MESSAGE_KIND = 42;
export const LIVE_CHAT_KIND = 1311;
export const CHAT_MESSAGE_KIND = 9;
export const CHAT_KINDS: ReadonlySet<number> = new Set([CHAT_MESSAGE_KIND, CHANNEL_MESSAGE_KIND, LIVE_CHAT_KIND]);

const HEX64 = /^[0-9a-f]{64}$/i;
const relayOf = (t: string[] | undefined) =>
  t && typeof t[2] === "string" && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined;

export type ChatPlace =
  /** A NIP-28 channel: its kind-40 creation event. */
  | { type: "channel"; id: string; relay?: string }
  /** A NIP-53 live activity: the stream's address. */
  | { type: "stream"; address: AddressRef }
  /** A NIP-29 relay group, by its id. */
  | { type: "group"; id: string };

export interface ChatContext {
  place: ChatPlace | null;
  /** The message this one answers, when it answers one. */
  replyTo: { id: string; relay?: string } | null;
}

export function chatContextOf(ev: Pick<MinimalEvent, "kind" | "tags"> & Partial<MinimalEvent>): ChatContext | null {
  if (!CHAT_KINDS.has(ev.kind)) return null;
  const tags = ev.tags ?? [];
  const eTags = tags.filter((t) => t[0] === "e" && HEX64.test(t[1] ?? "") && t[3] !== "mention");
  if (ev.kind === CHANNEL_MESSAGE_KIND) {
    const marked = eTags.some((t) => t[3] === "root" || t[3] === "reply");
    const root = marked ? eTags.find((t) => t[3] === "root") : eTags[0];
    const reply = marked ? eTags.find((t) => t[3] === "reply") : eTags.length > 1 ? eTags.at(-1) : undefined;
    return {
      place: root ? { type: "channel", id: root[1].toLowerCase(), relay: relayOf(root) } : null,
      replyTo: reply && reply !== root ? { id: reply[1].toLowerCase(), relay: relayOf(reply) } : null,
    };
  }
  if (ev.kind === LIVE_CHAT_KIND) {
    const a = tags.find((t) => t[0] === "a" && (t[1] ?? "").startsWith("30311:"));
    const [, pubkey, ...rest] = (a?.[1] ?? "").split(":");
    const parent = eTags.find((t) => t[3] === "reply") ?? eTags[0];
    return {
      place:
        a && HEX64.test(pubkey ?? "")
          ? {
              type: "stream",
              address: {
                kind: 30311,
                pubkey: pubkey.toLowerCase(),
                identifier: rest.join(":"),
                relays: relayOf(a) ? [relayOf(a)!] : undefined,
              },
            }
          : null,
      replyTo: parent ? { id: parent[1].toLowerCase(), relay: relayOf(parent) } : null,
    };
  }
  const group = tags.find((t) => t[0] === "h" && t[1]?.trim())?.[1]?.trim();
  const parent = chatParentOf({ id: "", pubkey: "", created_at: 0, content: "", ...ev } as MinimalEvent);
  return {
    place: group ? { type: "group", id: group } : null,
    replyTo: parent ? { id: parent.id.toLowerCase(), relay: parent.relay } : null,
  };
}
