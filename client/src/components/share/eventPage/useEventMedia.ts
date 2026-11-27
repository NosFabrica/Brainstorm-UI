import { useMemo } from "react";
import { mediaItemsOf, type MediaItem } from "@/lib/mediaKind";
import type { MinimalEvent } from "@/lib/noteRefs";

export interface EventPageMedia {
  /** Every file the event carries, each drawn as what it is. */
  items: MediaItem[];
  /** What the media draws, the words beside it leave out (NoteContent `skipUrls`). */
  urls: Set<string>;
  /** Under a note card, only the files its text never mentions. */
  imetaOnly: MediaItem[];
  /** A picture post's own title (NIP-68 kind 20), above its pictures. */
  title: string | undefined;
}

/**
 * The files a kind with no hero of its own carries (a kind-20 picture post, a
 * comment's imeta), each drawn as what it is — every one of them, its words'
 * links too, so a sensitive post is one cover and one lightbox, each with its alt.
 * A repost's tags are the reposted note's business, not files of its own.
 */
export function useEventMedia(note: MinimalEvent | null | undefined): EventPageMedia {
  const items = useMemo(() => (note && note.kind !== 6 && note.kind !== 16 ? mediaItemsOf(note) : []), [note]);
  const urls = useMemo(() => new Set(items.map((item) => item.url)), [items]);
  // Under a note card, only the files its text never mentions: the card draws
  // every linked file itself, extensionless Blossom links included.
  const imetaOnly = useMemo(
    () => (note ? items.filter((item) => !note.content.includes(item.url)) : []),
    [note, items],
  );
  const title = note?.tags.find((t) => t[0] === "title")?.[1]?.trim();
  return { items, urls, imetaOnly, title };
}
