/**
 * What a decrypted attachment really is, from its first bytes, never from the
 * `file-type` its sender wrote. A blob: URL is same-origin and is served with
 * the type we give the Blob, so an attachment labelled image/svg+xml (or one
 * labelled image/png that is really SVG) opened as a page runs its script on
 * our origin, beside the reader's keys. Only the raster formats below can't
 * carry script; everything else is offered as a download.
 */

export type RasterImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif";

const RASTER: ReadonlySet<string> = new Set<RasterImageType>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

/** Whether `mime` is one of the types `rasterImageType` answers. */
export const isRasterImageType = (mime: string): mime is RasterImageType => RASTER.has(mime);

const ascii = (bytes: Uint8Array, at: number, text: string) =>
  bytes.length >= at + text.length && [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

/** The ISO-BMFF `ftyp` box names AVIF as its major brand or one of its compatible brands. */
function isAvif(bytes: Uint8Array): boolean {
  if (!ascii(bytes, 4, "ftyp")) return false;
  const size = Math.min(bytes.length, ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
  if (ascii(bytes, 8, "avif") || ascii(bytes, 8, "avis")) return true;
  for (let at = 16; at + 4 <= size; at += 4) if (ascii(bytes, at, "avif") || ascii(bytes, at, "avis")) return true;
  return false;
}

/** The raster image type `bytes` start with, or null when they are anything else. */
export function rasterImageType(bytes: Uint8Array): RasterImageType | null {
  if (bytes[0] === 0x89 && ascii(bytes, 1, "PNG\r\n\x1a\n")) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return "image/gif";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  if (isAvif(bytes)) return "image/avif";
  return null;
}
