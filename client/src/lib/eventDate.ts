/**
 * The date a row, a card or a tile shows for an event: when it was first
 * published, where its spec says so in `published_at`. A NIP-71 video
 * (`publishedAtOf` in lib/nip71): a restored classic Vine is signed the day it
 * was imported, and `published_at` is the day it was posted. A NIP-23 article
 * or draft: every edit is signed anew, and `published_at` is "the first time
 * the article was published" — the date its own page shows. Every other kind
 * keeps `created_at`.
 */
import { VIDEO_KINDS, publishedAtOf } from "@/lib/nip71";

/** The kinds whose spec dates them by a `published_at` tag. */
const PUBLISHED_AT_KINDS: ReadonlySet<number> = new Set([...VIDEO_KINDS, 30023, 30024]);

export function postedAtOf(event: { kind: number; created_at: number; tags: string[][] }): number {
  return PUBLISHED_AT_KINDS.has(event.kind) ? publishedAtOf(event) : event.created_at;
}
