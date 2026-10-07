import { Fragment, useMemo, useState } from "react";

import type { Components } from "react-markdown";
import type { PluggableList } from "unified";

import { eventStore } from "@/lib/eventStore";
import { emojiMap, isCustomEmojiImage, remarkCustomEmoji, splitCustomEmoji, type CustomEmoji } from "@/lib/customEmoji";

/**
 * One NIP-30 emoji, inline at the height of the text around it. A picture that
 * will not load says its `:shortcode:` instead of leaving a hole in the line.
 *
 * The original URL, not the image proxy: its presets crop to a box or resize to
 * a width, and an emoji is small, often animated, and rarely square.
 */
export function CustomEmojiImg({ code, url, className = "" }: CustomEmoji & { className?: string }) {
  // The address that failed, not a flag: a row that re-renders with another emoji tries that one.
  const [failed, setFailed] = useState<string>();
  if (failed === url) return <>:{code}:</>;
  return (
    <img
      src={url}
      alt={`:${code}:`}
      title={`:${code}:`}
      loading="lazy"
      draggable={false}
      data-testid="custom-emoji"
      className={`not-prose m-0 inline-block h-[1.25em] w-auto max-w-[3.5em] object-contain align-[-0.25em] ${className}`}
      onError={() => setFailed(url)}
    />
  );
}

/**
 * Text from an event with its `:shortcode:` emoji drawn (NIP-30). Pass the
 * event (or its tags) the text came from; without emoji tags this is the
 * plain string.
 */
export function EmojiText({
  text,
  tags,
}: {
  text: string | undefined;
  tags: { tags: string[][] } | string[][] | undefined;
}) {
  const pieces = useMemo(() => splitCustomEmoji(text ?? "", emojiMap(tags)), [text, tags]);
  if (pieces.length <= 1 && pieces[0]?.type !== "emoji") return <>{text}</>;
  return (
    <>
      {pieces.map((p, i) =>
        p.type === "emoji" ? (
          <CustomEmojiImg key={`${i}:${p.url}`} code={p.code} url={p.url} />
        ) : (
          <Fragment key={i}>{p.value}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * react-markdown's plugins and components with an event's NIP-30 emoji drawn
 * inline. Without emoji tags the caller's own (module-level) pair comes back
 * unchanged, so a memoized body is not re-parsed for nothing.
 */
export function useMarkdownEmoji(
  tags: string[][] | undefined,
  remarkPlugins: PluggableList,
  components: Components,
): { remarkPlugins: PluggableList; components: Components; tags: string[][] | undefined } {
  const emoji = useMemo(() => (emojiMap(tags) ? tags : undefined), [tags]);
  return useMemo(() => {
    if (!emoji) return { remarkPlugins, components, tags: undefined };
    return {
      remarkPlugins: [...remarkPlugins, remarkCustomEmoji(emoji)],
      components: {
        ...components,
        img({ node: _node, ...props }) {
          const e = isCustomEmojiImage(emoji, props);
          return e ? <CustomEmojiImg code={e.code} url={e.url} /> : <img {...props} />;
        },
      },
      tags: emoji,
    };
  }, [emoji, remarkPlugins, components]);
}

/**
 * A person's name (or bio) with their NIP-30 emoji drawn. The emoji tags are
 * on their kind-0, read from the store copy the name came from.
 *
 * A plain read, not a subscription: this wraps every name in every list, and
 * whatever shows the name re-renders when their profile lands. A name with no
 * `:` reads nothing. A name the search API sent for someone the store has no
 * profile for keeps its shortcodes as text.
 */
export function ProfileEmojiText({ pubkey, text }: { pubkey: string | undefined; text: string | undefined }) {
  const kind0 = pubkey && text?.includes(":") ? eventStore.getReplaceable(0, pubkey) : undefined;
  return <EmojiText text={text} tags={kind0} />;
}
