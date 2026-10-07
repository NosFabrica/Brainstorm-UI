/**
 * NIP-30 custom emoji: `:shortcode:` in an event's text is drawn as the
 * picture its `["emoji", shortcode, url]` tag names. An event without emoji
 * tags has nothing to replace, so its text is never scanned; a shortcode with
 * no tag stays the words the author typed.
 *
 * Reads emoji the way applesauce does (`getEmojiTag`, `Tokens.emoji`): the
 * shortcode is `[a-zA-Z0-9_-]+`, matched without regard to case, and the first
 * tag for a shortcode wins.
 */

import { getReactionEmoji } from "applesauce-common/helpers/emoji";
import { Tokens } from "applesauce-core/helpers/regexp";

export type CustomEmoji = { code: string; url: string };

export type EmojiPiece = { type: "text"; value: string } | { type: "emoji"; value: string; code: string; url: string };

/** An event's emoji by lowercased shortcode. */
export type EmojiMap = ReadonlyMap<string, CustomEmoji>;

type Tagged = { tags: string[][] } | string[][] | undefined;

function tagsOf(src: Tagged): string[][] {
  if (!src) return [];
  return Array.isArray(src) ? src : src.tags;
}

const isPicture = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

// One map per tag array: every text run, markdown node and name of an event
// asks with the same tags, and a pack's list can run to hundreds.
const maps = new WeakMap<string[][], EmojiMap | null>();

/** The event's emoji, or null when it declares none worth drawing — the switch for every renderer. */
export function emojiMap(src: Tagged): EmojiMap | null {
  if (!src) return null;
  const tags = tagsOf(src);
  let map = maps.get(tags);
  if (map === undefined) {
    const m = new Map<string, CustomEmoji>();
    for (const t of tags) {
      if (t[0] !== "emoji" || !t[1] || !isPicture(t[2])) continue;
      const key = t[1].toLowerCase();
      if (!m.has(key)) m.set(key, { code: t[1], url: t[2] });
    }
    map = m.size ? m : null;
    maps.set(tags, map);
  }
  return map;
}

/** Whether the event declares any emoji worth drawing. */
export function hasCustomEmoji(src: Tagged): boolean {
  return emojiMap(src) !== null;
}

/** The picture for one shortcode, with or without its colons, or null. */
export function customEmoji(src: Tagged | EmojiMap | null, code: string): CustomEmoji | null {
  const map = src instanceof Map ? (src as EmojiMap) : emojiMap(src as Tagged);
  return map?.get(code.replace(/^:|:$/g, "").toLowerCase()) ?? null;
}

const SHORTCODE = Tokens.emoji.source;

/**
 * Text cut into runs and emoji. Without emoji the whole text comes back as one
 * run, so callers can always map the result.
 */
export function splitCustomEmoji(text: string, src: Tagged | EmojiMap | null): EmojiPiece[] {
  if (!text) return [];
  const map = src instanceof Map ? (src as EmojiMap) : emojiMap(src as Tagged);
  if (!map || !text.includes(":")) return [{ type: "text", value: text }];
  const re = new RegExp(SHORTCODE, "g");
  const out: EmojiPiece[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const emoji = map.get(m[1].toLowerCase());
    if (!emoji) {
      // Its closing colon may open the next one: "10:00:wave:".
      re.lastIndex = m.index + m[0].length - 1;
      continue;
    }
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "emoji", value: m[0], code: emoji.code, url: emoji.url });
    last = m.index + m[0].length;
  }
  if (last === 0) return [{ type: "text", value: text }];
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/**
 * A kind-7 reaction's custom emoji (`:shortcode:` as the whole content, NIP-30
 * §Kind 7), or null for a "+", a unicode emoji, or a shortcode with no tag.
 */
export function reactionEmoji(ev: { content: string; tags: string[][] }): CustomEmoji | null {
  const e = getReactionEmoji(ev as Parameters<typeof getReactionEmoji>[0]);
  return e && isPicture(e.url) ? { code: e.shortcode, url: e.url } : null;
}

/** The mdast this plugin walks: a node, its children, and a text run's value. */
type MdNode = { type: string; value?: string; children?: MdNode[]; url?: string; alt?: string; title?: string };

/**
 * A remark plugin drawing NIP-30 emoji in markdown: each `:shortcode:` in a
 * text run becomes an image whose alt and title are the shortcode. Code is not
 * text, so it keeps its colons; nor are links, whose text the renderer compares
 * with their address (a bare URL is drawn as a card or a picture). Pair it with
 * `isCustomEmojiImage` in the `img` component to draw those inline.
 */
export function remarkCustomEmoji(src: Tagged) {
  const map = emojiMap(src);
  return () => (tree: MdNode) => {
    if (!map) return;
    const walk = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child): MdNode[] => {
        if (child.type === "link" || child.type === "linkReference") return [child];
        if (child.type !== "text") {
          walk(child);
          return [child];
        }
        return splitCustomEmoji(child.value ?? "", map).map((p) =>
          p.type === "text"
            ? { type: "text", value: p.value }
            : { type: "image", url: p.url, alt: `:${p.code}:`, title: `:${p.code}:` },
        );
      });
    };
    walk(tree);
  };
}

/**
 * An `<img>` from `remarkCustomEmoji`: alt and title both the `:shortcode:` of
 * an emoji the event declares. Matched by shortcode, not by `src` — markdown
 * percent-encodes the address on its way to the element.
 */
export function isCustomEmojiImage(src: Tagged, img: { alt?: unknown; title?: unknown }): CustomEmoji | null {
  if (typeof img.alt !== "string" || img.alt !== img.title) return null;
  const m = /^:([a-zA-Z0-9_-]+):$/.exec(img.alt);
  return m ? customEmoji(src, m[1]) : null;
}
