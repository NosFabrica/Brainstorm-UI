/**
 * Kind 1063 file metadata read for the Media tab. The kind is generic — Zap
 * Store APKs, blobs and pictures all ride it — so a file earns a media card
 * only by declaring a media mime, and not when it is a by-product of media
 * that is already in the results.
 */
type EventLike = { kind: number; tags: string[][] };

const tagVal = (e: EventLike, k: string) => e.tags.find((t) => t[0] === k)?.[1] ?? "";

export function fileMime(event: EventLike): string {
  return tagVal(event, "m");
}

/** A picture, a video or a sound — the file kinds the Media tab means. */
export function isMediaFile(event: EventLike): boolean {
  return /^(image|video|audio)\//.test(fileMime(event));
}

/**
 * Divine publishes each clip's soundtrack as its own kind-1063 audio file so
 * other creators can reuse the sound (`allow_audio_reuse`, an `a` back to the
 * 34236 video). Probed 2026-09-04: "Oh No!!", audio/wav, 6.3 s. It is audio,
 * and it duplicates a video the results already carry — so it is not a result.
 */
export function isSoundtrackFile(event: EventLike): boolean {
  if (event.kind !== 1063 || !fileMime(event).startsWith("audio/")) return false;
  const pointsAtVideo = event.tags.some((t) => t[0] === "a" && /^3423[56]:/.test(t[1] ?? ""));
  return pointsAtVideo || tagVal(event, "allow_audio_reuse") === "true";
}
