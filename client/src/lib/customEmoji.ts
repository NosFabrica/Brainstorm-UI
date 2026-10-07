/**
 * NIP-30 custom emoji: `:shortcode:` in an event's text is drawn as the
 * picture its `["emoji", shortcode, url]` tag names. An event without emoji
 * tags has nothing to replace, so its text is never scanned; a shortcode with
 * no tag stays the words the author typed.
 *
 * The shortcode syntax and the tag lookup are applesauce's (`Tokens.emoji`,
 * `getEmojiTag`, the same pair `applesauce-content`'s `emojis()` transformer
 * uses), so this reads emoji exactly as the rest of the applesauce stack does.
 */

import { getEmojiTag, getReactionEmoji } from "applesauce-common/helpers/emoji";
import { Tokens } from "applesauce-core/helpers/regexp";

export type CustomEmoji = { code: string; url: string };

export type EmojiPiece = { type: "text"; value: string } | { type: "emoji"; value: string; code: string; url: string };

type Tagged = { tags: string[][] } | string[][] | undefined;

function tagsOf(src: Tagged): string[][] {
  if (!src) return [];
  return Array.isArray(src) ? src : src.tags;
}

const isPicture = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

/** Whether the event declares any emoji worth drawing — the switch for every renderer below. */
export function hasCustomEmoji(src: Tagged): boolean {
  return tagsOf(src).some((t) => t[0] === "emoji" && !!t[1] && isPicture(t[2]));
}

/** The picture for one shortcode, with or without its colons, or null. */
export function customEmoji(src: Tagged, code: string): CustomEmoji | null {
  const tag = getEmojiTag(tagsOf(src), code);
  return tag && isPicture(tag[2]) ? { code: tag[1], url: tag[2] } : null;
}

/**
 * Text cut into runs and emoji. Without emoji tags the whole text comes back
 * as one run, so callers can always map the result.
 */
export function splitCustomEmoji(text: string, src: Tagged): EmojiPiece[] {
  if (!text) return [];
  if (!hasCustomEmoji(src)) return [{ type: "text", value: text }];
  const tags = tagsOf(src);
  const out: EmojiPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(Tokens.emoji)) {
    const emoji = customEmoji(tags, m[1]);
    if (!emoji) continue;
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", value: text.slice(last, at) });
    out.push({ type: "emoji", value: m[0], code: emoji.code, url: emoji.url });
    last = at + m[0].length;
  }
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
 * text run (never in code) becomes an image whose alt and title are the
 * shortcode. Pair it with `isCustomEmojiImage` in the `img` component to draw
 * those inline rather than as a figure.
 */
export function remarkCustomEmoji(src: Tagged) {
  const tags = tagsOf(src);
  return () => (tree: MdNode) => {
    if (!hasCustomEmoji(tags)) return;
    const walk = (node: MdNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child): MdNode[] => {
        if (child.type !== "text") {
          walk(child);
          return [child];
        }
        return splitCustomEmoji(child.value ?? "", tags).map((p) =>
          p.type === "text"
            ? { type: "text", value: p.value }
            : { type: "image", url: p.url, alt: `:${p.code}:`, title: `:${p.code}:` },
        );
      });
    };
    walk(tree);
  };
}

/** An `<img>` from `remarkCustomEmoji`: one the event's own emoji tag names. */
export function isCustomEmojiImage(
  src: Tagged,
  img: { src?: unknown; alt?: unknown; title?: unknown },
): CustomEmoji | null {
  if (typeof img.alt !== "string" || img.alt !== img.title) return null;
  const m = /^:([a-zA-Z0-9_-]+):$/.exec(img.alt);
  const emoji = m ? customEmoji(src, m[1]) : null;
  return emoji && emoji.url === img.src ? emoji : null;
}
