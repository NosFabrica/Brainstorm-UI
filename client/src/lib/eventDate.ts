/**
 * The date a row, a card or a tile shows for an event. A NIP-71 video is
 * dated by when it was published (`publishedAtOf` in lib/nip71): a restored
 * classic Vine is signed the day it was imported, and `published_at` is the
 * day it was posted. Every other kind keeps `created_at`.
 */
import { VIDEO_KINDS, publishedAtOf } from "@/lib/nip71";

export function postedAtOf(event: { kind: number; created_at: number; tags: string[][] }): number {
  return VIDEO_KINDS.has(event.kind) ? publishedAtOf(event) : event.created_at;
}
